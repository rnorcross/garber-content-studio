import { sql } from '@/lib/db';
import { route, fail, idOf, type IdCtx } from '@/lib/api';
import { getPage, renderPage, type BsSite } from '@/lib/bodyshop';

// The editor's preview frame. mode=edit adds click-to-edit; mode=draft is the full,
// interactive page as it will look once published; mode=live is what visitors see now.
export const GET = route<IdCtx>(async (req, _user, ctx) => {
  const page = await getPage(await idOf(ctx));
  if (!page) return fail('Page not found', 404);
  const [site] = await sql<BsSite[]>`select * from bs_sites where id = ${page.site_id}`;
  const m = new URL(req.url).searchParams.get('mode');
  const mode = m === 'draft' || m === 'live' ? m : 'edit';
  return new Response(renderPage(site, page, mode), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
});
