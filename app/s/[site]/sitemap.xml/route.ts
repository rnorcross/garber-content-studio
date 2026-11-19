import { sitemapXml, SEO_HEADERS } from '@/lib/bodyshop-seo';

// garbercollisionsaginaw.com/sitemap.xml → /s/saginaw/sitemap.xml (middleware.ts).
// Lists every published page on the shop's own domain; updates when someone publishes.
export async function GET(_req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const xml = await sitemapXml(site);
  if (!xml) return new Response('Not found', { status: 404 });
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', ...SEO_HEADERS } });
}
