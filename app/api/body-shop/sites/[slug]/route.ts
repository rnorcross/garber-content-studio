import { revalidateTag } from 'next/cache';
import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { getSite, editId, brokenEdits, type BsPage, type Edit } from '@/lib/bodyshop';
import { cleanInfo } from '@/lib/bodyshop-info';

type Ctx = { params: Promise<{ slug: string }> };

// Site-wide actions: find & replace across every page, removing a site-wide change,
// publishing every page at once, and the domains the site answers on.
export const POST = route<Ctx>(async (req, user, ctx) => {
  const site = await getSite((await ctx.params).slug);
  if (!site) return fail('Site not found', 404);
  const b = await req.json();

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
      const pages = await sql<Pick<BsPage, 'id' | 'edits' | 'meta'>[]>`select id, edits, meta from bs_pages where site_id = ${site.id}`;
      await sql.begin(async (tx) => {
        await tx`update bs_pages set live_edits = edits, live_meta = meta, published_at = now(), published_by = ${user.name}
          where site_id = ${site.id} and (live_edits <> edits or live_meta <> meta)`;
        await tx`update bs_sites set live_edits = edits, live_info = info, published_at = now() where id = ${site.id}`;
        await tx`insert into bs_publishes (site_id, page_id, snapshot, note, user_name)
          values (${site.id}, null, ${sql.json({ site: { edits: site.edits, info: site.info }, pages: pages.map((p) => ({ id: p.id, edits: p.edits, meta: p.meta })) } as any)}, 'Published whole site', ${user.name})`;
      });
      revalidateTag(`bs:${site.slug}`);
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
    case 'domains': {
      const domains = String(b.domains ?? '').split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
      await sql`update bs_sites set domains = ${domains} where id = ${site.id}`;
      return json({ ok: true });
    }
  }
  return fail('Unknown action');
});
