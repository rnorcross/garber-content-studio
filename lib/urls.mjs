// Standard page addresses on the dealer sites. A template's URL pattern is a path where
// {dealer} is the dealership name in lowercase-with-dashes (Garber Buick → garber-buick).
export const DEFAULT_URL_PATTERNS = {
  about: '/dealership/about.htm',
  reviews: '/{dealer}-dealership-reviews.htm',
  community: '/{dealer}-commitment-to-community.htm',
  mission: '/{dealer}-mission-vision-values.htm',
  history: '/{dealer}-history-of-our-dealership.htm',
};

export const dealerSlug = (name) =>
  String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Path for a page, e.g. /garber-buick-dealership-reviews.htm. Null when the template has no pattern. */
export function standardPath(pattern, dealerName) {
  if (!pattern) return null;
  if (pattern.includes('{dealer}') && !dealerName) return null;
  const p = pattern.replace(/\{dealer\}/g, dealerSlug(dealerName)).trim();
  return p.startsWith('/') ? p : `/${p}`;
}

/** Full URL on the dealer's website (or just the path when the website isn't known). */
export function standardUrl(pattern, dealer) {
  const path = standardPath(pattern, dealer?.name);
  if (!path) return null;
  const site = String(dealer?.website || '').trim().replace(/\/+$/, '');
  return site ? `${site}${path}` : path;
}

/** True when a URL points at the standard path (ignores domain, trailing slash, case). */
export function matchesStandard(url, pattern, dealerName) {
  const path = standardPath(pattern, dealerName);
  if (!path || !url) return false;
  try {
    const u = url.startsWith('/') ? new URL(url, 'https://x') : new URL(url);
    return u.pathname.replace(/\/+$/, '').toLowerCase() === path.toLowerCase();
  } catch {
    return false;
  }
}
