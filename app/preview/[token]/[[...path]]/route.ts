import { sql } from '@/lib/db';
import { getSite, getPageByPath, renderPage, type BsPage } from '@/lib/bodyshop';

// Share links for unpublished changes (/preview/<token>/<path>). Anyone with the link sees the
// draft of every page on that site, including new pages, until the link expires. Not cached,
// never indexed, and links inside the page stay within the preview.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; path?: string[] }> }) {
  const { token, path = [] } = await params;
  const [t] = await sql<{ site_id: number; expires_at: string; slug: string }[]>`
    select v.site_id, v.expires_at, s.slug from bs_previews v join bs_sites s on s.id = v.site_id where v.token = ${token}`;
  const page404 = (msg: string, status = 404) => new Response(
    `<!doctype html><title>${msg}</title><p style="font-family:sans-serif;padding:40px">${msg}</p>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } });
  if (!t) return page404('This preview link doesn’t exist.');
  if (new Date(t.expires_at) < new Date()) return page404('This preview link has expired. Ask for a new one.', 410);
  const site = (await getSite(t.slug))!;
  const p = '/' + path.map(decodeURIComponent).join('/') + (path.length ? '/' : '');
  let page: BsPage | null = await getPageByPath(site.id, p);
  if (!page && p.endsWith('/')) page = await getPageByPath(site.id, p.slice(0, -1));
  if (!page) return page404('That page isn’t on this site.');
  const html = renderPage(site, page, 'draft', { linkBase: `/preview/${token}` })
    .replace('<body>', '<body><div style="background:#b8922f;color:#fff;font:600 13px/1.4 sans-serif;text-align:center;padding:6px">Preview of unpublished changes</div>');
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
