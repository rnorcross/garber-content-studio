import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';
import { cleanTemplate } from '@/lib/templates';

// Update a template (admins). The slug stays fixed so existing pages keep their link to it.
export const PATCH = route<IdCtx>(async (req, _user, ctx) => {
  const id = await idOf(ctx);
  const t = cleanTemplate(await req.json());
  if (!t.name) return fail('Name the template');
  if (!t.brief) return fail('Write the brief Claude should follow');
  await sql`
    update templates set name = ${t.name}, description = ${t.description}, brief = ${t.brief}, fields = ${sql.json(t.fields)},
      reference_page_id = ${t.reference_page_id}, default_canonical = ${t.default_canonical}, url_pattern = ${t.url_pattern}, active = ${t.active},
      sort = ${t.sort}, updated_at = now()
    where id = ${id}`;
  return json({ ok: true });
}, { admin: true });
