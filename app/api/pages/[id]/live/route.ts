import { sql, type LiveEvent } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';

// Record that a version is now live on the dealer site — who, when, which version, where.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idOf(ctx);
  const b = await req.json();
  const [v] = await sql`select number from page_versions where page_id = ${id} and number = ${Number(b.version)}`;
  if (!v) return fail('Version not found', 404);
  const liveUrl = b.liveUrl ? String(b.liveUrl).trim() : null;
  const [event] = await sql<LiveEvent[]>`
    insert into live_events (page_id, version, live_url, note, user_id, user_name)
    values (${id}, ${v.number}, ${liveUrl}, ${b.note ? String(b.note).trim() : null}, ${user.id}, ${user.name})
    returning id, page_id, version, live_url, note, user_name, created_at`;
  await sql`
    update pages set live_version = ${v.number}, live_marked_at = ${event.created_at}, live_marked_by = ${user.id},
      live_url = coalesce(${liveUrl}, live_url), status = 'live', updated_at = now()
    where id = ${id}`;
  return json(event);
});

// The live log, newest first.
export const GET = route<IdCtx>(async (_req, _user, ctx) => {
  const id = await idOf(ctx);
  return json(await sql<LiveEvent[]>`
    select id, page_id, version, live_url, note, user_name, created_at
    from live_events where page_id = ${id} order by created_at desc`);
});
