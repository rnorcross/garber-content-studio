// Loads the dealership roster and the imported Garber Buick pages. Safe to re-run:
// dealerships are upserted by slug, pages are skipped if one with the same title exists.
//   npm run db:seed
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL first'); process.exit(1); }
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require', max: 1 });
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

const [admin] = await sql`select id from users where role = 'admin' order by id limit 1`;
const manifest = JSON.parse(read('pages/manifest.json'));
for (const m of manifest) {
  const [exists] = await sql`select 1 from pages where title = ${m.title}`;
  if (exists) { console.log(`skip  ${m.title}`); continue; }
  const [d] = await sql`select id from dealerships where slug = ${m.dealership}`;
  const [{ id }] = await sql`
    insert into pages (dealership_id, title, page_type, live_url, notes, created_by, current_version)
    values (${d?.id ?? null}, ${m.title}, ${m.pageType}, ${m.liveUrl}, ${m.notes}, ${admin?.id ?? null}, 1)
    returning id`;
  await sql`insert into page_versions (page_id, number, html, source, note, created_by)
            values (${id}, 1, ${read(`pages/${m.file}`)}, 'imported', 'Imported from the Garber Buick preview site', ${admin?.id ?? null})`;
  console.log(`added ${m.title}`);
}
await sql.end();
