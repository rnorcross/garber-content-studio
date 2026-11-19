import { unstable_cache } from 'next/cache';
import { getSite, getPageByPath, renderPage, findRedirect, checkSchedulesSoon, type BsPage } from '@/lib/bodyshop';
import { siteForHost } from '@/lib/site-hosts';

// Public body shop pages. A site's own domain is routed here by middleware.ts
// (garbercollisionsaginaw.com/about/ → /s/saginaw/about/); /s/<slug>/... also works
// on the studio's own address, which is how a site is checked before DNS moves.
// Pages are cached until someone publishes, which clears the site's tag.

const render = (slug: string, p: string, ownDomain: boolean) =>
  unstable_cache(
    async () => {
      const site = await getSite(slug);
      if (!site) return null;
      let page: BsPage | null = await getPageByPath(site.id, p);
      if (!page && !p.endsWith('/')) page = await getPageByPath(site.id, p + '/');
      // Draft (never published) and hidden pages aren't served; redirects apply to them.
      if (page && page.status !== 'live') page = null;
      if (!page) {
        const to = await findRedirect(site.id, p);
        if (to) return { status: 301, html: null as string | null, redirect: to as string | null };
        const nf = await getPageByPath(site.id, '/');
        return nf ? { status: 404, html: null as string | null, redirect: null as string | null } : null;
      }
      if (page.path !== p) return { status: 308, html: null, redirect: page.path };
      return { status: 200, html: renderPage(site, page, 'live', { linkBase: ownDomain ? '' : `/s/${slug}` }), redirect: null };
    },
    // Keyed to the deployment, so a new release of the renderer never serves pages cached by the old one.
    ['bs-page', process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'local', slug, p, ownDomain ? 'own' : 'studio'],
    { tags: [`bs:${slug}`] },
  )();

export async function GET(req: Request, { params }: { params: Promise<{ site: string; path?: string[] }> }) {
  const { site, path = [] } = await params;
  checkSchedulesSoon(); // backstop for scheduled publishes if the cron hasn't run yet
  const p = '/' + path.map(decodeURIComponent).join('/') + (path.length ? '/' : '');
  // Judged by the Host header: after middleware's rewrite the path may already read /s/<slug>/.
  const onOwnDomain = siteForHost(req.headers.get('host')) === site;
  const out = await render(site, p, onOwnDomain);
  if (!out) return new Response('Not found', { status: 404 });
  const u = new URL(req.url);
  if (out.redirect) {
    const abs = /^https?:\/\//.test(out.redirect);
    return Response.redirect(abs ? out.redirect : new URL((onOwnDomain ? '' : `/s/${site}`) + out.redirect, u), out.status === 301 ? 301 : 308);
  }
  if (out.status === 404) {
    return new Response('<!doctype html><title>Page not found</title><p style="font-family:sans-serif;padding:40px">Page not found. <a href="' + (onOwnDomain ? '/' : `/s/${site}/`) + '">Go to the home page</a></p>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(out.html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Browsers re-check every time; Vercel's CDN keeps a copy briefly and our cache tag
      // makes a publish show up within seconds.
      'cache-control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=60',
      // The /s/<slug>/ copy on the studio's address is for checking only; keep it out of search
      // so it never competes with the shop's own domain.
      ...(onOwnDomain ? {} : { 'x-robots-tag': 'noindex' }),
    },
  });
}
