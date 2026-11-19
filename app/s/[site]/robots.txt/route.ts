import { robotsTxt, SEO_HEADERS } from '@/lib/bodyshop-seo';

// garbercollisionsaginaw.com/robots.txt → /s/saginaw/robots.txt (middleware.ts).
export async function GET(_req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const txt = await robotsTxt(site);
  if (!txt) return new Response('Not found', { status: 404 });
  return new Response(txt, { headers: { 'content-type': 'text/plain; charset=utf-8', ...SEO_HEADERS } });
}
