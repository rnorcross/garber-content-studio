// sitemap.xml and robots.txt for the body shop sites. On a shop's own domain, middleware.ts
// rewrites /sitemap.xml and /robots.txt to /s/<slug>/..., which these routes answer.
import { unstable_cache } from 'next/cache';
import { getSite, listSitemapPages, ROSTER } from './bodyshop';

/** The address search engines should use: the shop's bare domain, matching the pages' canonicals. */
function originFor(slug: string, domains: string[]) {
  const bare = domains.find((d) => !d.startsWith('www.')) ?? ROSTER.find((r) => r.slug === slug)?.domain;
  return bare ? `https://${bare}` : null;
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const sitemapXml = (slug: string) =>
  unstable_cache(
    async () => {
      const site = await getSite(slug);
      if (!site) return null;
      const origin = originFor(slug, site.domains);
      if (!origin) return null;
      const pages = (await listSitemapPages(site.id)).filter((p) => !p.noindex);
      const urls = pages.map((p) => {
        const lastmod = p.published_at ? `<lastmod>${new Date(p.published_at).toISOString()}</lastmod>` : '';
        return `  <url><loc>${xmlEsc(origin + p.path)}</loc>${lastmod}</url>`;
      });
      return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    },
    ['bs-sitemap', process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'local', slug],
    { tags: [`bs:${slug}`] },
  )();

export const robotsTxt = (slug: string) =>
  unstable_cache(
    async () => {
      const site = await getSite(slug);
      if (!site) return null;
      const origin = originFor(slug, site.domains);
      return `User-agent: *\nAllow: /\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`;
    },
    ['bs-robots', process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'local', slug],
    { tags: [`bs:${slug}`] },
  )();

export const SEO_HEADERS = { 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' };
