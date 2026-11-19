import { revalidateTag } from 'next/cache';
import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { randomBytes } from 'node:crypto';
import { getSite, editId, brokenEdits, cleanPath, publishSite, canPublish, type BsPage, type Edit, type Announce } from '@/lib/bodyshop';
import { cleanInfo } from '@/lib/bodyshop-info';

type Ctx = { params: Promise<{ slug: string }> };

// Site-wide actions: find & replace across every page, removing a site-wide change,
// publishing every page at once, and the domains the site answers on.
export const POST = route<Ctx>(async (req, user, ctx) => {
  const site = await getSite((await ctx.params).slug);
  if (!site) return fail('Site not found', 404);
  const b = await req.json();
  // Anything that changes what visitors see right away needs publish rights.
  if (['publish-all', 'schedule', 'redirect-add', 'redirect-remove', 'redirect-wordpress', 'domains'].includes(b.action) && !(await canPublish(user))) {
    return fail('Publishing needs an admin or a teammate with publish rights. Use “Ask to publish”.', 403);
  }

  switch (b.action) {
    case 'replace': {
      const from = String(b.from ?? ''), to = String(b.to ?? '');
      if (from.trim().length < 2) return fail('Enter the text to find (2+ characters)');
      const e: Edit = { id: editId(), kind: 'replace', from, to, scope: 'site', at: new Date().toISOString(), by: user.name };
      await sql`update bs_sites set edits = ${sql.json([...site.edits.filter((x) => !(x.kind === 'replace' && x.from === from)), e] as any)} where id = ${site.id}`;
      return json({ ok: true });
    }
    case 'remove': {
      await sql`update bs_sites set edits = ${sql.json(site.edits.filter((x) => x.id !== b.id) as any)} where id = ${site.id}`;
      return json({ ok: true });
    }
    case 'publish-all': {
      await publishSite(site.id, user.name);
      return json({ ok: true });
    }
    case 'schedule': {
      // Publish everything at a set time (cron, with page views as a backstop). null cancels.
      const at = b.at ? new Date(b.at) : null;
      if (at && (isNaN(+at) || +at < Date.now() - 60_000)) return fail('Pick a time in the future');
      await sql`update bs_sites set publish_at = ${at}, publish_by = ${at ? user.name : null} where id = ${site.id}`;
      return json({ ok: true });
    }
    case 'announce': {
      const a: Announce = {};
      const t = (v: unknown, n = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
      a.text = t(b.text, 240); a.linkText = t(b.linkText, 40); a.href = t(b.href, 500);
      for (const k of ['start', 'end'] as const) { const v = t(b[k]); if (v && !isNaN(Date.parse(v))) a[k] = new Date(v).toISOString(); }
      a.color = (['navy', 'red', 'gold', 'green'] as const).find((c) => c === b.color) ?? 'navy';
      if (a.href && !/^(https?:\/\/|\/|tel:)/.test(a.href)) return fail('Links start with https://, / or tel:');
      await sql`update bs_sites set announce = ${sql.json((a.text ? a : {}) as any)} where id = ${site.id}`;
      return json({ ok: true });
    }
    case 'preview-link': {
      const days = Math.min(Math.max(Number(b.days) || 7, 1), 30);
      const token = randomBytes(12).toString('base64url');
      await sql`insert into bs_previews (token, site_id, created_by, expires_at) values (${token}, ${site.id}, ${user.name}, now() + ${days + ' days'}::interval)`;
      return json({ ok: true, url: `/preview/${token}/`, days });
    }
    case 'request': {
      await sql`insert into bs_requests (site_id, page_id, note, user_name) values (${site.id}, null, ${String(b.note || '').slice(0, 500) || null}, ${user.name})`;
      return json({ ok: true });
    }
    case 'copy-edits': {
      // Copy site-wide edits to other shops' drafts.
      const pick = site.edits.filter((e) => (b.ids ?? []).includes(e.id));
      const targets: string[] = Array.isArray(b.targets) ? b.targets.map(String) : [];
      for (const slug of targets) {
        if (slug === site.slug) continue;
        const [t] = await sql<{ id: number; edits: Edit[] }[]>`select id, edits from bs_sites where slug = ${slug}`;
        if (!t) continue;
        const stamp = { at: new Date().toISOString(), by: user.name };
        await sql`update bs_sites set edits = ${sql.json([...t.edits, ...pick.map((e) => ({ ...e, id: editId(), ...stamp }))] as any)} where id = ${t.id}`;
      }
      return json({ ok: true });
    }
    case 'info': {
      // Site Info draft: name, phone, address, hours, map, social links, form recipients.
      const info = cleanInfo(b.info ?? {});
      await sql`update bs_sites set info = ${sql.json(info as any)} where id = ${site.id}`;
      return json({ ok: true });
    }
    case 'check': {
      // Edits that no longer match anything, per page (and site-wide edits that match nowhere).
      const pages = await sql<BsPage[]>`select * from bs_pages where site_id = ${site.id} order by path`;
      const siteIds = new Set(site.edits.map((e) => e.id));
      const siteHit = new Set<string>();
      const out: { id: number; path: string; title: string; broken: number }[] = [];
      for (const p of pages) {
        const miss = brokenEdits(site, p);
        for (const id of siteIds) if (!miss.has(id)) siteHit.add(id);
        const own = p.edits.filter((e) => miss.has(e.id)).length;
        if (own) out.push({ id: p.id, path: p.path, title: p.title, broken: own });
      }
      const siteBroken = site.edits.filter((e) => !siteHit.has(e.id)).map((e) => e.id);
      return json({ pages: out, siteBroken });
    }
    case 'redirect-add': {
      const from = cleanPath(String(b.from || ''));
      let to = String(b.to || '').trim();
      if (from === '/' || from.length < 2) return fail('Enter the old address, like /about-rf-collision/');
      if (!to) return fail('Enter where it should go');
      if (!/^https?:\/\//.test(to)) to = cleanPath(to);
      if (to === from) return fail('A redirect can’t point to itself');
      await sql`insert into bs_redirects (site_id, from_path, to_path, note, created_by)
        values (${site.id}, ${from}, ${to}, ${b.note ? String(b.note) : null}, ${user.name})
        on conflict (site_id, from_path) do update set to_path = excluded.to_path, note = excluded.note`;
      revalidateTag(`bs:${site.slug}`);
      return json({ ok: true });
    }
    case 'redirect-remove': {
      await sql`delete from bs_redirects where site_id = ${site.id} and id = ${Number(b.id)}`;
      revalidateTag(`bs:${site.slug}`);
      return json({ ok: true });
    }
    case 'redirect-wordpress': {
      // The addresses WordPress sites have that the new site doesn't.
      const rules: [string, string][] = [
        ['/feed/', '/'], ['/comments/feed/', '/'], ['/wp-admin/*', '/'], ['/wp-login.php', '/'],
        ['/category/*', '/'], ['/author/*', '/'], ['/tag/*', '/'], ['/page/*', '/'],
        ['/wp-content/*', '/'], ['/xmlrpc.php', '/'],
      ];
      for (const [f, t] of rules) await sql`insert into bs_redirects (site_id, from_path, to_path, note, created_by)
        values (${site.id}, ${f}, ${t}, ${'WordPress address'}, ${user.name}) on conflict (site_id, from_path) do nothing`;
      revalidateTag(`bs:${site.slug}`);
      return json({ ok: true });
    }
    case 'asset-base': {
      // After the browser has copied the site's images and video to Blob: point the pages at them.
      // null switches back to the copies in the app (/sites/<slug>/).
      if (user.role !== 'admin') return fail('Admins only', 403);
      const base = b.base ? String(b.base).replace(/\/$/, '') : null;
      if (base && !new RegExp(`^https://[a-z0-9.-]+\\.blob\\.vercel-storage\\.com/body-shop/${site.slug}/assets$`, 'i').test(base)) return fail('That isn’t this site’s Blob folder');
      await sql`update bs_sites set asset_base = ${base} where id = ${site.id}`;
      revalidateTag(`bs:${site.slug}`);
      return json({ ok: true });
    }
    case 'domains': {
      const domains = String(b.domains ?? '').split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
      await sql`update bs_sites set domains = ${domains} where id = ${site.id}`;
      return json({ ok: true });
    }
  }
  return fail('Unknown action');
});
