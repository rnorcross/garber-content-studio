import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';
import { saveHtml } from '@/lib/pages';

const SOURCES = ['edited', 'ai-edit', 'restored', 'imported', 'generated'] as const;

// Save a new version of a page.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idOf(ctx);
  const b = await req.json();
  if (!String(b.html || '').trim()) return fail('Nothing to save');
  const source = SOURCES.includes(b.source) ? b.source : 'edited';
  const [page] = await sql`select id from pages where id = ${id}`;
  if (!page) return fail('Page not found', 404);
  const number = await saveHtml(id, String(b.html), source, user.id, { prompt: b.prompt || null, note: b.note || null });
  return json({ number });
});

// Version history (without HTML bodies).
export const GET = route<IdCtx>(async (_req, _user, ctx) => {
  const id = await idOf(ctx);
  const rows = await sql`
    select v.number, v.source, v.note, v.prompt, v.created_at, length(v.html) as size, u.name as author
    from page_versions v left join users u on u.id = v.created_by
    where v.page_id = ${id} order by v.number desc`;
  return json(rows);
});
