import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { saveHtml } from '@/lib/pages';
import { getTemplate } from '@/lib/templates';

// Create a page with its first version (generated or imported).
export const POST = route(async (req, user) => {
  const b = await req.json();
  const title = String(b.title || '').trim();
  const html = String(b.html || '');
  if (!title) return fail('Give the page a title');
  if (!html.trim()) return fail('The page has no HTML yet');
  const source = b.source === 'imported' ? 'imported' : 'generated';
  const dealershipId = b.dealershipId ? Number(b.dealershipId) : null;
  const template = await getTemplate(String(b.pageType || 'custom'));
  const canonical = b.canonical?.trim() || template?.default_canonical || null;

  const [{ id }] = await sql<{ id: number }[]>`
    insert into pages (dealership_id, title, page_type, live_url, notes, meta_title, meta_description, canonical_url, created_by)
    values (${dealershipId}, ${title}, ${template?.slug ?? 'custom'}, ${b.liveUrl || null}, ${b.notes || null},
            ${b.metaTitle?.trim() || null}, ${b.metaDescription?.trim() || null}, ${canonical}, ${user.id})
    returning id`;
  await saveHtml(id, html, source, user.id, { prompt: b.prompt || null, note: source === 'imported' ? 'Imported' : 'First draft' });
  return json({ id });
});
