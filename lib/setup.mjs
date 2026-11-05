// Database setup shared by the Setup page (/setup) and the npm scripts.
//
// migrate(): creates or updates the tables (lib/schema.sql). Safe to run any time.
// seed(): loads the dealership roster, templates, shared images, the Garber Buick pages, and a
// pre-built page for every template at every Garber dealership. Safe to re-run: it only adds
// what's missing and never overwrites pages or templates edited in the app.
//
// With Blob connected (BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN), the shared images in seed/assets are uploaded once to
// Vercel Blob. Without it (local development) they're written to .data/uploads.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { put as blobPut } from '@vercel/blob';
import { standardUrl, pageTitle } from './urls.mjs';
import { buildPage, cleanSampleReviews, metaFor, notesFor, storeFacts, TITLES, GROUP_META } from './dealer-pages.mjs';

// Files are read relative to the project root (the npm scripts run there, and Vercel's
// function bundle keeps the same layout).
const root = () => process.cwd();
const seedPath = (p) => path.join(root(), 'seed', p);
const read = (p) => readFileSync(seedPath(p), 'utf8');

export async function migrate(sql) {
  await sql.unsafe(readFileSync(path.join(root(), 'lib', 'schema.sql'), 'utf8'));
}

export async function seed(sql, log = console.log) {
  // Stores that don't get Garber-branded pages: the two Webster stores are now Parker
  // Automotive (different styling), and the "(Overall)" rows are campus listings with no site.
  const SKIP = ['garber-randall-overall', 'garber-automall-overall'];
  const TEMPLATES = ['about', 'mission', 'reviews', 'community', 'history'];

  // --- dealerships ---------------------------------------------------------------
  // Stores no longer in the studio (Parker Automotive's Webster stores; the Curtis Garber stores).
  // Their never-published pages go with them; a store with a page that's live on a site is kept.
  const REMOVED = ['garber-chevrolet-webster', 'garber-subaru', 'curtis-garber-chevrolet', 'curtis-garber-cadillac'];
  {
    const keep = await sql`select distinct d.slug from dealerships d join pages p on p.dealership_id = d.id
                           where d.slug in ${sql(REMOVED)} and p.live_version is not null`;
    const kept = keep.map((r) => r.slug);
    const drop = REMOVED.filter((s) => !kept.includes(s));
    if (drop.length) {
      await sql`delete from pages where dealership_id in (select id from dealerships where slug in ${sql(drop)})`;
      const r = await sql`delete from dealerships where slug in ${sql(drop)} returning name`;
      if (r.length) log(`Dealerships removed: ${r.map((x) => x.name).join(', ')}`);
    }
    if (kept.length) log(`Kept (they have live pages): ${kept.join(', ')}`);
  }
  const roster = JSON.parse(read('dealerships.json')).dealerships;
  let i = 0;
  for (const d of roster) {
    i += 10;
    await sql`
      insert into dealerships (slug, name, city, makes, website, logo, logo_white, image_h, image_v, notes, sort)
      values (${d.slug}, ${d.name}, ${d.city ?? null}, ${d.makes ?? []}, ${d.website ?? null}, ${d.logo ?? null},
              ${d.logoWhite ?? null}, ${d.imageHorizontal ?? null}, ${d.imageVertical ?? null}, ${d.notes ?? null}, ${i})
      on conflict (slug) do update set name = excluded.name, city = excluded.city, makes = excluded.makes,
        website = excluded.website, logo = excluded.logo, logo_white = excluded.logo_white,
        image_h = coalesce(excluded.image_h, dealerships.image_h), image_v = excluded.image_v,
        notes = coalesce(dealerships.notes, excluded.notes)`;
  }
  // Open Graph images on assets.garberauto.com/assets/open-graph/ (only fills dealerships
  // whose OG image hasn't been set by hand in the studio).
  const OG_BASE = 'https://assets.garberauto.com/assets/open-graph/open-graph-';
  const ogFile = {
    'delray-buick-gmc': 'delray-buick-gmc', 'hilton-head-buick-gmc': 'hilton-head-buick-gmc', 'hilton-head-cadillac': 'hilton-head-cadillac',
    'garber-automall-cdjr': 'garber-automall', 'garber-automall-ford': 'garber-automall', 'garber-automall-gm': 'garber-automall', 'garber-automall-buick-gmc': 'garber-automall',
    'garber-automall-overall': 'garber-automall-overall', 'garber-nissan': 'garber-nissan', 'garber-hyundai': 'garber-hyundai',
    'garber-buick': 'garber-buick',
    'garber-chevrolet-saginaw': 'garber-chevrolet-saginaw', 'garber-chevrolet-midland': 'garber-chevrolet-midland',
    'garber-chevrolet-linwood': 'garber-chevrolet-linwood', 'garber-chevrolet-chesaning': 'garber-chevrolet-buick',
    'sunrise-chevrolet': 'sunrise-chevrolet', 'nissan-of-bradenton': 'nissan-of-bradenton', 'garber-buick-gmc': 'garber-buick-gmc',
    'garber-chevrolet-highland': 'garber-chevrolet-highland', 'garber-honda': 'garber-honda', 'porsche-rochester': 'porsche-rochester',
    'volvo-cars-rochester': 'volvo-cars-rochester', 'garber-cdjr-saginaw': 'garber-cdjr-saginaw',
    'garber-randall-chevrolet': 'garber-randall', 'garber-randall-buick-gmc': 'garber-randall', 'garber-randall-cadillac': 'garber-randall',
    'garber-randall-overall': 'garber-randall', 'garber-ford-bay-city': 'garber-ford-bay-city', 'garber-cdjr-valparaiso': 'garber-valparaiso',
    // no storefront photo yet: the group image
    'acura-of-rochester': 'garber-management-group', 'audi-rochester': 'garber-management-group',
  };
  let ogSet = 0;
  for (const [slug, file] of Object.entries(ogFile)) {
    const r = await sql`update dealerships set og_image = ${OG_BASE + file + '.jpg'}
      where slug = ${slug} and (og_image is null or og_image = '') returning id`;
    ogSet += r.length;
  }
  if (ogSet) log(`Open Graph images set: ${ogSet}`);
  // The Automall stores share one campus; the ones without their own photo use the campus photo.
  await sql`
    update dealerships set image_h = (select image_h from dealerships where slug = 'garber-automall-overall')
    where slug in ('garber-automall-cdjr', 'garber-automall-ford', 'garber-automall-buick-gmc') and image_h is null`;
  log(`Dealerships: ${roster.length}`);

  // --- templates -----------------------------------------------------------------
  const templates = JSON.parse(read('templates.json'));
  for (const t of templates) {
    await sql`
      insert into templates (slug, name, description, brief, fields, default_canonical, is_custom, sort)
      values (${t.slug}, ${t.name}, ${t.description ?? null}, ${t.brief}, ${sql.json(t.fields ?? [])}, ${t.default_canonical ?? null},
              ${!!t.is_custom}, ${t.sort ?? 100})
      on conflict (slug) do nothing`;
  }
  for (const t of templates.filter((t) => t.url_pattern)) {
    await sql`update templates set url_pattern = ${t.url_pattern} where slug = ${t.slug} and url_pattern is null`;
  }
  log(`Templates: ${templates.map((t) => t.name).join(', ')}`);

  // First admin from ADMIN_EMAIL / ADMIN_PASSWORD (same settings the app uses on first sign-in).
  // Only created when that email has no account yet; an existing password is never changed.
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (adminEmail && process.env.ADMIN_PASSWORD) {
    const [has] = await sql`select 1 from users where email = ${adminEmail}`;
    if (!has) {
      await sql`insert into users (email, name, password_hash, role)
                values (${adminEmail}, ${process.env.ADMIN_NAME || 'Admin'}, ${await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)}, 'admin')`;
      log(`Admin account created: ${adminEmail}`);
    }
  }
  const [admin] = await sql`select id from users where role = 'admin' order by id limit 1`;
  const dealerRows = await sql`select * from dealerships`;
  const dealerBySlug = Object.fromEntries(dealerRows.map((d) => [d.slug, d]));

  // --- shared images -------------------------------------------------------------
  const assetManifest = JSON.parse(read('assets/manifest.json'));
  const assetUrl = {};
  const existing = Object.fromEntries((await sql`select pathname, url from media where pathname like 'library/%'`).map((m) => [m.pathname, m.url]));
  const put = process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN ? blobPut : null;
  let uploaded = 0;
  for (const file of readdirSync(seedPath('assets')).filter((f) => f !== 'manifest.json')) {
    const pathname = `library/${file}`;
    if (existing[pathname]) { assetUrl[file] = existing[pathname]; continue; }
    const info = assetManifest[file] ?? {};
    const data = readFileSync(seedPath(`assets/${file}`));
    let fileUrl;
    if (put) {
      const blob = await put(pathname, data, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: info.type });
      fileUrl = blob.url;
    } else {
      const dest = path.join(process.cwd(), '.data', 'uploads', pathname);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, data);
      fileUrl = `/api/media/file/${pathname}`;
    }
    const dealerId = info.dealership ? dealerBySlug[info.dealership]?.id ?? null : null;
    await sql`
      insert into media (url, pathname, filename, content_type, size, alt, dealership_id, uploaded_by)
      values (${fileUrl}, ${pathname}, ${info.alt ? `${info.alt}${path.extname(file)}` : file}, ${info.type ?? null}, ${data.length},
              ${info.alt ?? null}, ${dealerId}, ${admin?.id ?? null})
      on conflict (url) do nothing`;
    assetUrl[file] = fileUrl;
    uploaded++;
  }
  log(`Images: ${Object.keys(assetUrl).length} (${uploaded} new, ${put ? 'Vercel Blob' : 'local .data/uploads'})`);
  const resolve = (html) => html.replace(/gcs-asset:\/\/([a-z0-9]+\.[a-z0-9]+)/g, (m, f) => assetUrl[f] ?? m);

  // --- helpers ---------------------------------------------------------------------
  function metaContent(html, key) {
    const tag = html.match(new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i'))?.[0];
    return tag?.match(/content\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? null;
  }
  const unescape = (v) => v == null ? v : v.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  function splitSocial(html) {
    return {
      title: unescape(metaContent(html, 'og:title')),
      description: unescape(metaContent(html, 'og:description')),
      html: html.replace(/<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:[a-z_:]+|twitter:[a-z_:]+|description)["'][^>]*>\s*/gi, '').trimStart(),
    };
  }
  const canonicalFor = Object.fromEntries((await sql`select slug, default_canonical from templates`).map((t) => [t.slug, t.default_canonical]));

  async function addPage({ dealerId, title, template, html, liveUrl = null, notes, metaTitle, metaDescription, source, versionNote }) {
    const [{ id }] = await sql`
      insert into pages (dealership_id, title, page_type, live_url, notes, meta_title, meta_description, canonical_url, created_by, current_version)
      values (${dealerId}, ${title}, ${template}, ${liveUrl}, ${notes}, ${metaTitle}, ${metaDescription},
              ${canonicalFor[template] ?? null}, ${admin?.id ?? null}, 1)
      returning id`;
    await sql`insert into page_versions (page_id, number, html, source, note, created_by)
              values (${id}, 1, ${html}, ${source}, ${versionNote}, ${admin?.id ?? null})`;
    return id;
  }

  // --- Garber Buick originals ----------------------------------------------------------
  const buick = dealerBySlug['garber-buick'];
  const manifest = JSON.parse(read('pages/manifest.json'));
  const sources = {};
  let added = 0;
  for (const m of manifest) {
    const raw = read(`pages/${m.file}`);
    sources[m.file.replace('garber-buick-', '').replace('.html', '')] = raw;
    const [exists] = await sql`select 1 from pages where dealership_id = ${buick.id} and page_type = ${m.pageType}`;
    if (exists) continue;
    const { html, title, description } = splitSocial(raw);
    const meta = metaFor(m.pageType, storeFacts(buick));
    await addPage({
      dealerId: buick.id, title: pageTitle(buick.name, m.pageType), template: m.pageType, liveUrl: m.liveUrl, notes: m.notes,
      html: resolve(m.pageType === 'about' ? cleanSampleReviews(html, buick) : html),
      metaTitle: title ?? meta.title, metaDescription: description ?? meta.description,
      source: 'imported', versionNote: 'Imported from the Garber Buick preview site',
    });
    added++;
  }

  // --- Updated page sets (garberauto.com group pages; live Garber Buick pages) --------
  // Each page is created if missing; an existing page with the same title gets the HTML as a
  // new version, once (the version note marks it as applied, so later runs never overwrite
  // edits made in the studio).
  for (const dir of ['pages-group', 'pages-buick', 'pages-midland', 'pages-linwood', 'pages-automall',
                     'pages-am-chevy', 'pages-am-bgmc', 'pages-am-cdjr', 'pages-am-ford', 'pages-saginaw', 'pages-cdjr-saginaw', 'pages-nissan', 'pages-hyundai', 'pages-chesaning', 'pages-ford-bay-city','pages-ft-pierce','pages-valparaiso','pages-highland']) {
    const set = JSON.parse(read(`${dir}/manifest.json`));
    const dealerId = set.dealership ? dealerBySlug[set.dealership]?.id ?? null : null;
    let updated = 0;
    for (const m of set.pages) {
      const { html } = splitSocial(read(`${dir}/${m.file}`));
      // search title + description: the store's SEO patterns (the fragment's own tags are the social ones)
      const dealer = set.dealership ? dealerBySlug[set.dealership] : null;
      // a manifest page can set its own search title/description (e.g. the Automall campus pages)
      const meta = m.metaTitle ? { title: m.metaTitle, description: m.metaDescription }
        : dealer ? metaFor(m.pageType, storeFacts(dealer)) : GROUP_META[m.pageType];
      const { title: metaTitle, description: metaDescription } = meta;
      // custom pages share a page type, so they're matched by title (or address) instead
      const [page] = m.pageType === 'custom'
        ? await sql`
          select id, current_version from pages where dealership_id is not distinct from ${dealerId} and page_type = 'custom'
            and (title = ${m.title} or live_url = ${m.liveUrl ?? ''})
          order by (status = 'archived'), id limit 1`
        : await sql`
          select id, current_version from pages where dealership_id is not distinct from ${dealerId} and page_type = ${m.pageType}
          order by (status = 'archived'), id limit 1`;
      if (!page) {
        await addPage({
          dealerId, title: m.title ?? pageTitle(set.dealership ? dealerBySlug[set.dealership]?.name : null, m.pageType), template: m.pageType, liveUrl: m.liveUrl, html, metaTitle, metaDescription,
          notes: null, source: 'imported', versionNote: set.versionNote,
        });
        added++;
        continue;
      }
      const [applied] = await sql`select 1 from page_versions where page_id = ${page.id} and note = ${set.versionNote} and html = ${html}`;
      if (applied) continue;
      const number = page.current_version + 1;
      await sql`insert into page_versions (page_id, number, html, source, note, created_by)
                values (${page.id}, ${number}, ${html}, 'imported', ${set.versionNote}, ${admin?.id ?? null})`;
      await sql`update pages set current_version = ${number}, dealership_id = ${dealerId}, page_type = ${m.pageType}, live_url = ${m.liveUrl},
                status = case when status = 'archived' then 'draft' else status end,
                updated_at = now() where id = ${page.id}`;
      if (m.metaTitle) await sql`update pages set title = ${m.title}, meta_title = ${metaTitle}, meta_description = ${metaDescription} where id = ${page.id}`;
      updated++;
    }
    if (updated) log(`${set.dealership ? dealerBySlug[set.dealership]?.name ?? set.dealership : 'Garber Automotive Group'} pages updated: ${updated}`);
  }

  // --- every template for every Garber dealership -----------------------------------
  for (const d of dealerRows.filter((x) => !SKIP.includes(x.slug)).sort((a, b) => a.sort - b.sort)) {
    const f = storeFacts(d);
    for (const template of TEMPLATES) {
      const [exists] = await sql`select 1 from pages where dealership_id = ${d.id} and page_type = ${template}`;
      if (exists) continue;
      const meta = metaFor(template, f);
      await addPage({
        dealerId: d.id, title: pageTitle(d.name, template), template,
        html: resolve(buildPage(template, sources, d)), notes: notesFor(template, f),
        metaTitle: meta.title, metaDescription: meta.description,
        source: 'generated', versionNote: `Pre-built from the Garber Buick ${TITLES[template]} page`,
      });
      added++;
    }
  }
  log(`Pages added: ${added}`);

  // Fill in each page's standard address on the dealer site where none is set yet.
  const patterns = Object.fromEntries((await sql`select slug, url_pattern from templates`).map((t) => [t.slug, t.url_pattern]));
  const noUrl = await sql`
    select p.id, p.page_type, d.name, d.website from pages p join dealerships d on d.id = p.dealership_id
    where p.live_url is null or p.live_url = ''`;
  let filled = 0;
  for (const p of noUrl) {
    const u = standardUrl(patterns[p.page_type], p);
    if (u) { await sql`update pages set live_url = ${u} where id = ${p.id}`; filled++; }
  }
  if (filled) log(`Page URLs filled in: ${filled}`);

  // One time: rewrite every store and group page's search title and description with the
  // current patterns (later runs leave titles alone, so edits made in the studio stick).
  const [metaDone] = await sql`select 1 from app_flags where key = 'seo-meta-v2'`;
  if (!metaDone) {
    let n = 0;
    const rows = await sql`
      select p.id, p.page_type, d.slug, d.name, d.city, d.makes, d.website from pages p left join dealerships d on d.id = p.dealership_id
      where p.page_type in ('about', 'reviews', 'community', 'history', 'mission') and p.status <> 'archived'`;
    for (const r of rows) {
      const m = r.slug ? metaFor(r.page_type, storeFacts(r)) : GROUP_META[r.page_type];
      if (!m) continue;
      await sql`update pages set meta_title = ${m.title}, meta_description = ${m.description}, updated_at = now() where id = ${r.id}`;
      n++;
    }
    await sql`insert into app_flags (key) values ('seo-meta-v2') on conflict do nothing`;
    log(`Search titles and descriptions rewritten: ${n} pages`);
  }

  // One time (Nov 2026): archive the pre-built drafts, keeping the Garber Automotive Group,
  // Garber Buick, Garber Chevrolet Midland and Garber Chevrolet Linwood pages and the Automall
  // Section 179 page. Archived pages stay in the studio (Library → Archived) and can be restored.
  const [draftsDone] = await sql`select 1 from app_flags where key = 'archive-drafts-2026-11'`;
  if (!draftsDone) {
    const r = await sql`
      update pages p set status = 'archived', updated_at = now()
      from dealerships d
      where d.id = p.dealership_id
        and p.status <> 'archived' and p.live_version is null
        and p.created_at < '2026-11-03'
        and d.slug not in ('garber-buick', 'garber-chevrolet-midland', 'garber-chevrolet-linwood')
        and p.title not ilike '%section 179%'
      returning p.id`;
    await sql`insert into app_flags (key) values ('archive-drafts-2026-11') on conflict do nothing`;
    log(`Drafts archived: ${r.length}`);
  }

  // Point each template at its Garber Buick reference page (only where none is set yet).
  for (const slug of ['about', 'mission', 'reviews', 'community', 'history']) {
    await sql`
      update templates set reference_page_id = (
        select id from pages where dealership_id = ${buick.id} and page_type = ${slug} and status <> 'archived' order by id limit 1)
      where slug = ${slug} and reference_page_id is null`;
  }

  // One time: rename store and group pages to the dealer-site naming
  // ("Garber Buick Dealership Reviews", "Garber Buick Commitment to Community", ...).
  const [namesDone] = await sql`select 1 from app_flags where key = 'page-names-v2'`;
  if (!namesDone) {
    const rows = await sql`
      select p.id, p.page_type, d.name from pages p left join dealerships d on d.id = p.dealership_id
      where p.page_type in ('about', 'reviews', 'community', 'history', 'mission')`;
    for (const r of rows) await sql`update pages set title = ${pageTitle(r.name, r.page_type)} where id = ${r.id}`;
    await sql`insert into app_flags (key) values ('page-names-v2') on conflict do nothing`;
    log(`Pages renamed: ${rows.length}`);
  }
  return { pagesAdded: added, images: Object.keys(assetUrl).length, imagesUploaded: uploaded };
}
