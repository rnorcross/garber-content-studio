// Body shop websites: storage, import and rendering.
//
// Each body shop site is a set of pre-rendered pages (the approved design, byte for byte) plus
// an overlay of edits. Edits never touch the stored page HTML; they're applied on the way out,
// on the server for the HTML that's sent, and again in the browser after the site's own script
// re-draws a section, so an edit can't be undone by the page's interactive parts.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { revalidateTag } from 'next/cache';
import { sql } from './db';
import { detectInfo, cleanInfo, infoReplacements, infoChanged, type SiteInfo } from './bodyshop-info';

type EditBase = { id: string; scope: 'page' | 'site'; at?: string; by?: string };
/**
 * One change layered over the approved page.
 *   text / img / link / alt match an element by what it shows (tag + text, src, href).
 *   `nth` narrows it to one occurrence on the page (0-based, in page order) when the same
 *   text, image or link appears more than once; without it, every match changes.
 *   replace is a raw find & replace over the whole page, head and search markup included.
 */
export type Edit = EditBase & (
  | { kind: 'text'; tag: string; from: string; to: string; nth?: number }
  | { kind: 'img'; from: string; to: string; nth?: number }
  | { kind: 'link'; from: string; to: string; nth?: number; newTab?: boolean; text?: string }
  | { kind: 'alt'; from: string; to: string; nth?: number }
  | { kind: 'replace'; from: string; to: string }
  // Hide an element (a section, a list item, a card). `from` is its text, `label` is for people.
  | { kind: 'hide'; tag: string; from: string; nth?: number; label?: string }
  // Add a copy of a list item or card right after it, with `leaf` (a text inside it) changed to `to`.
  | { kind: 'dup'; tag: string; from: string; nth?: number; leaf: string; to: string }
  // Styles for one element (`from` is its text, or its src for an image), per device.
  | { kind: 'style'; tag: string; from: string; nth?: number; css: StyleSet; label?: string }
  // Move an element to just after `after` (another element, same matching), or first in its parent.
  | { kind: 'move'; tag: string; from: string; nth?: number; after: Target | null; label?: string }
);

/** An element, the way edits find it: tag plus its text (or src for images), and which copy. */
export type Target = { tag: string; from: string; nth?: number };
/** CSS per device: `all` applies everywhere, `tablet` at 1024px and below, `phone` at 767px and below. */
export type StyleSet = Partial<Record<'all' | 'tablet' | 'phone', Record<string, string>>>;
export const STYLE_PROPS = [
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'text-align', 'color',
  'background-color', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'border-radius', 'max-width', 'display',
] as const;

