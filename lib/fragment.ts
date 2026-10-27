// Client- and server-safe helpers for paste-in HTML fragments.

export type ImageRef = {
  value: string;      // the exact src / url() value in the HTML
  kind: 'img' | 'css' | 'video' | 'poster' | 'source' | 'meta';
  inline: boolean;    // data: URI, not hosted anywhere
  bytes: number;      // approx size for inline images
  count: number;      // how many times it appears
};

const ATTR_RE = /<(img|video|source)\b[^>]*?\s(src|poster)\s*=\s*(["'])(.*?)\3/gi;
const DATA_SRC_RE = /\sdata-src\s*=\s*(["'])([^"']+)\1/gi;
const CSS_URL_RE = /url\(\s*(["']?)([^"')]+?)\1\s*\)/gi;
const META_IMG_RE = /<meta\b[^>]*(?:og:image|twitter:image)[^>]*content\s*=\s*(["'])(.*?)\1/gi;

export function listImages(html: string): ImageRef[] {
  const map = new Map<string, ImageRef>();
  const add = (value: string, kind: ImageRef['kind']) => {
    if (!value || value.startsWith('#') || /\.(woff2?|ttf|otf)(\?|$)/i.test(value)) return;
    const hit = map.get(value);
    if (hit) { hit.count++; return; }
    const inline = value.startsWith('data:');
    map.set(value, { value, kind, inline, bytes: inline ? Math.round(value.length * 0.75) : 0, count: 1 });
  };
  for (const m of html.matchAll(ATTR_RE)) {
    const tag = m[1].toLowerCase();
    add(m[4], m[2].toLowerCase() === 'poster' ? 'poster' : tag === 'img' ? 'img' : tag === 'video' ? 'video' : 'source');
  }
  for (const m of html.matchAll(DATA_SRC_RE)) add(m[2], 'video');
  for (const m of html.matchAll(CSS_URL_RE)) add(m[2], 'css');
  for (const m of html.matchAll(META_IMG_RE)) add(m[2], 'meta');
  return [...map.values()];
}

export function replaceAll(html: string, from: string, to: string) {
  return from ? html.split(from).join(to) : html;
}

/**
 * Swaps every data: URI for a short token so the HTML can be shown in a code
 * editor or sent to Claude without megabytes of base64. restoreInline puts them back.
 */
export function stashInline(html: string, store: string[] = []) {
  const out = html.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi, (m) => {
    const i = store.indexOf(m);
    const idx = i >= 0 ? i : store.push(m) - 1;
    return `inline-image://${idx}`;
  });
  return { html: out, store };
}

export function restoreInline(html: string, store: string[]) {
  return html.replace(/inline-image:\/\/(\d+)/g, (m, i) => store[Number(i)] ?? m);
}

/** Strips code fences and chatter a model may wrap around HTML. */
export function cleanModelHtml(text: string) {
  let t = text.trim();
  const fence = t.match(/```(?:html)?\s*\n([\s\S]*?)\n```/i);
  if (fence) t = fence[1];
  const first = t.search(/<(!--|meta|link|style|div|section|main|article|script)\b/i);
  if (first > 0) t = t.slice(first);
  return t.trim();
}

/** Turns a full HTML document into a paste-in fragment (meta/link/style + body content). */
export function toFragment(html: string) {
  if (!/<html[\s>]|<body[\s>]/i.test(html)) return html.trim();
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const keep = [
    ...head.matchAll(/<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:|twitter:|description)[^>]*>/gi),
    ...head.matchAll(/<link\b[^>]*fonts\.googleapis[^>]*>/gi),
    ...head.matchAll(/<style[\s\S]*?<\/style>/gi),
  ].map((m) => m[0]);
  return [...keep, body.trim()].join('\n');
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Wraps a fragment in a minimal document for the preview iframe. */
export function previewDoc(fragment: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;background:#fff}</style></head><body>${fragment}</body></html>`;
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// --- SEO / social tags -------------------------------------------------------
// Pages are stored WITHOUT social meta tags. The CMS writes them at copy time from the
// page's meta title/description and the dealership's Open Graph image, so they never drift.

const SOCIAL_META_RE = /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:[a-z_:]+|twitter:[a-z_:]+|description)["'][^>]*>\s*/gi;
const CANONICAL_RE = /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>\s*/gi;

function metaContent(html: string, key: string) {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag?.match(/content\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? null;
}

/** Pulls social meta tags and any canonical link out of a fragment. */
export function extractSocialMeta(html: string) {
  const found = {
    title: metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title'),
    description: metaContent(html, 'og:description') ?? metaContent(html, 'description') ?? metaContent(html, 'twitter:description'),
    image: metaContent(html, 'og:image'),
    canonical: html.match(CANONICAL_RE)?.[0]?.match(/href\s*=\s*["']([^"']+)/i)?.[1] ?? null,
  };
  const clean = html.replace(SOCIAL_META_RE, '').replace(CANONICAL_RE, '').replace(/^\s+/, '');
  return { html: clean, ...found };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type HeadInput = {
  siteName: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  url?: string | null;
  canonical?: string | null;
};

/** The tags pasted at the top of the fragment (Dealer.com has no per-page Open Graph setting). */
export function buildHead(h: HeadInput) {
  const tags: string[] = ['<meta property="og:type" content="website">', `<meta property="og:site_name" content="${esc(h.siteName)}">`];
  if (h.title) tags.push(`<meta property="og:title" content="${esc(h.title)}">`);
  if (h.description) tags.push(`<meta property="og:description" content="${esc(h.description)}">`);
  if (h.url) tags.push(`<meta property="og:url" content="${esc(h.url)}">`);
  if (h.image) {
    tags.push(`<meta property="og:image" content="${esc(h.image)}">`);
    if (h.image.startsWith('https:')) tags.push(`<meta property="og:image:secure_url" content="${esc(h.image)}">`);
    tags.push('<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">');
  }
  tags.push('<meta name="twitter:card" content="summary_large_image">');
  if (h.title) tags.push(`<meta name="twitter:title" content="${esc(h.title)}">`);
  if (h.description) tags.push(`<meta name="twitter:description" content="${esc(h.description)}">`);
  if (h.image) tags.push(`<meta name="twitter:image" content="${esc(h.image)}">`);
  if (h.canonical) tags.push(`<link rel="canonical" href="${esc(h.canonical)}">`);
  return tags.join('\n');
}

/** What gets copied into Dealer.com: social tags + the stored fragment. */
export function assemble(fragment: string, head: HeadInput) {
  return `${buildHead(head)}\n${fragment.trim()}\n`;
}

export const GROUP_OG_IMAGE = 'https://assets.garberauto.com/assets/open-graph/open-graph-garber-management-group.jpg';
export const defaultOgImage = (slug: string) => `https://assets.garberauto.com/assets/open-graph/open-graph-${slug}.jpg`;

/** Turns a data: URI into a File for uploading. */
export async function dataUriToFile(uri: string, base = 'embedded') {
  const blob = await (await fetch(uri)).blob();
  const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  let h = 0;
  for (const b of bytes) h = (h * 31 + b) >>> 0;
  return new File([blob], `${base}-${h.toString(16)}.${ext}`, { type: blob.type });
}
