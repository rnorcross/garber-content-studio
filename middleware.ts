import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { siteForHost } from '@/lib/site-hosts';

const ASSET = /^\/(img|js|fonts|og|video)\/|^\/favicon\.webp$/;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // A body shop's own domain: serve that site, never the studio.
  const site = siteForHost(req.headers.get('host'));
  if (site) {
    if (pathname.startsWith('/sites/') || pathname.startsWith('/_next/') || pathname.startsWith('/s/')) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = ASSET.test(pathname) ? `/sites/${site}${pathname}` : `/s/${site}${pathname}`;
    return NextResponse.rewrite(url);
  }

  // Public body shop pages and their files, on the studio's own address.
  if (pathname.startsWith('/s/') || pathname.startsWith('/sites/')) return NextResponse.next();

  const token = req.cookies.get('gcs_session')?.value;
  let ok = false;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      ok = true;
    } catch {}
  }
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Runs on every path except Next's own files; static files under /sites/ are let through above.
  matcher: ['/((?!login|setup|api/setup|api/auth|_next|favicon|icon|garber-logo-white\\.png).*)'],
};
