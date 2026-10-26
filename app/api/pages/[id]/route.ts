import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';

const str = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());

// Update page details: title, dealership, template, live URL, notes, meta fields, status.
export const PATCH = route<IdCtx>(async (req, _user, ctx) => {
  const id = await idOf(ctx);
  const b = await req.json();
  const [page] = await sql`select id from pages where id = ${id}`;
  if (!page) return fail('Page not found', 404);

  const fields: Record<string, unknown> = {};
  if (typeof b.title === 'string' && b.title.trim()) fields.title = b.title.trim();
  if ('dealershipId' in b) fields.dealership_id = b.dealershipId ? Number(b.dealershipId) : null;
  if (typeof b.pageType === 'string') fields.page_type = b.pageType;
  if ('liveUrl' in b) fields.live_url = str(b.liveUrl);
  if ('notes' in b) fields.notes = str(b.notes);
  if ('metaTitle' in b) fields.meta_title = str(b.metaTitle);
  if ('metaDescription' in b) fields.meta_description = str(b.metaDescription);
  if ('canonical' in b) fields.canonical_url = str(b.canonical);
  if (['draft', 'live', 'archived'].includes(b.status)) fields.status = b.status;
  if (!Object.keys(fields).length) return json({ ok: true });

  await sql`update pages set ${sql(fields)}, updated_at = now() where id = ${id}`;
  return json({ ok: true });
});
