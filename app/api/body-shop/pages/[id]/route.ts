import { revalidateTag } from 'next/cache';
import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';
import { getPage, editId, norm, type BsSite, type Edit } from '@/lib/bodyshop';

// One endpoint for everything the page editor does, picked by `action`.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idOf(ctx);
  const page = await getPage(id);
  if (!page) return fail('Page not found', 404);
  const [site] = await sql<BsSite[]>`select * from bs_sites where id = ${page.site_id}`;
  const b = await req.json();
  const stamp = { at: new Date().toISOString(), by: user.name };

  switch (b.action) {
    case 'edit': {
      // A text or image change made in the preview. Scope "site" applies it to every page.
      const scope: 'page' | 'site' = b.scope === 'site' ? 'site' : 'page';
      let e: Edit;
      if (b.kind === 'text') {
        if (!b.tag || !/^[a-z0-9]+$/.test(b.tag)) return fail('Bad element');
        e = { id: editId(), kind: 'text', tag: b.tag, from: norm(String(b.from || '')), to: String(b.to ?? ''), scope, ...stamp };
      } else if (b.kind === 'img') {
        if (!b.from || !b.to) return fail('Pick an image');
        e = { id: editId(), kind: 'img', from: String(b.from), to: String(b.to), scope, ...stamp };
      } else return fail('Unknown change');
      if (!e.from) return fail('Nothing to change');
      // Editing something that was already edited: the earlier edit's text is what's on screen.
      const list: Edit[] = scope === 'site' ? site.edits : page.edits;
      const prior = list.find((x) => x.kind === e.kind && (x as any).tag === (e as any).tag && (e.kind === 'img' ? x.to === e.from : norm(x.to.replace(/<[^>]+>/g, ' ')) === e.from));
      const next = prior
        ? list.map((x) => (x === prior ? { ...x, to: e.to, ...stamp } : x))
        : [...list.filter((x) => !(x.kind === e.kind && x.from === e.from && (x as any).tag === (e as any).tag)), e];
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
      for (const k of ['title', 'description'] as const) if (k in b) {
        const v = String(b[k] ?? '').trim();
        if (v) meta[k] = v; else delete meta[k];
      }
      await sql`update bs_pages set meta = ${sql.json(meta)}, updated_at = now() where id = ${id}`;
      return json({ ok: true });
    }
    case 'publish': {
      // Publishes this page's changes and any site-wide changes (those reach every page).
      await sql.begin(async (tx) => {
        await tx`update bs_pages set live_edits = edits, live_meta = meta, published_at = now(), published_by = ${user.name} where id = ${id}`;
        await tx`update bs_sites set live_edits = edits, published_at = now() where id = ${site.id}`;
        await tx`insert into bs_publishes (site_id, page_id, snapshot, note, user_name)
          values (${site.id}, ${id}, ${sql.json({ page: { edits: page.edits, meta: page.meta }, site: { edits: site.edits } } as any)}, ${b.note ?? null}, ${user.name})`;
      });
      revalidateTag(`bs:${site.slug}`);
      return json({ ok: true });
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
