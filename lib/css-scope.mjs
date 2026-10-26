// Scopes a stylesheet to one wrapper class so pasted fragments can't restyle the
// rest of a Dealer.com page. :root, html and body selectors become the wrapper itself.
import postcss from 'postcss';
import prefixer from 'postcss-prefix-selector';

// @import url(...) can itself contain ';' (Google Fonts weight lists)
export const IMPORT_RE = /@import\s+(?:url\([^)]*\)|(["'])[^"']*\1)[^;]*;/g;

const ROOTISH = /^(:root|html|body)(?=$|[\s.:#[>+~,])/;

export function scopeCss(css, scope) {
  const sel = scope.startsWith('.') ? scope : `.${scope}`;
  return postcss([
    prefixer({
      prefix: sel,
      transform(prefix, selector, prefixed) {
        const s = selector.trim();
        if (s.startsWith(prefix)) return s; // already scoped
        if (/^(from|to|\d+%)$/.test(s)) return s; // keyframe steps
        if (ROOTISH.test(s)) {
          // ":root, [data-theme=x]" style chains and "body .x" both land on the wrapper
          const rest = s.replace(ROOTISH, '').replace(/^(\s*(html|body|:root))+/, '');
          return `${prefix}${rest}`;
        }
        return prefixed;
      },
    }),
  ]).process(postcss.parse(css), { from: undefined }).css;
}

/** Scopes every <style> block in an HTML fragment. */
export function scopeStyleTags(html, scope) {
  return html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_, attrs, css) => {
    // @import must stay first and unscoped; hoist imports out of the scoped body
    const imports = [];
    const body = css.replace(IMPORT_RE, (m) => { imports.push(m); return ''; });
    return `<style${attrs}>${imports.join('\n')}${imports.length ? '\n' : ''}${scopeCss(body, scope)}</style>`;
  });
}
