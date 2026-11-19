import { revalidateTag } from 'next/cache';
import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';
import { getPage, getSite, editId, norm, cleanPath, duplicatePage, canPublish, type BsSite, type Edit } from '@/lib/bodyshop';

// One endpoint for everything the page editor does, picked by `action`.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idOf(ctx);
  const page = await getPage(id);
  if (!page) return fail('Page not found', 404);
  const [site] = await sql<BsSite[]>`select * from bs_sites where id = ${page.site_id}`;
  const b = await req.json();
  const stamp = { at: new Date().toISOString(), by: user.name };
  // Anything that changes what visitors see right away needs publish rights.
  if (['publish', 'status', 'delete'].includes(b.action) && !(await canPublish(user))) {
    return fail('You can save drafts, but publishing needs an admin or a teammate with publish rights. Use “Ask to publish”.', 403);
  }

  switch (b.action) {
    case 'edit': {
      // A change made in the preview. Scope "site" applies it to every page.
      const scope: 'page' | 'site' = b.scope === 'site' ? 'site' : 'page';
      // Only this copy, when the same text/image/link appears more than once on the page.
      // Never for site-wide edits: the count differs from page to page.
      const nth = scope === 'page' && Number.isInteger(b.nth) && b.nth >= 0 ? { nth: b.nth as number } : {};
      let e: Edit;
      if (b.kind === 'text') {
        if (!b.tag || !/^[a-z0-9]+$/.test(b.tag)) return fail('Bad element');
        e = { id: editId(), kind: 'text', tag: b.tag, from: norm(String(b.from || '')), to: String(b.to ?? ''), scope, ...nth, ...stamp };
      } else if (b.kind === 'img') {
        if (!b.from || !b.to) return fail('Pick an image');
        e = { id: editId(), kind: 'img', from: String(b.from), to: String(b.to), scope, ...nth, ...stamp };
      } else if (b.kind === 'link') {
        const to = String(b.to ?? '').trim();
        if (!to) return fail('Enter where the link should go');
        if (!/^(https?:\/\/|\/|tel:|mailto:|#)/i.test(to)) return fail('Links start with https://, /, tel: or mailto:');
        e = { id: editId(), kind: 'link', from: String(b.from ?? ''), to, scope, ...nth, newTab: !!b.newTab, ...stamp };
      } else if (b.kind === 'hide') {
        if (!b.tag || !/^[a-z0-9]+$/.test(b.tag)) return fail('Bad element');
        e = { id: editId(), kind: 'hide', tag: b.tag, from: norm(String(b.from || '')), scope, ...nth, label: String(b.label || '').slice(0, 80), ...stamp };
      } else if (b.kind === 'dup') {
        if (!b.tag || !/^[a-z0-9]+$/.test(b.tag)) return fail('Bad element');
        const to = String(b.to ?? '').trim();
        if (!to) return fail('Enter the new item’s text');
        e = { id: editId(), kind: 'dup', tag: b.tag, from: norm(String(b.from || '')), leaf: norm(String(b.leaf || '')), to, scope, ...nth, ...stamp };
      } else if (b.kind === 'alt') {
        if (!b.from) return fail('Pick an image');
        e = { id: editId(), kind: 'alt', from: String(b.from), to: String(b.to ?? '').trim(), scope, ...stamp };
      } else return fail('Unknown change');
      if (!e.from && e.kind !== 'link') return fail('Nothing to change');

      // Editing something that was already edited: what's on screen is the earlier edit's
      // result, so update that edit instead of stacking a second one on top.
      const list: Edit[] = scope === 'site' ? site.edits : page.edits;
      const shown = (x: Edit) => (x.kind === 'text' ? norm(x.to.replace(/<[^>]+>/g, ' ')) : (x as any).to);
      const prior = e.kind === 'hide' || e.kind === 'dup' ? undefined : list.find((x) => x.kind === e.kind && (e.kind === 'alt'
        ? x.from === e.from
        : shown(x) === e.from && (x.kind !== 'text' || x.tag === (e as any).tag)));
      const next = prior
        ? list.map((x) => (x === prior ? { ...x, to: (e as any).to, ...(e.kind === 'link' ? { newTab: (e as any).newTab } : {}), ...stamp } as Edit : x))
        : [...list.filter((x) => !(x.kind === e.kind && x.from === e.from && (x as any).tag === (e as any).tag && (x as any).nth === (e as any).nth)), e];
      if (scope === 'site') await sql`update bs_sites set edits = ${sql.json(next as any)} where id = ${site.id}`;
      else await sql`update bs_pages set edits = ${sql.json(next as any)}, updated_at = now() where id = ${id}`;
      return json({ ok: true });
    }
    case 'remove': {
      const scope = b.scope === 'site' ? 'site' : 'page';
      if (scope === 'site') await sql`update bs_sites set edits = ${sql.json(site.edits.filter((x) => x.id !== b.id) as any)} where id = ${site.id}`;
      else await sql`update bs_pages set edits = ${sql.json(page.edits.filter((x) => x.id !== b.id) as any)}, updated_at = now() where id = ${id}`;
      return json({ ok: true });
    }
    case 'meta': {
      const meta = { ...page.meta };
      for (const k of ['title', 'description', 'ogImage'] as const) if (k in b) {
        const v = String(b[k] ?? '').trim();
        if (v) meta[k] = v; else delete meta[k];
      }
      if ('noindex' in b) { if (b.noindex) meta.noindex = true; else delete meta.noindex; }
      await sql`update bs_pages set meta = ${sql.json(meta)}, updated_at = now() where id = ${id}`;
      return json({ ok: true });
    }
    case 'publish': {
      // Publishes this page's changes and any site-wide changes (those reach every page).
      await sql.begin(async (tx) => {
        await tx`update bs_pages set live_edits = edits, live_meta = meta, published_at = now(), published_by = ${user.name},
          status = case when status = 'draft' then 'live' else status end where id = ${id}`;
        await tx`update bs_sites set live_edits = edits, live_info = info, live_announce = announce, published_at = now() where id = ${site.id}`;
        await tx`update bs_requests set resolved_at = now(), resolved_by = ${user.name} where site_id = ${site.id} and (page_id = ${id} or page_id is null) and resolved_at is null`;
        await tx`insert into bs_publishes (site_id, page_id, snapshot, note, user_name)
          values (${site.id}, ${id}, ${sql.json({ page: { edits: page.edits, meta: page.meta }, site: { edits: site.edits, info: site.info } } as any)}, ${b.note ?? null}, ${user.name})`;
      });
      revalidateTag(`bs:${site.slug}`);
      return json({ ok: true });
    }
    case 'duplicate': {
      const path = cleanPath(String(b.path || ''));
      const title = String(b.title || '').trim();
      if (path === '/' || path.length < 3 || path.includes('*')) return fail('Enter an address for the new page, like /state-farm-collision-repair/');
      if (!title) return fail('Enter a page title');
      const [taken] = await sql`select 1 from bs_pages where site_id = ${site.id} and path = ${path}`;
      if (taken) return fail('A page already has that address');
      const full = (await getSite(site.slug))!;
      const pg = await duplicatePage(full, page, { path, title, description: String(b.description || '').trim() || undefined, headline: String(b.headline || '').trim() || undefined, by: user.name });
      return json({ ok: true, id: pg.id });
    }
    case 'status': {
      // Hide a page (visitors get the redirect, or a 404) or put a hidden page back.
      const status = b.status === 'live' ? 'live' : 'hidden';
      if (status === 'hidden' && page.path === '/') return fail('The home page can’t be hidden');
      await sql.begin(async (tx) => {
        await tx`update bs_pages set status = ${status}, updated_at = now() where id = ${id}`;
        if (status === 'hidden' && b.redirectTo) {
          const to = String(b.redirectTo).trim();
          await tx`insert into bs_redirects (site_id, from_path, to_path, note, created_by)
            values (${site.id}, ${page.path}, ${to}, ${'Page hidden'}, ${user.name})
            on conflict (site_id, from_path) do update set to_path = excluded.to_path`;
        }
        if (status === 'live') await tx`delete from bs_redirects where site_id = ${site.id} and from_path = ${page.path}`;
      });
      revalidateTag(`bs:${site.slug}`);
      return json({ ok: true });
    }
    case 'delete': {
      if (page.path === '/') return fail('The home page can’t be deleted');
      await sql.begin(async (tx) => {
        if (b.redirectTo) {
          await tx`insert into bs_redirects (site_id, from_path, to_path, note, created_by)
            values (${site.id}, ${page.path}, ${String(b.redirectTo).trim()}, ${'Page deleted: ' + page.title}, ${user.name})
            on conflict (site_id, from_path) do update set to_path = excluded.to_path`;
        }
        await tx`delete from bs_pages where id = ${id}`;
      });
      revalidateTag(`bs:${site.slug}`);
      return json({ ok: true });
    }
    case 'request': {
      // An editor without publish rights asks for this page to be published.
      await sql`insert into bs_requests (site_id, page_id, note, user_name) values (${site.id}, ${id}, ${String(b.note || '').slice(0, 500) || null}, ${user.name})`;
      return json({ ok: true });
    }
    case 'copy-to-sites': {
      // Copy one of this page's edits to the page at the same address on other shops (as drafts).
      const e = page.edits.find((x) => x.id === b.id);
      if (!e) return fail('Edit not found');
      const targets: string[] = Array.isArray(b.targets) ? b.targets.map(String) : [];
      const done: string[] = [], missing: string[] = [];
      for (const slug of targets) {
        const [t] = await sql<{ id: number; edits: Edit[] }[]>`
          select p.id, p.edits from bs_pages p join bs_sites s on s.id = p.site_id where s.slug = ${slug} and p.path = ${page.path}`;
        if (!t) { missing.push(slug); continue; }
        await sql`update bs_pages set edits = ${sql.json([...t.edits, { ...e, id: editId(), ...stamp }] as any)}, updated_at = now() where id = ${t.id}`;
        done.push(slug);
      }
      return json({ ok: true, done, missing });
    }
    case 'discard': {
      await sql`update bs_pages set edits = live_edits, meta = live_meta, updated_at = now() where id = ${id}`;
      return json({ ok: true });
    }
    case 'restore': {
      // Puts an earlier publish back as the draft; publishing again makes it live.
      const [p] = await sql<{ snapshot: any }[]>`select snapshot from bs_publishes where id = ${Number(b.publishId)} and page_id = ${id}`;
      if (!p) return fail('That version was not found', 404);
      await sql`update bs_pages set edits = ${sql.json(p.snapshot.page.edits)}, meta = ${sql.json(p.snapshot.page.meta)}, updated_at = now() where id = ${id}`;
      return json({ ok: true });
    }
  }
  return fail('Unknown action');
});
