import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { slugify } from '@/lib/fragment';
import { cleanTemplate } from '@/lib/templates';

// Add a template (admins).
export const POST = route(async (req) => {
  const b = await req.json();
  const t = cleanTemplate(b);
  if (!t.name) return fail('Name the template');
  if (!t.brief) return fail('Write the brief Claude should follow');
  const slug = slugify(b.slug || t.name);
  const [exists] = await sql`select 1 from templates where slug = ${slug}`;
  if (exists) return fail('A template with that name already exists');
  const [{ id }] = await sql<{ id: number }[]>`
    insert into templates (slug, name, description, brief, fields, reference_page_id, default_canonical, url_pattern, active, sort)
    values (${slug}, ${t.name}, ${t.description}, ${t.brief}, ${sql.json(t.fields)}, ${t.reference_page_id}, ${t.default_canonical}, ${t.url_pattern}, ${t.active}, ${t.sort})
    returning id`;
  return json({ id, slug });
}, { admin: true });
