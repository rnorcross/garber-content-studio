import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';

// Update page details (title, dealership, type, live URL, notes, status).
export const PATCH = route<IdCtx>(async (req, _user, ctx) => {
  const id = await idOf(ctx);
  const b = await req.json();
  const [page] = await sql`select id from pages where id = ${id}`;
  if (!page) return fail('Page not found', 404);

  const fields: Record<string, unknown> = {};
  if (typeof b.title === 'string' && b.title.trim()) fields.title = b.title.trim();
  if ('dealershipId' in b) fields.dealership_id = b.dealershipId ? Number(b.dealershipId) : null;
  if (typeof b.pageType === 'string') fields.page_type = b.pageType;
  if ('liveUrl' in b) fields.live_url = b.liveUrl ? String(b.liveUrl).trim() : null;
  if ('notes' in b) fields.notes = b.notes ? String(b.notes) : null;
  if (['draft', 'live', 'archived'].includes(b.status)) fields.status = b.status;
  if (!Object.keys(fields).length) return json({ ok: true });

  await sql`update pages set ${sql(fields)}, updated_at = now() where id = ${id}`;
  return json({ ok: true });
});
