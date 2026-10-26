import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';

type Ctx = { params: Promise<{ id: string; n: string }> };

// One version's HTML.
export const GET = route<Ctx>(async (_req, _user, ctx) => {
  const { id, n } = await ctx.params;
  const [v] = await sql`select number, html from page_versions where page_id = ${Number(id)} and number = ${Number(n)}`;
  if (!v) return fail('Version not found', 404);
  return json(v);
});
