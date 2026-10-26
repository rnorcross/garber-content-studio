import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';
import { removeStored } from '@/lib/storage';

// Edit alt text or which dealership a file belongs to.
export const PATCH = route<IdCtx>(async (req, _user, ctx) => {
  const id = await idOf(ctx);
  const b = await req.json();
  const fields: Record<string, unknown> = {};
  if ('alt' in b) fields.alt = b.alt ? String(b.alt).trim() : null;
  if ('dealershipId' in b) fields.dealership_id = b.dealershipId ? Number(b.dealershipId) : null;
  if (Object.keys(fields).length) await sql`update media set ${sql(fields)} where id = ${id}`;
  return json({ ok: true });
});

// Delete a file — refused while any page's current version (or a dealership's OG image) still uses it.
export const DELETE = route<IdCtx>(async (_req, _user, ctx) => {
  const id = await idOf(ctx);
  const [m] = await sql<{ url: string; pathname: string }[]>`select url, pathname from media where id = ${id}`;
  if (!m) return fail('File not found', 404);
  const used = await sql<{ title: string }[]>`
    select p.title from pages p join page_versions v on v.page_id = p.id and v.number = p.current_version
    where position(${m.url} in v.html) > 0 limit 5`;
  const og = await sql<{ name: string }[]>`select name from dealerships where og_image = ${m.url} limit 5`;
  if (used.length || og.length) {
    const where = [...used.map((u) => u.title), ...og.map((d) => `${d.name} (social image)`)].join(', ');
    return fail(`Still in use on: ${where}. Swap it out there first.`, 409);
  }
  await removeStored(m.url, m.pathname);
  await sql`delete from media where id = ${id}`;
  return json({ ok: true });
});
