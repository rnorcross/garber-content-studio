// Which body shop site each domain serves. Add a domain here (or in the BODY_SHOP_HOSTS
// environment variable as JSON, e.g. {"garbermidlandbodyshop.com":"midland"}) when its DNS
// points at this Vercel project.
const BUILT_IN: Record<string, string> = {
  'garbercollisionsaginaw.com': 'saginaw',
  'www.garbercollisionsaginaw.com': 'saginaw',
};

export function siteForHost(host: string | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase().split(':')[0];
  let extra: Record<string, string> = {};
  try { extra = JSON.parse(process.env.BODY_SHOP_HOSTS || '{}'); } catch {}
  return extra[h] ?? BUILT_IN[h] ?? null;
}
