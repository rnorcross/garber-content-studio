// Runs before `next build` on Vercel so new or changed seed content (page sets, templates,
// roster) is loaded into the database automatically on every production deploy — no need to
// open /setup. It only runs when the seed fingerprint changed, and it never blocks a deploy:
// if anything fails, the build continues and the Setup page shows that content is waiting.
//   Skip it:  set AUTO_SETUP=off in Vercel.   Run it locally:  npm run db:auto
import postgres from 'postgres';
import { migrate, seed } from '../lib/setup.mjs';
import { seedVersion } from '../lib/seed-version.mjs';

const say = (m) => console.log(`[auto-setup] ${m}`);
const onVercel = !!process.env.VERCEL;
const env = process.env.VERCEL_ENV;
if (process.env.AUTO_SETUP === 'off') { say('AUTO_SETUP=off, skipping.'); process.exit(0); }
if (onVercel && env !== 'production' && process.env.AUTO_SETUP !== 'on') { say(`${env} deploy, skipping (production only).`); process.exit(0); }

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
if (!url) { say('No database connection string in the build environment, skipping.'); process.exit(0); }
if (onVercel && !(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN)) { say('Blob storage not available to the build, skipping.'); process.exit(0); }

const version = seedVersion();
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require', max: 1, prepare: false, connect_timeout: 20, onnotice: () => {} });
try {
  await migrate(sql);
  const [done] = await sql`select 1 from app_flags where key = ${'seed:' + version}`;
  if (done) { say(`Content ${version} is already loaded.`); }
  else {
    const t = Date.now();
    await seed(sql, say);
    await sql`insert into app_flags (key) values (${'seed:' + version}) on conflict do nothing`;
    say(`Loaded content ${version} in ${Math.round((Date.now() - t) / 1000)}s.`);
  }
} catch (e) {
  say(`Failed, continuing the build (run Setup to retry): ${e?.message ?? e}`);
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
