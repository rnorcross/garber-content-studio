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

export type Edit =
  | { id: string; kind: 'text'; tag: string; from: string; to: string; scope: 'page' | 'site'; at?: string; by?: string }
  | { id: string; kind: 'img'; from: string; to: string; scope: 'page' | 'site'; at?: string; by?: string }
  | { id: string; kind: 'replace'; from: string; to: string; scope: 'page' | 'site'; at?: string; by?: string };

export type Meta = { title?: string; description?: string };

export type BsSite = {
  id: number; slug: string; name: string; city: string | null; domains: string[];
  edits: Edit[]; live_edits: Edit[]; published_at: string | null; created_at: string;
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
 * it applied itself. Matches a text edit by tag + visible text, so it survives the site's own
 * re-renders and differences in how HTML gets serialized.
 */
const APPLY_JS = `(function(){var E=window.__WS||[];function n(s){return (s||'').replace(/\\s+/g,' ').trim()}
window.__wsApply=function(root){root=root||document;for(var i=0;i<E.length;i++){var e=E[i];
if(e.kind==='text'){var els=root.getElementsByTagName(e.tag);for(var j=0;j<els.length;j++){var el=els[j];if(el.__ws===e.id)continue;if(n(el.textContent)===e.from){el.innerHTML=e.to;el.__ws=e.id}}}
else if(e.kind==='img'){var im=root.querySelectorAll('img');for(var k=0;k<im.length;k++){if(im[k].getAttribute('src')===e.from){im[k].setAttribute('src',e.to);im[k].removeAttribute('srcset')}}}}};
if(document.readyState!=='loading')window.__wsApply(document.getElementById('app'));else document.addEventListener('DOMContentLoaded',function(){window.__wsApply(document.getElementById('app'))});})();`;

/**
 * Builds the HTML for a page.
 *   live: what visitors get (published edits).
 *   draft: the current unpublished state, fully interactive.
 *   edit: the draft with the site's scripts removed and the click-to-edit layer added.
 */
export function renderPage(site: Pick<BsSite, 'slug' | 'edits' | 'live_edits'>, page: BsPage, mode: 'live' | 'draft' | 'edit') {
  const live = mode === 'live';
  const edits: Edit[] = [...(live ? site.live_edits : site.edits), ...(live ? page.live_edits : page.edits)];
  const meta: Meta = live ? page.live_meta : page.meta;
  let html = page.base_html;

  // 1. Find & replace edits run over the raw HTML, so they also reach the page's head, schema
  //    markup, phone links and the templates the site's script re-draws from.
  for (const e of edits) if (e.kind === 'replace' && e.from) html = html.split(e.from).join(e.to);

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

  // 4. Text and image edits on the server-rendered page.
  const app = $('#app');
  for (const e of edits) {
    if (e.kind === 'text') {
      app.find(e.tag).each((_, el) => { if (norm($(el).text()) === e.from) $(el).html(e.to); });
    } else if (e.kind === 'img') {
      app.find('img').each((_, el) => { if ($(el).attr('src') === e.from) $(el).attr('src', e.to).removeAttr('srcset'); });
    }
  }

  const overlay = edits.filter((e) => e.kind !== 'replace').map(({ id, kind, from, to, ...r }) => ({ id, kind, from, to, tag: (r as any).tag }));
  if (mode === 'edit') {
    // No site scripts while editing: they'd re-draw sections out from under the cursor.
    $('script[src*="runtime.js"], script[src*="morphdom"], #dc-defs').remove();
    $('script').filter((_, el) => /googletagmanager|EmbedSocial|video\[data-src\]/.test($(el).html() || '')).remove();
    $('noscript').remove();
    $('head').append(`<style>${EDIT_CSS}</style>`);
    $('body').append(`<script>${EDIT_JS}</script>`);
  } else {
    $('head').append(`<script>window.__WSB=${JSON.stringify(base)};window.__WS=${JSON.stringify(overlay).replace(/</g, '\\u003c')};${APPLY_JS}</script>`);
    if (!live) $('head').append('<meta name="robots" content="noindex">');
  }
  return $.html();
}

const EDIT_CSS = `
[data-ws-hover]{outline:2px dashed #1122d7 !important;outline-offset:2px;cursor:text}
img[data-ws-hover]{cursor:pointer}
[contenteditable="true"]{outline:2px solid #1122d7 !important;outline-offset:2px;background:rgba(17,34,215,.04)}
a{cursor:text}`;

/** Click-to-edit inside the editor's preview frame. Reports each change to the editor. */
const EDIT_JS = `(function(){
var TEXT='h1,h2,h3,h4,h5,h6,p,li,a,span,strong,em,b,button,label,td,th,blockquote,figcaption,small,div';
function n(s){return (s||'').replace(/\\s+/g,' ').trim()}
function editable(el){if(!el||el.nodeType!==1)return null;var app=document.getElementById('app');
 while(el&&el!==app&&el!==document.body){if(el.tagName==='IMG')return el;if(leaf(el))return el;el=el.parentNode}return null}
function leaf(el){if(!el.matches||!el.matches(TEXT)||!n(el.textContent))return false;
 if(el.tagName==='DIV')return el.children.length===0;
 return !el.querySelector('img,svg,video,iframe,input,select,textarea,div,p,ul,ol,h1,h2,h3,h4,h5,h6,section')}
var hov=null;
document.addEventListener('mouseover',function(e){var el=editable(e.target);if(hov&&hov!==el)hov.removeAttribute('data-ws-hover');if(el&&el.contentEditable!=='true'){el.setAttribute('data-ws-hover','');hov=el}});
document.addEventListener('submit',function(e){e.preventDefault()},true);
document.addEventListener('click',function(e){var el=editable(e.target);var a=e.target.closest&&e.target.closest('a');if(a||el)e.preventDefault();if(!el)return;e.stopPropagation();
 if(el.tagName==='IMG'){parent.postMessage({ws:'img',src:el.getAttribute('src'),alt:el.getAttribute('alt')||''},'*');return}
 if(el.contentEditable==='true')return;el.removeAttribute('data-ws-hover');
 var from=n(el.textContent);var before=el.innerHTML;el.contentEditable='true';el.focus();
 el.addEventListener('keydown',function k(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();el.blur()}if(ev.key==='Escape'){el.innerHTML=before;el.blur()}});
 el.addEventListener('blur',function b(){el.removeEventListener('blur',b);el.contentEditable='false';if(el.innerHTML!==before)parent.postMessage({ws:'text',tag:el.tagName.toLowerCase(),from:from,to:el.innerHTML.trim()},'*')});
},true);
window.addEventListener('message',function(e){if(e.data&&e.data.ws==='scroll')window.scrollTo(0,e.data.y)});
var t;window.addEventListener('scroll',function(){clearTimeout(t);t=setTimeout(function(){parent.postMessage({ws:'scrolled',y:window.scrollY},'*')},150)});
})();`;

// ------------------------------------------------------------------------------------ queries

export async function getSite(slug: string) {
  await ensureBodyShop();
  const [s] = await sql<BsSite[]>`select * from bs_sites where slug = ${slug}`;
  return s ?? null;
}

export async function getPageByPath(siteId: number, p: string) {
  const [pg] = await sql<BsPage[]>`select * from bs_pages where site_id = ${siteId} and path = ${p}`;
  return pg ?? null;
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
    || JSON.stringify(site.edits) !== JSON.stringify(site.live_edits);
}

export const editId = () => Math.random().toString(36).slice(2, 10);
export { esc, escRe };
