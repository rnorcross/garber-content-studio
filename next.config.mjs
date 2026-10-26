/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['postgres', 'bcryptjs'],
  // The Setup route reads the starter content from disk; make sure Vercel bundles it.
  outputFileTracingIncludes: {
    '/api/setup': ['./seed/**/*', './lib/schema.sql'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
};
export default nextConfig;
