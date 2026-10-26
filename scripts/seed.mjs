// Loads the dealership roster and the imported Garber Buick pages. Safe to re-run:
// dealerships are upserted by slug, pages are skipped if one with the same title exists.
//   npm run db:seed
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL first'); process.exit(1); }
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require', max: 1, onnotice: () => {} });
const read = (p) => readFileSync(new URL(`../seed/${p}`, import.meta.url), 'utf8');

const roster = JSON.parse(read('dealerships.json')).dealerships;
const extra = [
  { slug: 'parker-chevrolet-webster', name: 'Parker Chevrolet Webster', makes: ['Chevrolet'], city: 'Webster, NY', notes: 'Parker Automotive — branched off from Garber; slightly different styling from the Garber pages.' },
  { slug: 'parker-subaru-webster', name: 'Parker Subaru Webster', makes: ['Subaru'], city: 'Webster, NY', notes: 'Parker Automotive — branched off from Garber; slightly different styling from the Garber pages.' },
];

let i = 0;
for (const d of [...roster, ...extra]) {
  i += 10;
  await sql`
    insert into dealerships (slug, name, city, makes, website, logo, logo_white, image_h, image_v, notes, sort)
    values (${d.slug}, ${d.name}, ${d.city ?? null}, ${d.makes ?? []}, ${d.website ?? null}, ${d.logo ?? null},
            ${d.logoWhite ?? null}, ${d.imageHorizontal ?? null}, ${d.imageVertical ?? null}, ${d.notes ?? null}, ${i})
    on conflict (slug) do update set name = excluded.name, city = excluded.city, makes = excluded.makes,
      website = excluded.website, logo = excluded.logo, logo_white = excluded.logo_white,
      image_h = excluded.image_h, image_v = excluded.image_v, notes = coalesce(dealerships.notes, excluded.notes)`;
}
console.log(`Dealerships: ${roster.length + extra.length}`);

// Templates: added if missing; existing ones are left alone so edits made in the app stick.
const templates = JSON.parse(read('templates.json'));
for (const t of templates) {
  await sql`
    insert into templates (slug, name, description, brief, fields, default_canonical, is_custom, sort)
    values (${t.slug}, ${t.name}, ${t.description ?? null}, ${t.brief}, ${sql.json(t.fields ?? [])}, ${t.default_canonical ?? null},
            ${!!t.is_custom}, ${t.sort ?? 100})
    on conflict (slug) do nothing`;
}
console.log(`Templates: ${templates.map((t) => t.name).join(', ')}`);

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

const [admin] = await sql`select id from users where role = 'admin' order by id limit 1`;
const manifest = JSON.parse(read('pages/manifest.json'));
for (const m of manifest) {
  const [exists] = await sql`select 1 from pages where title = ${m.title}`;
  if (exists) { console.log(`skip  ${m.title}`); continue; }
  const [d] = await sql`select id from dealerships where slug = ${m.dealership}`;
  // social tags live in the page's meta fields, not in the stored HTML
  const { html, title, description } = splitSocial(read(`pages/${m.file}`));
  const [t] = await sql`select default_canonical from templates where slug = ${m.pageType}`;
  const [{ id }] = await sql`
    insert into pages (dealership_id, title, page_type, live_url, notes, meta_title, meta_description, canonical_url, created_by, current_version)
    values (${d?.id ?? null}, ${m.title}, ${m.pageType}, ${m.liveUrl}, ${m.notes}, ${title}, ${description},
            ${t?.default_canonical ?? null}, ${admin?.id ?? null}, 1)
    returning id`;
  await sql`insert into page_versions (page_id, number, html, source, note, created_by)
            values (${id}, 1, ${html}, 'imported', 'Imported from the Garber Buick preview site', ${admin?.id ?? null})`;
  console.log(`added ${m.title}`);
}

// Point each template at its reference page (only where none is set yet).
for (const t of templates.filter((t) => t.reference)) {
  await sql`
    update templates set reference_page_id = (select id from pages where title = ${t.reference} limit 1)
    where slug = ${t.slug} and reference_page_id is null`;
}
await sql.end();
