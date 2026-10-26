// Client- and server-safe helpers for paste-in HTML fragments.

export type ImageRef = {
  value: string;      // the exact src / url() value in the HTML
  kind: 'img' | 'css' | 'video' | 'poster' | 'source' | 'meta';
  inline: boolean;    // data: URI, not hosted anywhere
  bytes: number;      // approx size for inline images
  count: number;      // how many times it appears
};

const ATTR_RE = /<(img|video|source)\b[^>]*?\s(src|poster)\s*=\s*(["'])(.*?)\3/gi;
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
export function stashInline(html: string) {
  const store: string[] = [];
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
