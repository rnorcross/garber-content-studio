import { sql, addVersion } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { toFragment } from '@/lib/fragment';

// Create a page with its first version (generated or imported).
export const POST = route(async (req, user) => {
  const b = await req.json();
  const title = String(b.title || '').trim();
  const html = toFragment(String(b.html || ''));
  if (!title) return fail('Give the page a title');
  if (!html) return fail('The page has no HTML yet');
  const source = b.source === 'imported' ? 'imported' : 'generated';
  const dealershipId = b.dealershipId ? Number(b.dealershipId) : null;

  const [{ id }] = await sql<{ id: number }[]>`
    insert into pages (dealership_id, title, page_type, live_url, notes, created_by)
    values (${dealershipId}, ${title}, ${String(b.pageType || 'custom')}, ${b.liveUrl || null}, ${b.notes || null}, ${user.id})
    returning id`;
  await addVersion(id, html, source, user.id, { prompt: b.prompt || null, note: source === 'imported' ? 'Imported' : 'First draft' });
  return json({ id });
});
