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
import { buildPage, cleanSampleReviews, metaFor, notesFor, storeFacts, TITLES } from './dealer-pages.mjs';

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
  const SKIP = ['garber-chevrolet-webster', 'garber-subaru', 'garber-randall-overall', 'garber-automall-overall'];
  const TEMPLATES = ['about', 'mission', 'reviews', 'community', 'history'];

  // --- dealerships ---------------------------------------------------------------
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
  // The Automall stores share one campus; the ones without their own photo use the campus photo.
  await sql`
    update dealerships set image_h = (select image_h from dealerships where slug = 'garber-automall-overall')
    where slug in ('garber-automall-cdjr', 'garber-automall-ford') and image_h is null`;
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
  function splitSocial(html) {
    return {
      title: metaContent(html, 'og:title'),
      description: metaContent(html, 'og:description'),
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
    const [exists] = await sql`select 1 from pages where title = ${m.title}`;
    if (exists) continue;
    const { html, title, description } = splitSocial(raw);
    const meta = metaFor(m.pageType, storeFacts(buick));
    await addPage({
      dealerId: buick.id, title: m.title, template: m.pageType, liveUrl: m.liveUrl, notes: m.notes,
      html: resolve(m.pageType === 'about' ? cleanSampleReviews(html, buick) : html),
      metaTitle: title ?? meta.title, metaDescription: description ?? meta.description,
      source: 'imported', versionNote: 'Imported from the Garber Buick preview site',
    });
    added++;
  }

  // --- every template for every Garber dealership -----------------------------------
  for (const d of dealerRows.filter((x) => !SKIP.includes(x.slug)).sort((a, b) => a.sort - b.sort)) {
    const f = storeFacts(d);
    for (const template of TEMPLATES) {
      const [exists] = await sql`select 1 from pages where dealership_id = ${d.id} and page_type = ${template} and status <> 'archived'`;
      if (exists) continue;
      const meta = metaFor(template, f);
      await addPage({
        dealerId: d.id, title: `${d.name} — ${TITLES[template]}`, template,
        html: resolve(buildPage(template, sources, d)), notes: notesFor(template, f),
        metaTitle: meta.title, metaDescription: meta.description,
        source: 'generated', versionNote: `Pre-built from the Garber Buick ${TITLES[template]} page`,
      });
      added++;
    }
  }
  log(`Pages added: ${added}`);

  // Point each template at its Garber Buick reference page (only where none is set yet).
  const refs = { about: 'Garber Buick — About Us', mission: 'Garber Buick — Mission, Vision & Values', reviews: 'Garber Buick — Reviews',
    community: 'Garber Buick — Community', history: 'Garber Buick — Our History' };
  for (const [slug, title] of Object.entries(refs)) {
    await sql`
      update templates set reference_page_id = (select id from pages where title = ${title} limit 1)
      where slug = ${slug} and reference_page_id is null`;
  }
  return { pagesAdded: added, images: Object.keys(assetUrl).length, imagesUploaded: uploaded };
}
