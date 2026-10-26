/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['postgres', 'bcryptjs'],
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
};
export default nextConfig;
