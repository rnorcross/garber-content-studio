/** @type {import('next').NextConfig} */
const longCache = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];

const nextConfig = {
  serverExternalPackages: ['postgres', 'bcryptjs'],
  // Body shop URLs end in a slash (/about-garber-collision-center/); the site route handles both forms.
  skipTrailingSlashRedirect: true,
  // The Setup route reads the starter content from disk; make sure Vercel bundles it.
  // Body shop pages are imported from sites/<slug>/pages the first time they're needed.
  outputFileTracingIncludes: {
    '/api/setup': ['./seed/**/*', './lib/schema.sql', './lib/setup.mjs', './lib/dealer-pages.mjs', './lib/urls.mjs'],
    '/**': ['./sites/**/*'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
  async headers() {
    return [
      { source: '/sites/:site/img/:path*', headers: longCache },
      { source: '/sites/:site/fonts/:path*', headers: longCache },
      { source: '/sites/:site/video/:path*', headers: longCache },
      { source: '/sites/:site/og/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
      { source: '/sites/:site/js/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
    ];
  },
};
export default nextConfig;
