import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';

// A page's current HTML, for pulling content into another page with Ask Claude.
export const GET = route<IdCtx>(async (_req, _user, ctx) => {
  const id = await idOf(ctx);
  const [p] = await sql<{ id: number; title: string; html: string }[]>`
    select p.id, p.title, v.html from pages p
    join page_versions v on v.page_id = p.id and v.number = p.current_version
    where p.id = ${id}`;
  if (!p) return fail('Page not found', 404);
  return json(p);
});
