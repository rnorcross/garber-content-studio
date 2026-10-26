import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { slugify } from '@/lib/fragment';

// Add a dealership (admins).
export const POST = route(async (req) => {
  const b = await req.json();
  const name = String(b.name || '').trim();
  if (!name) return fail('Enter the dealership name');
  const slug = slugify(b.slug || name);
  const [exists] = await sql`select 1 from dealerships where slug = ${slug}`;
  if (exists) return fail('That dealership already exists');
  const makes = String(b.makes || '').split(',').map((s) => s.trim()).filter(Boolean);
  const [{ id }] = await sql<{ id: number }[]>`
    insert into dealerships (slug, name, city, makes, website, logo, logo_white, image_h, image_v, notes, sort)
    values (${slug}, ${name}, ${b.city || null}, ${makes}, ${b.website || null}, ${b.logo || null}, ${b.logoWhite || null},
            ${b.imageH || null}, ${b.imageV || null}, ${b.notes || null}, 500)
    returning id`;
  return json({ id, slug });
}, { admin: true });
