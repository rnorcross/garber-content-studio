import { sql } from '@/lib/db';
import { route, json, idOf, type IdCtx } from '@/lib/api';

const str = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());

// Edit a dealership's details and brand assets, including its Open Graph image (admins).
export const PATCH = route<IdCtx>(async (req, _user, ctx) => {
  const id = await idOf(ctx);
  const b = await req.json();
  const map: Record<string, string> = {
    name: 'name', city: 'city', website: 'website', logo: 'logo', logoWhite: 'logo_white',
    imageH: 'image_h', imageV: 'image_v', ogImage: 'og_image', notes: 'notes',
  };
  const fields: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(map)) if (k in b) fields[col] = str(b[k]);
  if ('makes' in b) fields.makes = String(b.makes || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (fields.name === null) delete fields.name;
  if (Object.keys(fields).length) await sql`update dealerships set ${sql(fields)} where id = ${id}`;
  return json({ ok: true });
}, { admin: true });