/** The stylesheet for style edits: one class per edit, !important so it beats the design's inline styles. */
export function styleCss(edits: Edit[]) {
  const rule = (id: string, css?: Record<string, string>) => {
    const body = Object.entries(css ?? {}).filter(([k, v]) => (STYLE_PROPS as readonly string[]).includes(k) && /^[#a-z0-9 .,%()+-]{1,60}$/i.test(v))
      .map(([k, v]) => `${k}:${v}!important`).join(';');
    // #app + the class outranks the design's own rules, including its phone/tablet !important ones.
    return body ? `#app .ws-s-${id}{${body}}` : '';
  };
  const st = edits.filter((e): e is Extract<Edit, { kind: 'style' }> => e.kind === 'style');
  const all = st.map((e) => rule(e.id, e.css.all)).join('');
  const tab = st.map((e) => rule(e.id, e.css.tablet)).join('');
  const pho = st.map((e) => rule(e.id, e.css.phone)).join('');
  return all + (tab ? `@media(max-width:1024px){${tab}}` : '') + (pho ? `@media(max-width:767px){${pho}}` : '');
}

/** Search & social settings for a page. */
export type Meta = { title?: string; description?: string; ogImage?: string; noindex?: boolean };
/** live: served to visitors · draft: new, not published yet · hidden: unpublished (redirects apply). */
export type PageStatus = 'live' | 'draft' | 'hidden';
export type BsRedirect = { id: number; site_id: number; from_path: string; to_path: string; note: string | null; created_by: string | null; created_at: string };

export type BsSite = {
  id: number; slug: string; name: string; city: string | null; domains: string[];
  edits: Edit[]; live_edits: Edit[]; published_at: string | null; created_at: string;
  /** Site Info: draft, what's live, and the values the approved pages were built with. */
  info: SiteInfo; live_info: SiteInfo; info_base: SiteInfo;
  /** Announcement bar: draft and live. */
  announce: Announce; live_announce: Announce;
  /** A scheduled "publish everything", and who set it. */
  publish_at: string | null; publish_by: string | null;
  /** Where the site's images, share images and video live once moved to Blob (else /sites/<slug>). */
  asset_base: string | null;
};

/** A bar across the top of every page: holiday hours, closures, a promotion. */
export type Announce = { text?: string; linkText?: string; href?: string; start?: string; end?: string; color?: 'navy' | 'red' | 'gold' | 'green' };
/** Each site's own image/video files, listed at build time (scripts/asset-manifest.mjs). */
export { default as ASSET_MANIFEST } from './generated/asset-manifest.json';
const ANNOUNCE_BG = { navy: '#002256', red: '#b3261e', gold: '#b8922f', green: '#0a6b45' } as const;
export type BsPage = {
  id: number; site_id: number; path: string; title: string; base_html: string;
  meta: Meta; live_meta: Meta; edits: Edit[]; live_edits: Edit[];
  published_at: string | null; published_by: string | null; updated_at: string;
  status: PageStatus;
};

/** The other shops on garbercollision.com, shown as "not added yet" until they're imported. */
export const ROSTER = [
  { slug: 'saginaw', name: 'Garber Collision Center of Saginaw', city: 'Saginaw, MI', domain: 'garbercollisionsaginaw.com' },
  { slug: 'midland', name: 'Garber Midland Body Shop', city: 'Midland, MI', domain: 'garbermidlandbodyshop.com' },
  { slug: 'saginaw-gratiot', name: 'Garber Saginaw Body Shop', city: 'Saginaw, MI', domain: 'garbersaginawbodyshop.com' },
  { slug: 'bay-city', name: 'Garber Bay City Body Shop', city: 'Bay City, MI', domain: 'garberbaycitybodyshop.com' },
  { slug: 'rochester', name: 'Garber Collision Center', city: 'Rochester, NY', domain: 'garbercollisioncenter.com' },
  { slug: 'rf-collision', name: 'RF Collision', city: 'Canandaigua, NY', domain: 'rfcollision.com' },
  { slug: 'delray', name: 'Collision Center of Delray', city: 'Delray Beach, FL', domain: 'collisioncenterdelray.com' },
  { slug: 'ft-pierce', name: 'Garber Ft. Pierce Body Shop', city: 'Fort Pierce, FL', domain: 'garberftpiercebodyshop.com' },
  { slug: 'green-cove', name: 'Garber Collision Center', city: 'Green Cove Springs, FL', domain: 'garberautomallcollision.com' },
  { slug: 'group', name: 'Garber Collision (group site)', city: 'All locations', domain: 'garbercollision.com' },
];

const SCHEMA = `
create table if not exists bs_sites (
  id            serial primary key,
  slug          text not null unique,
  name          text not null,
  city          text,
  domains       text[] not null default '{}',
  edits         jsonb not null default '[]',
  live_edits    jsonb not null default '[]',
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);
create table if not exists bs_pages (
  id            serial primary key,
  site_id       int not null references bs_sites(id) on delete cascade,
  path          text not null,
  title         text not null,
  base_html     text not null,
  meta          jsonb not null default '{}',
  live_meta     jsonb not null default '{}',
  edits         jsonb not null default '[]',
  live_edits    jsonb not null default '[]',
  published_at  timestamptz,
  published_by  text,
  updated_at    timestamptz not null default now(),
  unique (site_id, path)
);
-- Every publish keeps a snapshot, so any earlier state can be restored.
create table if not exists bs_publishes (
  id          serial primary key,
  site_id     int not null references bs_sites(id) on delete cascade,
  page_id     int references bs_pages(id) on delete cascade,
  snapshot    jsonb not null,
  note        text,
  user_name   text,
  created_at  timestamptz not null default now()
);
create index if not exists bs_publishes_idx on bs_publishes(site_id, created_at desc);
alter table bs_sites add column if not exists info      jsonb not null default '{}';
alter table bs_sites add column if not exists live_info jsonb not null default '{}';
alter table bs_sites add column if not exists info_base jsonb not null default '{}';
alter table bs_pages add column if not exists status text not null default 'live';
create table if not exists bs_redirects (
  id          serial primary key,
  site_id     int not null references bs_sites(id) on delete cascade,
  from_path   text not null,
  to_path     text not null,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (site_id, from_path)
);
alter table bs_sites add column if not exists announce      jsonb not null default '{}';
alter table bs_sites add column if not exists live_announce jsonb not null default '{}';
alter table bs_sites add column if not exists publish_at    timestamptz;
alter table bs_sites add column if not exists publish_by    text;
alter table users add column if not exists bs_publish boolean not null default false;
-- Media uploaded for a body shop site, and where a site's own images/video live once moved to Blob.
alter table media add column if not exists bs_site_id int references bs_sites(id) on delete set null;
alter table bs_sites add column if not exists asset_base text;
-- Share links for unpublished changes: anyone with the link sees the draft, until it expires.
create table if not exists bs_previews (
  token       text primary key,
  site_id     int not null references bs_sites(id) on delete cascade,
  created_by  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
-- "Ask to publish" from editors who can't publish.
create table if not exists bs_requests (
  id          serial primary key,
  site_id     int not null references bs_sites(id) on delete cascade,
  page_id     int references bs_pages(id) on delete cascade,
  note        text,
  user_name   text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
`;

let ready: Promise<void> | null = null;
/** Creates the body shop tables and imports Saginaw the first time anything asks for them. */
export function ensureBodyShop() {
  return (ready ??= (async () => {
    await sql.unsafe(SCHEMA);
    const [has] = await sql`select 1 from bs_sites where slug = 'saginaw'`;
    if (!has) await importSite('saginaw');
  })().catch((e) => { ready = null; throw e; }));
}

function sitesDir() { return path.join(process.cwd(), 'sites'); }

/** Loads a site's pre-rendered pages from sites/<slug>/pages into the database. */
export async function importSite(slug: string) {
  const r = ROSTER.find((x) => x.slug === slug);
  const dir = path.join(sitesDir(), slug, 'pages');
  if (!r || !existsSync(dir)) throw new Error(`No files to import for ${slug}`);
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((f) => {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p); else if (f === 'index.html') files.push(p);
  });
  walk(dir);
  await sql.begin(async (tx) => {
    const [site] = await tx<{ id: number }[]>`
      insert into bs_sites (slug, name, city, domains, published_at)
      values (${slug}, ${r.name}, ${r.city}, ${[r.domain, 'www.' + r.domain]}, now())
      on conflict (slug) do update set name = excluded.name returning id`;
    for (const f of files) {
      const html = readFileSync(f, 'utf8');
      const rel = path.relative(dir, path.dirname(f)).split(path.sep).join('/');
      const p = rel ? `/${rel}/` : '/';
      const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? p).split(' | ')[0].trim();
      await tx`
        insert into bs_pages (site_id, path, title, base_html, published_at, published_by)
        values (${site.id}, ${p}, ${cheerio.load(title).text()}, ${html}, now(), 'Import')
        on conflict (site_id, path) do nothing`;
    }
  });
}

// ---------------------------------------------------------------------------------- rendering

export const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The browser half of the overlay. Kept as a string so the server sends the exact same rules
 * it applied itself (applyServer below). Each element an edit changes is marked with the
 * edit's id in data-ws, so a page the server already edited isn't edited twice, and `nth`
 * counts the same elements in the same order on both sides. When the site's own script
 * re-draws a section, the marks go with the old elements and the edits apply again.
 * __WSL is the link prefix used on the studio's /s/<slug>/ address.
 */
