import { route, json, fail } from '@/lib/api';
import { scopeStyleTags } from '@/lib/css-scope.mjs';
import { slugify } from '@/lib/fragment';
import { detectScope } from '@/lib/prompt';

/**
 * Makes a fragment safe to paste: wraps its content in one scope class and prefixes
 * every CSS rule with it, so the page can't restyle the dealer site around it.
 */
export const POST = route(async (req) => {
  const { html, name } = await req.json();
  let src = String(html || '');
  if (!src.trim()) return fail('Nothing to scope');

  let scope = detectScope(src);
  if (!scope) {
    scope = `gcs-${slugify(String(name || 'page'))}`;
    // Move head-ish tags (meta, font links, styles) above a new wrapper around the rest.
    const head: string[] = [];
    const rest = src.replace(/<meta\b[^>]*>|<link\b[^>]*>|<style[\s\S]*?<\/style>/gi, (m) => { head.push(m); return ''; });
    src = `${head.join('\n')}\n<div class="${scope}">\n${rest.trim()}\n</div>`;
  }
  return json({ html: scopeStyleTags(src, scope), scope });
});
