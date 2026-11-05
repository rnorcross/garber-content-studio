import { revalidateTag } from 'next/cache';
import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { getSite, editId, type BsPage, type Edit } from '@/lib/bodyshop';

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
        await tx`update bs_sites set live_edits = edits, published_at = now() where id = ${site.id}`;
        await tx`insert into bs_publishes (site_id, page_id, snapshot, note, user_name)
          values (${site.id}, null, ${sql.json({ site: { edits: site.edits }, pages: pages.map((p) => ({ id: p.id, edits: p.edits, meta: p.meta })) } as any)}, 'Published whole site', ${user.name})`;
      });
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