const APPLY_JS = `(function(){var E=window.__WS||[],L=window.__WSL||'';function n(s){return (s||'').replace(/\\s+/g,' ').trim()}
function mk(el){var v=el.getAttribute('data-ws');return v?v.split(' '):[]}
var B=window.__WSB||'',S=window.__WSS||'';function cs(u){u=u||'';if(B&&u.indexOf(B+'/')===0)return u.slice(B.length);if(S&&u.indexOf(S+'/')===0)return u.slice(S.length);return u}
function leaf(r,t){var all=[r].concat(Array.prototype.slice.call(r.querySelectorAll('*'))),hit=null;for(var i=0;i<all.length;i++)if(n(all[i].textContent)===t)hit=all[i];return hit}
function src(e){return e.kind==='img'||e.kind==='alt'||e.tag==='img'}
function sel(e){return e.kind==='link'?'a':src(e)?'img':e.tag}
function same(e,el){return e.kind==='link'?el.getAttribute('href')===e.from:src(e)?cs(el.getAttribute('src'))===cs(e.from):n(el.textContent)===e.from}
function one(root,t){var els=root.querySelectorAll(t.tag==='img'?'img':t.tag),c=0;for(var j=0;j<els.length;j++){var el=els[j];if(el.hasAttribute('data-ws-clone')||!same(t,el))continue;var x=c++;if(t.nth==null||x===t.nth)return el}return null}
window.__wsApply=function(root){root=root||document;
for(var i=0;i<E.length;i++){var e=E[i];if(e.kind==='replace')continue;
var els=root.querySelectorAll(sel(e)),c=0;
for(var j=0;j<els.length;j++){var el=els[j],m=mk(el),done=m.indexOf(e.id)>=0;
if(el.hasAttribute('data-ws-clone'))continue;if(!done&&!same(e,el))continue;
var x=c++;if(e.nth!=null&&x!==e.nth)continue;if(done)continue;
if(e.kind==='text')el.innerHTML=e.to;else if(e.kind==='hide')el.setAttribute('data-ws-hidden','');
else if(e.kind==='style')el.classList.add('ws-s-'+e.id);
else if(e.kind==='move'){if(e.after){var an=one(root,e.after);if(!an||an===el)break;an.parentNode.insertBefore(el,an.nextSibling)}else el.parentNode.insertBefore(el,el.parentNode.firstElementChild)}
else if(e.kind==='dup'){var cl=el.cloneNode(true);cl.removeAttribute('data-ws');cl.setAttribute('data-ws-clone',e.id);var lf=leaf(cl,e.leaf);if(lf)lf.textContent=e.to;el.parentNode.insertBefore(cl,el.nextSibling)}else if(e.kind==='img'){el.setAttribute('src',e.to);el.removeAttribute('srcset')}
else if(e.kind==='alt')el.setAttribute('alt',e.to);
else{el.setAttribute('href',e.to);if(e.newTab===true){el.setAttribute('target','_blank');el.setAttribute('rel','noopener')}else if(e.newTab===false)el.removeAttribute('target')}
m.push(e.id);el.setAttribute('data-ws',m.join(' '));if(e.kind==='move')break}}
if(L){var as=root.querySelectorAll('a[href^="/"]');for(var k=0;k<as.length;k++){var h=as[k].getAttribute('href');if(!/^\\/(\\/|s\\/|sites\\/|preview\\/)/.test(h))as[k].setAttribute('href',L+h)}}};
if(document.readyState!=='loading')window.__wsApply(document.getElementById('app'));else document.addEventListener('DOMContentLoaded',function(){window.__wsApply(document.getElementById('app'))});})();`;

/** The server half of the overlay: the same rules as APPLY_JS, on the parsed page. */
/**
 * An image address without where the site's files are kept, so an edit made when they were
 * under /sites/<slug>/ still matches after they move to Blob (and the other way round).
 */
export function canonSrc(u: string | undefined, base: string, assetBase?: string | null) {
  if (!u) return '';
  if (assetBase && u.startsWith(assetBase + '/')) return u.slice(assetBase.length);
  if (u.startsWith(base + '/')) return u.slice(base.length);
  return u;
}

function applyServer($: cheerio.CheerioAPI, app: cheerio.Cheerio<any>, edits: Edit[], misses?: Set<string>, canon: (u?: string) => string = (u) => u ?? '') {
  const bySrc = (e: { kind?: string; tag?: string }) => e.kind === 'img' || e.kind === 'alt' || e.tag === 'img';
  const selector = (e: any) => (e.kind === 'link' ? 'a' : bySrc(e) ? 'img' : e.tag);
  const same = (e: any, el: cheerio.Cheerio<any>) => (e.kind === 'link' ? el.attr('href') === e.from
    : bySrc(e) ? canon(el.attr('src')) === canon(e.from) : norm(el.text()) === e.from);
  /** The element a Target points at (for `move`), by the same rules. */
  const one = (t: Target) => {
    let c = 0, hit: cheerio.Cheerio<any> | null = null;
    app.find(t.tag === 'img' ? 'img' : t.tag).each((_, node) => {
      if (hit) return;
      const el = $(node);
      if (el.attr('data-ws-clone') !== undefined || !same(t, el)) return;
      const x = c++;
      if (t.nth == null || x === t.nth) hit = el;
    });
    return hit as cheerio.Cheerio<any> | null;
  };
  for (const e of edits) {
    if (e.kind === 'replace') continue;
    let c = 0, hit = 0, stop = false;
    app.find(selector(e)).each((_, node) => {
      if (stop) return;
      const el = $(node);
      if (el.attr('data-ws-clone') !== undefined) return;
      const m = (el.attr('data-ws') || '').split(' ').filter(Boolean);
      const done = m.includes(e.id);
      if (!done && !same(e, el)) return;
      const x = c++;
      if (e.nth != null && x !== e.nth) return;
      if (done) { hit++; return; }
      if (e.kind === 'text') el.html(e.to);
      else if (e.kind === 'hide') el.attr('data-ws-hidden', '');
      else if (e.kind === 'style') el.addClass(`ws-s-${e.id}`);
      else if (e.kind === 'move') {
        // One element per move; the anchor has to exist (and not be the element itself).
        stop = true;
        if (e.after) {
          const an = one(e.after);
          if (!an || an.get(0) === node) return;
          an.after(el);
        } else el.parent().prepend(el);
      }
      else if (e.kind === 'dup') {
        const cl = el.clone().removeAttr('data-ws').attr('data-ws-clone', e.id);
        // The deepest element inside the copy that shows `leaf` gets the new text.
        const lf = [cl, ...cl.find('*').toArray().map((x) => $(x))].filter((x) => norm(x.text()) === e.leaf).pop();
        lf?.text(e.to);
        el.after(cl);
      }
      else if (e.kind === 'img') el.attr('src', e.to).removeAttr('srcset');
      else if (e.kind === 'alt') el.attr('alt', e.to);
      else {
        el.attr('href', e.to);
        if (e.newTab === true) el.attr('target', '_blank').attr('rel', 'noopener');
        else if (e.newTab === false) el.removeAttr('target');
      }
      hit++;
      el.attr('data-ws', [...m, e.id].join(' '));
    });
    if (!hit) misses?.add(e.id);
  }
}

