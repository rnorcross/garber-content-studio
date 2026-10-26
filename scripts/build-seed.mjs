// One-time: turns the captured Garber Buick preview (seed/raw/garber-buick.json) into
// four scoped, paste-ready fragments under seed/pages/. Kept for reference.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scopeCss, IMPORT_RE } from '../lib/css-scope.mjs';

const raw = JSON.parse(readFileSync(new URL('../seed/raw/garber-buick.json', import.meta.url), 'utf8'));
const out = new URL('../seed/pages/', import.meta.url);
mkdirSync(out, { recursive: true });

// Drop the preview's own site chrome (header, footer, page router) before scoping.
const css = raw.css
  .replace(IMPORT_RE, '')
  .replace(/\.site-(header|footer)[^{]*\{[^}]*\}/g, '')
  .replace(/(^|\})\s*main\s*\{[^}]*\}/g, '$1')
  .replace(/\.page(\.active)?\s*\{[^}]*\}/g, '');

const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600&display=swap">';

const VIDEO = (scope) => `
<div id="gcs-video-modal" class="gcs-video-modal" role="dialog" aria-modal="true" aria-label="Customer video">
  <div class="player" id="gcs-video-player"></div>
  <button type="button" id="gcs-video-close" aria-label="Close video">&times;</button>
  <a id="gcs-video-yt" href="#" target="_blank" rel="noopener">Open on YouTube ↗</a>
</div>
<style>
.${scope} .gcs-video-modal{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(4,23,58,.86)}
.${scope} .gcs-video-modal.open{display:flex}
.${scope} .gcs-video-modal .player{position:relative;width:420px;max-width:92vw;height:min(88vh,747px);background:#000;border-radius:24px;overflow:hidden}
.${scope} .gcs-video-modal video,.${scope} .gcs-video-modal iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.${scope} #gcs-video-close{position:absolute;top:24px;right:28px;width:44px;height:44px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;font-size:22px;cursor:pointer}
.${scope} #gcs-video-yt{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.8);font-size:13px}
@media (max-width:640px){.${scope} .gcs-video-modal .player{width:100vw;max-width:100vw;height:100dvh;border-radius:0}}
</style>
<script>
(function(){
  var root=document.querySelector('.${scope}'); if(!root) return;
  var modal=root.querySelector('#gcs-video-modal'), player=root.querySelector('#gcs-video-player'), yt=root.querySelector('#gcs-video-yt');
  function open(id,src){ player.innerHTML='';
    if(src){var v=document.createElement('video');v.src=src;v.controls=true;v.autoplay=true;v.setAttribute('playsinline','');player.appendChild(v);v.play().catch(function(){});}
    else{var f=document.createElement('iframe');f.src='https://www.youtube.com/embed/'+id+'?autoplay=1&playsinline=1&rel=0';f.allow='autoplay; encrypted-media; picture-in-picture';f.allowFullscreen=true;player.appendChild(f);}
    yt.href='https://www.youtube.com/shorts/'+id; modal.classList.add('open'); document.body.style.overflow='hidden'; }
  function close(){ modal.classList.remove('open'); player.innerHTML=''; document.body.style.overflow=''; }
  root.addEventListener('click',function(e){var a=e.target.closest('.js-video'); if(!a||!root.contains(a)) return; e.preventDefault(); open(a.getAttribute('data-video'),a.getAttribute('data-src'));});
  root.querySelector('#gcs-video-close').addEventListener('click',close);
  modal.addEventListener('click',function(e){ if(e.target===modal) close(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&modal.classList.contains('open')) close(); });
})();
</script>`;

const TYPES = { about: 'about', history: 'history', community: 'community', values: 'mission' };
const LIVE = { about: 'https://www.garberbuick.com/about-garber-buick-dealership-in-saginaw-michigan.htm' };
const manifest = [];

// Embedded images become files in seed/assets/, referenced as gcs-asset://<file>.
// The seed uploads each one once (Vercel Blob in production) and swaps in its URL.
const assetsDir = new URL('../seed/assets/', import.meta.url);
mkdirSync(assetsDir, { recursive: true });
const assets = {};
// images that belong to Garber Buick rather than the group (storefront, store logo, testimonial people)
const BUICK_ONLY = ['f2f3700c', 'a3c9a766', 'f4ae99b7', '002531a4', '98b59a06', '590513c2', '87beb801'];
function extractAssets(html) {
  return html.replace(/data:image\/([a-z+]+);base64,([A-Za-z0-9+/=]+)/g, (uri, type, b64) => {
    const md5 = createHash('md5').update(uri).digest('hex');
    const ext = type.replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const file = `${createHash('sha1').update(b64).digest('hex').slice(0, 16)}.${ext}`;
    if (!assets[file]) {
      writeFileSync(new URL(file, assetsDir), Buffer.from(b64, 'base64'));
      assets[file] = { type: `image/${type}`, dealership: BUICK_ONLY.includes(md5.slice(0, 8)) ? 'garber-buick' : null, alt: null };
    }
    const at = html.indexOf(uri);
    const tagStart = html.lastIndexOf('<img', at);
    const tag = tagStart >= 0 && html.lastIndexOf('>', at) < tagStart ? html.slice(tagStart, html.indexOf('>', at + uri.length) + 1) : '';
    const alt = tag.match(/alt="([^"]+)"/)?.[1];
    if (alt && !assets[file].alt) assets[file].alt = alt.replace(/&amp;/g, '&');
    return `gcs-asset://${file}`;
  });
}

for (const p of raw.pages) {
  const scope = `gcs-garber-buick-${TYPES[p.id]}`;
  let body = p.html
    .replace(/\sdata-src="\/_blob\/[0-9a-f]+"/g, ' data-src=""') // preview-only video files → YouTube fallback
    .replace(/\sclass="ds-mount"/g, '')
    .trim();
  const hasVideo = body.includes('js-video');
  const parts = [
    p.id === 'about' ? raw.metas : '',
    FONT,
    `<style>\n${scopeCss(css, scope)}\n</style>`,
    `<div class="${scope}">\n${body}${hasVideo ? VIDEO(scope) : ''}\n</div>`,
  ].filter(Boolean);
  const file = `garber-buick-${p.id}.html`;
  writeFileSync(new URL(file, out), extractAssets(parts.join('\n')));
  manifest.push({
    file, dealership: 'garber-buick', title: `Garber Buick — ${p.title}`, pageType: TYPES[p.id], liveUrl: LIVE[p.id] ?? null,
    notes: 'Imported from the Garber Buick preview site. Images are embedded from the preview; swap in the hosted assets.garberauto.com URLs from the Images tab.'
      + (hasVideo ? ' Testimonial videos play from YouTube; add a hosted MP4 URL to a card’s data-src to play it directly.' : ''),
  });
}
writeFileSync(new URL('manifest.json', out), JSON.stringify(manifest, null, 2));
writeFileSync(new URL('manifest.json', assetsDir), JSON.stringify(assets, null, 2));
console.log(`${Object.keys(assets).length} images → seed/assets/`);
console.log(manifest.map((m) => m.file).join('\n'));
