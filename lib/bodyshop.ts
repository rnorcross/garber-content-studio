// Body shop websites: storage, import and rendering.
//
// Each body shop site is a set of pre-rendered pages (the approved design, byte for byte) plus
// an overlay of edits. Edits never touch the stored page HTML; they're applied on the way out,
// on the server for the HTML that's sent, and again in the browser after the site's own script
// re-draws a section, so an edit can't be undone by the page's interactive parts.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
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
);

export type Meta = { title?: string; description?: string };

export type BsSite = {
  id: number; slug: string; name: string; city: string | null; domains: string[];
  edits: Edit[]; live_edits: Edit[]; published_at: string | null; created_at: string;
  /** Site Info: draft, what's live, and the values the approved pages were built with. */
  info: SiteInfo; live_info: SiteInfo; info_base: SiteInfo;
};
export type BsPage = {
  id: number; site_id: number; path: string; title: string; base_html: string;
  meta: Meta; live_meta: Meta; edits: Edit[]; live_edits: Edit[];
  published_at: string | null; published_by: string | null; updated_at: string;
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
window.__wsApply=function(root){root=root||document;
for(var i=0;i<E.length;i++){var e=E[i];if(e.kind==='replace')continue;
var els=root.querySelectorAll(e.kind==='text'?e.tag:e.kind==='link'?'a':'img'),c=0;
for(var j=0;j<els.length;j++){var el=els[j],m=mk(el),done=m.indexOf(e.id)>=0;
if(!done&&!(e.kind==='text'?n(el.textContent)===e.from:e.kind==='link'?el.getAttribute('href')===e.from:el.getAttribute('src')===e.from))continue;
var x=c++;if(e.nth!=null&&x!==e.nth)continue;if(done)continue;
if(e.kind==='text')el.innerHTML=e.to;else if(e.kind==='img'){el.setAttribute('src',e.to);el.removeAttribute('srcset')}
else if(e.kind==='alt')el.setAttribute('alt',e.to);
else{el.setAttribute('href',e.to);if(e.newTab===true){el.setAttribute('target','_blank');el.setAttribute('rel','noopener')}else if(e.newTab===false)el.removeAttribute('target')}
m.push(e.id);el.setAttribute('data-ws',m.join(' '))}}
if(L){var as=root.querySelectorAll('a[href^="/"]');for(var k=0;k<as.length;k++){var h=as[k].getAttribute('href');if(!/^\\/(\\/|s\\/|sites\\/)/.test(h))as[k].setAttribute('href',L+h)}}};
if(document.readyState!=='loading')window.__wsApply(document.getElementById('app'));else document.addEventListener('DOMContentLoaded',function(){window.__wsApply(document.getElementById('app'))});})();`;

/** The server half of the overlay: the same rules as APPLY_JS, on the parsed page. */
function applyServer($: cheerio.CheerioAPI, app: cheerio.Cheerio<any>, edits: Edit[], misses?: Set<string>) {
  for (const e of edits) {
    if (e.kind === 'replace') continue;
    let c = 0, hit = 0;
    app.find(e.kind === 'text' ? e.tag : e.kind === 'link' ? 'a' : 'img').each((_, node) => {
      const el = $(node);
      const m = (el.attr('data-ws') || '').split(' ').filter(Boolean);
      const done = m.includes(e.id);
      const match = done || (e.kind === 'text' ? norm(el.text()) === e.from : e.kind === 'link' ? el.attr('href') === e.from : el.attr('src') === e.from);
      if (!match) return;
      const x = c++;
      if (e.nth != null && x !== e.nth) return;
      hit++;
      if (done) return;
      if (e.kind === 'text') el.html(e.to);
      else if (e.kind === 'img') el.attr('src', e.to).removeAttr('srcset');
      else if (e.kind === 'alt') el.attr('alt', e.to);
      else {
        el.attr('href', e.to);
        if (e.newTab === true) el.attr('target', '_blank').attr('rel', 'noopener');
        else if (e.newTab === false) el.removeAttr('target');
      }
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
  site: Pick<BsSite, 'slug' | 'edits' | 'live_edits'> & Partial<Pick<BsSite, 'info' | 'live_info' | 'info_base'>>,
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

  // 2. Asset paths: the files live under /sites/<slug>/ in this app.
  const base = `/sites/${site.slug}`;
  html = html
    .replace(/(["'(\s,])\/(img|js|fonts|og|video)\//g, `$1${base}/$2/`)
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

  // 4. Text, image, link and alt-text edits on the server-rendered page.
  const app = $('#app');
  applyServer($, app, edits, opts.misses);

  // 5. On the studio's address, keep the page's own links inside /s/<slug>/. The browser does
  //    the same after the site's script re-draws (APPLY_JS reads __WSL).
  const lb = opts.linkBase || '';
  if (lb) app.find('a[href^="/"]').each((_, el) => {
    const h = $(el).attr('href')!;
    if (!/^\/(\/|s\/|sites\/)/.test(h)) $(el).attr('href', lb + h);
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
    $('body').append(`<script>${EDIT_JS}</script>`);
  } else {
    $('head').append(`<script>window.__WSB=${JSON.stringify(base)};window.__WSL=${JSON.stringify(lb)};window.__WS=${JSON.stringify(overlay).replace(/</g, '\\u003c')};${APPLY_JS}</script>`);
    if (!live) $('head').append('<meta name="robots" content="noindex">');
  }
  return $.html();
}

/** Edits on a page (its own and the site's) that no longer match anything, by id. */
export function brokenEdits(site: BsSite, page: BsPage) {
  const misses = new Set<string>();
  renderPage(site, page, 'draft', { misses });
  return misses;
}

const EDIT_CSS = `
[data-ws-hover]{outline:2px dashed #1122d7 !important;outline-offset:2px;cursor:text}
img[data-ws-hover]{cursor:pointer}
[contenteditable="true"]{outline:2px solid #1122d7 !important;outline-offset:2px;background:rgba(17,34,215,.04)}
a{cursor:text}`;

/** Click-to-edit inside the editor's preview frame. Reports each change to the editor. */
const EDIT_JS = `(function(){
var TEXT='h1,h2,h3,h4,h5,h6,p,li,a,span,strong,em,b,button,label,td,th,blockquote,figcaption,small,div';
var APP=document.getElementById('app');
function n(s){return (s||'').replace(/\\s+/g,' ').trim()}
function editable(el){if(!el||el.nodeType!==1)return null;
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
 el.addEventListener('keydown',function k(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();el.blur()}if(ev.key==='Escape'){el.innerHTML=before;el.blur()}});
 el.addEventListener('blur',function b(){el.removeEventListener('blur',b);el.contentEditable='false';if(el.innerHTML!==before)parent.postMessage({ws:'text',tag:el.tagName.toLowerCase(),from:from,to:el.innerHTML.trim(),nth:pl.nth,count:pl.count},'*')});
},true);
window.addEventListener('message',function(e){if(e.data&&e.data.ws==='scroll')window.scrollTo(0,e.data.y)});
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
           base_html ~* '<meta[^>]+name=["'']robots["''][^>]+noindex' as noindex
    from bs_pages where site_id = ${siteId} order by path`;
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
    || siteChanged(site);
}

/** True when the site's own changes (site-wide edits, Site Info) aren't live yet. */
export const siteChanged = (site: Pick<BsSite, 'edits' | 'live_edits' | 'info' | 'live_info'>) =>
  JSON.stringify(site.edits) !== JSON.stringify(site.live_edits) || infoChanged(site.info, site.live_info);

export const editId = () => Math.random().toString(36).slice(2, 10);
export { esc, escRe };
