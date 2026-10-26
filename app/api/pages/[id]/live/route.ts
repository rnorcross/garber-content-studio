import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';

// Record which version is pasted on the live dealer site.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idOf(ctx);
  const { version } = await req.json();
  const [v] = await sql`select number from page_versions where page_id = ${id} and number = ${Number(version)}`;
  if (!v) return fail('Version not found', 404);
  await sql`
    update pages set live_version = ${v.number}, live_marked_at = now(), live_marked_by = ${user.id},
      status = 'live', updated_at = now()
    where id = ${id}`;
  return json({ ok: true });
});