/**
 * Builds the HTML for a page.
 *   live: what visitors get (published edits).
 *   draft: the current unpublished state, fully interactive.
 *   edit: the draft with the site's scripts removed and the click-to-edit layer added.
 * opts.linkBase: prefix for the page's own links (the studio's /s/<slug> address).
 * opts.misses: collects the ids of edits that no longer match anything on the page.
 */
export function renderPage(
  site: Pick<BsSite, 'slug' | 'edits' | 'live_edits'> & Partial<Pick<BsSite, 'info' | 'live_info' | 'info_base' | 'announce' | 'live_announce' | 'asset_base'>>,
  page: BsPage, mode: 'live' | 'draft' | 'edit',
  opts: { linkBase?: string; misses?: Set<string> } = {},
) {
  const live = mode === 'live';
  const edits: Edit[] = [...(live ? site.live_edits : site.edits), ...(live ? page.live_edits : page.edits)];
  const meta: Meta = live ? page.live_meta : page.meta;
  let html = page.base_html;

  // 1. Site Info changes (phone, hours, address...) become exact replacements in every format
  //    the pages use. Then the site's own find & replace edits. Both run over the raw HTML, so
  //    they also reach the head, search markup, phone links and the page script's templates.
  const info = live ? site.live_info : site.info;
  if (site.info_base && info) for (const [a, b] of infoReplacements(site.info_base, info, html)) html = html.split(a).join(b);
  for (const e of edits) if (e.kind === 'replace' && e.from) {
    if (!html.includes(e.from)) opts.misses?.add(e.id);
    html = html.split(e.from).join(e.to);
  }

  // 2. Asset paths: scripts and fonts live under /sites/<slug>/ in this app; images, share images
  //    and video too, unless they've been moved to Blob (asset_base).
  const base = `/sites/${site.slug}`;
  const media = site.asset_base || base;
  html = html
    .replace(/(["'(\s,])\/(img|og|video)\//g, `$1${media}/$2/`)
    .replace(/(["'(\s,])\/(js|fonts)\//g, `$1${base}/$2/`)
    .replace(/(["'])\/favicon\.webp/g, `$1${base}/favicon.webp`)
    .replace(/runtime\.js\?v=[a-z0-9]+/, 'runtime.js?v=ws1');

  const $ = cheerio.load(html);

  // 3. Search & social text.
  if (meta.title) {
    $('title').text(meta.title);
    $('meta[property="og:title"]').attr('content', meta.title);
  }
  if (meta.description) {
    $('meta[name="description"]').attr('content', meta.description);
    $('meta[property="og:description"]').attr('content', meta.description);
  }
  if (meta.ogImage) {
    $('meta[property="og:image"], meta[name="twitter:image"]').attr('content', meta.ogImage);
    $('meta[property="og:image:width"], meta[property="og:image:height"]').remove();
  }
  if (meta.noindex) $('head').append('<meta name="robots" content="noindex">');

  // Announcement bar: outside #app, so the page script never re-draws over it. Start and end
  // times are checked in the browser too, since a cached page can outlive the end time.
  const ann = live ? site.live_announce : site.announce;
  if (ann?.text) $('body').prepend(announceHtml(ann, opts.linkBase));

  // 4. Text, image, link and alt-text edits on the server-rendered page. Style edits are
  //    classes, with their rules in one stylesheet in the head.
  const app = $('#app');
  const css = styleCss(edits);
  if (css) $('head').append(`<style id="ws-styles">${css}</style>`);
  applyServer($, app, edits, opts.misses, (u) => canonSrc(u, base, site.asset_base));

  // 5. On the studio's address, keep the page's own links inside /s/<slug>/. The browser does
  //    the same after the site's script re-draws (APPLY_JS reads __WSL).
  const lb = opts.linkBase || '';
  if (lb) app.find('a[href^="/"]').each((_, el) => {
    const h = $(el).attr('href')!;
    if (!/^\/(\/|s\/|sites\/|preview\/)/.test(h)) $(el).attr('href', lb + h);
  });

  const overlay = edits.filter((e) => e.kind !== 'replace').map((e) => {
    const { at, by, scope, ...rest } = e as any;
    return rest;
  });
  if (mode === 'edit') {
    // No site scripts while editing: they'd re-draw sections out from under the cursor.
    $('script[src*="runtime.js"], script[src*="morphdom"], #dc-defs').remove();
    $('script').filter((_, el) => /googletagmanager|EmbedSocial|video\[data-src\]/.test($(el).html() || '')).remove();
    $('noscript').remove();
    $('head').append(`<style>${EDIT_CSS}</style>`);
    $('body').append(`<script>${EDIT_JS}</script><script>${SELECT_JS}</script>`);
  } else {
    $('head').append('<style>[data-ws-hidden]{display:none!important}</style>');
    $('head').append(`<script>window.__WSB=${JSON.stringify(media)};window.__WSS=${JSON.stringify(base)};window.__WSL=${JSON.stringify(lb)};window.__WS=${JSON.stringify(overlay).replace(/</g, '\\u003c')};${APPLY_JS}</script>`);
    if (!live) $('head').append('<meta name="robots" content="noindex">');
  }
  return $.html();
}

function announceHtml(a: Announce, linkBase = '') {
  const bg = ANNOUNCE_BG[a.color ?? 'navy'] ?? ANNOUNCE_BG.navy;
  const href = a.href && a.href.startsWith('/') && !a.href.startsWith('//') ? linkBase + a.href : a.href;
  const link = href && a.linkText ? ` <a href="${esc(href)}" style="color:#fff;font-weight:700;text-decoration:underline;margin-left:6px">${esc(a.linkText)}</a>` : '';
  const s = a.start ? Date.parse(a.start) : 0, e = a.end ? Date.parse(a.end) : 0;
  return `<div id="ws-announce" data-start="${s || ''}" data-end="${e || ''}" role="region" aria-label="Announcement"
    style="background:${bg};color:#fff;font:600 14px/1.4 Roboto,Arial,sans-serif;text-align:center;padding:10px 16px;position:relative;z-index:60">${esc(a.text!)}${link}</div>
  <script>(function(){var b=document.getElementById('ws-announce'),n=Date.now(),s=+b.dataset.start||0,e=+b.dataset.end||0;if((s&&n<s)||(e&&n>e))b.style.display='none'})();</script>`;
}

/** Edits on a page (its own and the site's) that no longer match anything, by id. */
export function brokenEdits(site: BsSite, page: BsPage) {
  const misses = new Set<string>();
  renderPage(site, page, 'draft', { misses });
  return misses;
}

const EDIT_CSS = `
[data-ws-hidden]{opacity:.32;outline:2px dashed #c2341d !important;outline-offset:-2px}
[data-ws-clone]{outline:2px dashed #0a8754 !important;outline-offset:2px}
[data-ws-pick]{outline:3px solid #b8922f !important;outline-offset:2px}
[data-ws-sel]{outline:2px solid #d63ea8 !important;outline-offset:1px}
[data-ws-drop]{box-shadow:0 -4px 0 #d63ea8 inset !important}
[data-ws-hover]{outline:2px dashed #1122d7 !important;outline-offset:2px;cursor:text}
img[data-ws-hover]{cursor:pointer}
[contenteditable="true"]{outline:2px solid #1122d7 !important;outline-offset:2px;background:rgba(17,34,215,.04)}
a{cursor:text}`;

/** Click-to-edit inside the editor's preview frame. Reports each change to the editor. */
/**
 * Selecting elements in the editor's preview (like a page builder): the Structure tree, the
 * selected element's current styles and parents, and live style previews before saving.
 * Elements are addressed by their position under #app ("0.3.1") between the editor and the frame;
 * edits themselves use the usual tag + text (or src) + nth.
 */
const SELECT_JS = `(function(){
var APP=document.getElementById('app');var ROOT=APP.firstElementChild||APP;
function n(s){return (s||'').replace(/\\s+/g,' ').trim()}
var SKIP=/^(SCRIPT|STYLE|BR|NOSCRIPT|TEMPLATE|svg|SVG|PATH|path)$/;
var LEAF=/^(P|H1|H2|H3|H4|H5|H6|A|BUTTON|IMG|SPAN|LI|LABEL|STRONG|EM|SMALL|VIDEO|INPUT|SELECT|TEXTAREA)$/;
function pathOf(el){var p=[];while(el&&el!==APP){var par=el.parentNode;p.unshift(Array.prototype.indexOf.call(par.children,el));el=par}return p.join('.')}
function byPath(s){var el=APP;if(s!=='')s.split('.').forEach(function(i){el=el&&el.children[+i]});return el}
function key(el){if(el.tagName==='IMG'){var sr=el.getAttribute('src');var l=Array.prototype.filter.call(APP.querySelectorAll('img'),function(x){return x.getAttribute('src')===sr});return {tag:'img',from:sr,nth:l.indexOf(el),count:l.length}}
 var t=n(el.textContent);if(!t)return null;var l2=Array.prototype.filter.call(APP.getElementsByTagName(el.tagName),function(x){return n(x.textContent)===t});return {tag:el.tagName.toLowerCase(),from:t,nth:l2.indexOf(el),count:l2.length}}
function kind(el){var t=el.tagName;if(t==='HEADER')return 'Header';if(t==='FOOTER')return 'Footer';if(t==='NAV')return 'Menu';if(/^H[1-6]$/.test(t))return 'Heading';if(t==='P')return 'Text';if(t==='IMG')return 'Image';if(t==='VIDEO')return 'Video';
 if(t==='A'||t==='BUTTON')return /background|border/.test(el.getAttribute('style')||'')?'Button':'Link';if(t==='UL'||t==='OL')return 'List';if(t==='LI')return 'List item';if(t==='FORM')return 'Form';
 if(t==='SECTION'||el.parentNode===ROOT)return 'Section';return el.children.length?'Container':'Text'}
function label(el){if(el.tagName==='IMG')return el.getAttribute('alt')||'(no alt text)';var h=el.querySelector&&el.querySelector('h1,h2,h3,h4');if(!LEAF.test(el.tagName)&&h)return n(h.textContent);return n(el.textContent)}
function kids(el){return Array.prototype.filter.call(el.children,function(c){return !SKIP.test(c.tagName)&&(c.offsetWidth>0||c.offsetHeight>0||c.hasAttribute('data-ws-hidden'))&&(n(c.textContent)||c.tagName==='IMG'||c.querySelector('img,video'))})}
// Wrappers with one child collapse into that child, so the tree reads like the page.
function down(el){var k=kids(el);while(!LEAF.test(el.tagName)&&k.length===1&&el.parentNode!==ROOT&&el!==ROOT&&!n(Array.prototype.filter.call(el.childNodes,function(x){return x.nodeType===3}).map(function(x){return x.textContent}).join(''))){el=k[0];k=kids(el)}return el}
function tree(){var out=[];function walk(el,d,parentPath){kids(el).forEach(function(c0){var c=d===0?c0:down(c0);var k=LEAF.test(c.tagName)?[]:kids(c);
  out.push({path:pathOf(c),parent:parentPath,depth:d,kind:kind(c),label:label(c).slice(0,70),key:key(c),hidden:c.hasAttribute('data-ws-hidden'),marks:c.getAttribute('data-ws')||'',open:false,hasKids:k.length>0});
  if(d<6&&k.length)walk(c,d+1,pathOf(c))})}
 walk(ROOT,0,pathOf(ROOT));return out}
var PROPS=['font-size','font-weight','line-height','letter-spacing','text-transform','text-align','color','background-color','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','border-radius','max-width','display'];
var SEL=null,ORIG={};
function select(el,scroll){if(SEL){SEL.removeAttribute('data-ws-sel');for(var p in ORIG)SEL.style.setProperty(p,ORIG[p].v,ORIG[p].pr);ORIG={}}
 SEL=el;if(!el){parent.postMessage({ws:'selected',el:null},'*');return}
 el.setAttribute('data-ws-sel','');if(scroll)el.scrollIntoView({behavior:'smooth',block:'center'});
 var cs=getComputedStyle(el),st={};PROPS.forEach(function(p){st[p]=cs.getPropertyValue(p)});
 var anc=[],a=el.parentNode;while(a&&a!==APP&&a!==ROOT){if(n(a.textContent))anc.unshift({path:pathOf(a),kind:kind(a),label:label(a).slice(0,40)});a=a.parentNode}
 parent.postMessage({ws:'selected',el:{path:pathOf(el),kind:kind(el),label:label(el).slice(0,70),key:key(el),styles:st,marks:el.getAttribute('data-ws')||'',ancestors:anc}},'*')}
document.addEventListener('click',function(e){var el=e.target;if(!APP.contains(el))return;var sv=el.closest&&el.closest('svg');if(sv)el=sv.parentNode;select(el,false)},true);
window.addEventListener('message',function(e){var d=e.data||{};
 if(d.ws==='tree?')parent.postMessage({ws:'tree',nodes:tree()},'*');
 if(d.ws==='pick'){var el=byPath(d.path);if(el)select(el,true)}
 if(d.ws==='unpick')select(null);
 // Live preview of style changes on the selected element (undone on the next selection or reload).
 if(d.ws==='live-style'&&SEL){for(var p in d.css){if(!(p in ORIG))ORIG[p]={v:SEL.style.getPropertyValue(p),pr:SEL.style.getPropertyPriority(p)};if(d.css[p])SEL.style.setProperty(p,d.css[p],'important');else SEL.style.setProperty(p,ORIG[p].v,ORIG[p].pr)}}
 if(d.ws==='hover-path'){Array.prototype.forEach.call(document.querySelectorAll('[data-ws-pick]'),function(x){x.removeAttribute('data-ws-pick')});var h=d.path!=null&&byPath(d.path);if(h)h.setAttribute('data-ws-pick','')}
});
})();`;

const EDIT_JS = `(function(){
var TEXT='h1,h2,h3,h4,h5,h6,p,li,a,span,strong,em,b,button,label,td,th,blockquote,figcaption,small,div';
var APP=document.getElementById('app');
function n(s){return (s||'').replace(/\\s+/g,' ').trim()}
function editable(el){if(!el||el.nodeType!==1||!APP.contains(el))return null;
 while(el&&el!==APP&&el!==document.body){if(el.tagName==='IMG')return el;if(leaf(el))return el;el=el.parentNode}return null}
function leaf(el){if(!el.matches||!el.matches(TEXT)||!n(el.textContent))return false;
 if(el.tagName==='DIV')return el.children.length===0;
 return !el.querySelector('img,svg,video,iframe,input,select,textarea,div,p,ul,ol,h1,h2,h3,h4,h5,h6,section')}
// Which copy this is, when the same text, image or link appears more than once on the page.
function place(list,el){var i=Array.prototype.indexOf.call(list,el);return {nth:i<0?0:i,count:list.length}}
function sameText(el,t){return Array.prototype.filter.call(APP.getElementsByTagName(el.tagName),function(x){return n(x.textContent)===t})}
function sameAttr(sel,attr,v){return Array.prototype.filter.call(APP.querySelectorAll(sel),function(x){return x.getAttribute(attr)===v})}
var hov=null;
document.addEventListener('mouseover',function(e){var el=editable(e.target);if(hov&&hov!==el)hov.removeAttribute('data-ws-hover');if(el&&el.contentEditable!=='true'){el.setAttribute('data-ws-hover','');hov=el}});
document.addEventListener('submit',function(e){e.preventDefault()},true);
document.addEventListener('click',function(e){var el=editable(e.target);var a=e.target.closest&&e.target.closest('a');
 if(a||el)e.preventDefault();
 if(a&&APP.contains(a)){var h=a.getAttribute('href')||'';var p=place(sameAttr('a','href',h),a);
  parent.postMessage({ws:'link',href:h,nth:p.nth,count:p.count,newTab:a.getAttribute('target')==='_blank',text:n(a.textContent).slice(0,80)},'*')}
 else parent.postMessage({ws:'nolink'},'*');
 if(!el)return;e.stopPropagation();
 if(el.tagName==='IMG'){var s=el.getAttribute('src');var q=place(sameAttr('img','src',s),el);parent.postMessage({ws:'img',src:s,alt:el.getAttribute('alt')||'',nth:q.nth,count:q.count},'*');return}
 if(el.contentEditable==='true')return;el.removeAttribute('data-ws-hover');
 var from=n(el.textContent);var pl=place(sameText(el,from),el);var before=el.innerHTML;el.contentEditable='true';el.focus();
 parent.postMessage({ws:'focus',tag:el.tagName.toLowerCase(),from:from,nth:pl.nth,count:pl.count},'*');
 el.addEventListener('keydown',function k(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();el.blur()}if(ev.key==='Escape'){el.innerHTML=before;el.blur()}});
 el.addEventListener('blur',function b(){el.removeEventListener('blur',b);el.contentEditable='false';if(el.innerHTML!==before)parent.postMessage({ws:'text',tag:el.tagName.toLowerCase(),from:from,to:el.innerHTML.trim(),nth:pl.nth,count:pl.count},'*')});
},true);
// A repeating item around the clicked element (list item, card, nav link): the nearest
// ancestor that has a same-tag, same-class sibling. Lets the editor hide it or add one after it.
function sig(c){return c.tagName+'|'+(c.getAttribute('class')||'')+'|'+(c.getAttribute('style')||'')}
function item(el){var cur=el;for(var d=0;d<7&&cur&&cur!==APP;d++){var p=cur.parentNode;if(!p||p===APP||p===APP.firstElementChild)break;
 var t=n(cur.textContent);
 if(cur.tagName==='LI'&&t)return cur;
 var me=sig(cur),sib=Array.prototype.filter.call(p.children,function(c){return sig(c)===me});
 if(sib.length>=2&&(cur.getAttribute('class')||cur.getAttribute('style'))&&/^(DIV|ARTICLE|A|LI)$/.test(cur.tagName)&&t&&t.length<=400)return cur;cur=p}return null}
document.addEventListener('click',function(e){var el=editable(e.target);if(!el||el.tagName==='IMG'){parent.postMessage({ws:'noitem'},'*');return}
 var it=item(el);if(!it){parent.postMessage({ws:'noitem'},'*');return}
 var t=n(it.textContent);var p=place(sameText(it,t),it);
 parent.postMessage({ws:'item',tag:it.tagName.toLowerCase(),from:t,nth:p.nth,count:p.count,leaf:n(el.textContent),label:t.slice(0,70)},'*')},true);
// The page's sections and images, for the Sections and Search tabs.
var SECS=[];
function scan(){var root=APP.firstElementChild||APP;SECS=Array.prototype.filter.call(root.children,function(c){return n(c.textContent)&&c.offsetHeight>30});
 var secs=SECS.map(function(c,i){var h=c.querySelector('h1,h2,h3,h4');var t=n(c.textContent);var p=place(sameText(c,t),c);
  return {i:i,tag:c.tagName.toLowerCase(),from:t,nth:p.nth,count:p.count,label:(c.tagName==='HEADER'?'Header':c.tagName==='FOOTER'?'Footer':h?n(h.textContent):t).slice(0,70),marks:c.getAttribute('data-ws')||'',hidden:c.hasAttribute('data-ws-hidden')}});
 var seen={},imgs=[];Array.prototype.forEach.call(APP.querySelectorAll('img'),function(im){var s=im.getAttribute('src');if(!s||seen[s])return;seen[s]=1;imgs.push({src:s,alt:im.getAttribute('alt')||''})});
 parent.postMessage({ws:'scan',sections:secs,images:imgs},'*')}
if(document.readyState==='complete')scan();else window.addEventListener('load',scan);
window.addEventListener('message',function(e){if(e.data&&e.data.ws==='scroll')window.scrollTo(0,e.data.y);if(e.data&&e.data.ws==='scan?')scan();
 if(e.data&&e.data.ws==='goto'){var s=SECS[e.data.i];if(s){s.scrollIntoView({behavior:'smooth',block:'start'});s.setAttribute('data-ws-pick','');setTimeout(function(){s.removeAttribute('data-ws-pick')},1600)}}});
var t;window.addEventListener('scroll',function(){clearTimeout(t);t=setTimeout(function(){parent.postMessage({ws:'scrolled',y:window.scrollY},'*')},150)});
})();`;

// ------------------------------------------------------------------------------------ queries

export async function getSite(slug: string) {
  await ensureBodyShop();
  const [s] = await sql<BsSite[]>`select * from bs_sites where slug = ${slug}`;
  if (s && !Object.keys(s.info_base || {}).length) return (await initInfo(s)) ?? s;
  return s ?? null;
}

/**
 * The first time a site is opened, read its name, phone, address, hours and links from the
 * home page's business markup. Those are the values the approved pages were built with.
 */
async function initInfo(s: BsSite) {
  const [home] = await sql<{ base_html: string }[]>`select base_html from bs_pages where site_id = ${s.id} and path = '/'`;
  if (!home) return null;
  const b = cleanInfo(detectInfo(home.base_html));
  if (!Object.keys(b).length) return null;
  const [u] = await sql<BsSite[]>`
    update bs_sites set info_base = ${sql.json(b as any)},
      info = case when info = '{}'::jsonb then ${sql.json(b as any)} else info end,
      live_info = case when live_info = '{}'::jsonb then ${sql.json(b as any)} else live_info end
    where id = ${s.id} returning *`;
  return u;
}

export async function getPageByPath(siteId: number, p: string) {
  const [pg] = await sql<BsPage[]>`select * from bs_pages where site_id = ${siteId} and path = ${p}`;
  return pg ?? null;
}

/** Every page of a site with when it last went live, for sitemap.xml. */
export async function listSitemapPages(siteId: number) {
  return sql<{ path: string; published_at: string | null; noindex: boolean }[]>`
    select path, published_at,
           (base_html ~* '<meta[^>]+name=["'']robots["''][^>]+noindex' or coalesce((live_meta->>'noindex')::boolean, false)) as noindex
    from bs_pages where site_id = ${siteId} and status = 'live' order by path`;
}

/** Where a missing path should go: an exact match first, then the longest "prefix*" rule. */
export async function findRedirect(siteId: number, p: string) {
  const rows = await sql<BsRedirect[]>`select * from bs_redirects where site_id = ${siteId}`;
  const want = [p, p.endsWith('/') ? p.slice(0, -1) : p + '/'];
  const exact = rows.find((r) => want.includes(r.from_path));
  if (exact) return exact.to_path;
  const wild = rows.filter((r) => r.from_path.endsWith('*') && p.startsWith(r.from_path.slice(0, -1)))
    .sort((a, b) => b.from_path.length - a.from_path.length)[0];
  return wild?.to_path ?? null;
}

/** Cleans a path someone typed: leading and trailing slash, lowercase, no spaces or query. */
export function cleanPath(input: string) {
  let p = input.trim().toLowerCase().replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
  p = p.replace(/[^a-z0-9/_*.-]+/g, '-').replace(/\/{2,}/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/') && !p.endsWith('*') && !/\.[a-z0-9]+$/.test(p)) p += '/';
  return p;
}

/**
 * A new page that starts as a copy of another: same design and edits, its own address,
 * title, description and (optionally) headline. It's a draft until someone publishes it.
 */
export async function duplicatePage(site: BsSite, src: BsPage, o: { path: string; title: string; description?: string; headline?: string; by: string; rewrites?: { tag: string; from: string; to: string }[] }) {
  const origin = `https://${site.domains.find((d) => !d.startsWith('www.')) ?? site.domains[0]}`;
  let html = src.base_html;
  // The page's own address in its canonical tag, share tags and search markup.
  html = html.split(`${origin}${src.path}"`).join(`${origin}${o.path}"`);
  const $ = cheerio.load(html);
  $('title').text(o.title);
  const edits: Edit[] = [...src.edits];
  if (o.headline) {
    const h1 = $('#app h1').first();
    if (h1.length) {
      // Through the overlay, so the change survives the page script re-drawing the hero.
      const cur = norm(cheerio.load(renderPage(site, src, 'draft'))('#app h1').first().text());
      edits.push({ id: editId(), kind: 'text', tag: 'h1', from: cur, to: esc(o.headline), scope: 'page', at: new Date().toISOString(), by: o.by });
    }
  }
  // Claude's draft: copy rewritten block by block, as ordinary text edits people can undo.
  for (const r of o.rewrites ?? []) {
    if (!/^(h[1-6]|p|li)$/.test(r.tag) || !r.from || !r.to) continue;
    edits.push({ id: editId(), kind: 'text', tag: r.tag, from: norm(r.from), to: esc(r.to), scope: 'page', at: new Date().toISOString(), by: `${o.by} with Claude` });
  }
  const meta: Meta = { ...src.meta, title: o.title, ...(o.description ? { description: o.description } : {}) };
  const [pg] = await sql<BsPage[]>`
    insert into bs_pages (site_id, path, title, base_html, meta, live_meta, edits, live_edits, status, published_at, published_by)
    values (${site.id}, ${o.path}, ${o.title.split(' | ')[0]}, ${$.html()}, ${sql.json(meta as any)}, ${sql.json({} as any)},
            ${sql.json(edits as any)}, ${sql.json([] as any)}, 'draft', null, null)
    returning *`;
  return pg;
}

export async function getPage(id: number) {
  await ensureBodyShop();
  const [pg] = await sql<BsPage[]>`select * from bs_pages where id = ${id}`;
  return pg ?? null;
}

/** True when a page (or its site) has edits that visitors don't see yet. */
export function pageChanged(site: BsSite, page: BsPage) {
  return JSON.stringify(page.edits) !== JSON.stringify(page.live_edits)
    || JSON.stringify(page.meta) !== JSON.stringify(page.live_meta)
    || page.status === 'draft'
    || siteChanged(site);
}

/** True when the site's own changes (site-wide edits, Site Info) aren't live yet. */
export const siteChanged = (site: Pick<BsSite, 'edits' | 'live_edits' | 'info' | 'live_info'> & Partial<Pick<BsSite, 'announce' | 'live_announce'>>) =>
  JSON.stringify(site.edits) !== JSON.stringify(site.live_edits) || infoChanged(site.info, site.live_info)
  || JSON.stringify(site.announce ?? {}) !== JSON.stringify(site.live_announce ?? {});

/**
 * Publishes everything waiting on a site: every page's edits and search settings, new pages,
 * site-wide edits, Site Info and the announcement bar. Keeps a snapshot for history.
 */
export async function publishSite(siteId: number, userName: string, note = 'Published whole site') {
  const [site] = await sql<BsSite[]>`select * from bs_sites where id = ${siteId}`;
  if (!site) return;
  const pages = await sql<Pick<BsPage, 'id' | 'edits' | 'meta'>[]>`select id, edits, meta from bs_pages where site_id = ${site.id}`;
  await sql.begin(async (tx) => {
    await tx`update bs_pages set live_edits = edits, live_meta = meta, published_at = now(), published_by = ${userName},
      status = case when status = 'draft' then 'live' else status end
      where site_id = ${site.id} and (live_edits <> edits or live_meta <> meta or status = 'draft')`;
    await tx`update bs_sites set live_edits = edits, live_info = info, live_announce = announce, published_at = now(),
      publish_at = null, publish_by = null where id = ${site.id}`;
    await tx`insert into bs_publishes (site_id, page_id, snapshot, note, user_name)
      values (${site.id}, null, ${sql.json({ site: { edits: site.edits, info: site.info, announce: site.announce }, pages: pages.map((p) => ({ id: p.id, edits: p.edits, meta: p.meta })) } as any)}, ${note}, ${userName})`;
    await tx`update bs_requests set resolved_at = now(), resolved_by = ${userName} where site_id = ${site.id} and resolved_at is null`;
  });
  revalidateTag(`bs:${site.slug}`);
}

/** Runs scheduled publishes that are due. Called by the cron route and, as a backstop, by page views. */
export async function runDueSchedules() {
  await ensureBodyShop();
  const due = await sql<{ id: number; publish_by: string | null }[]>`select id, publish_by from bs_sites where publish_at is not null and publish_at <= now()`;
  for (const d of due) await publishSite(d.id, d.publish_by ? `${d.publish_by} (scheduled)` : 'Scheduled publish', 'Scheduled publish');
  return due.length;
}

let lastCheck = 0;
/** At most once a minute per server instance: publish anything whose scheduled time has passed. */
export function checkSchedulesSoon() {
  if (Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  runDueSchedules().catch((e) => console.error('scheduled publish', e));
}

/** Admins can always publish; editors only when an admin has allowed it on the Team page. */
export async function canPublish(user: { id: number; role: string }) {
  if (user.role === 'admin') return true;
  await ensureBodyShop();
  const [u] = await sql<{ bs_publish: boolean }[]>`select bs_publish from users where id = ${user.id}`;
  return !!u?.bs_publish;
}

export const editId = () => Math.random().toString(36).slice(2, 10);
export { esc, escRe };
