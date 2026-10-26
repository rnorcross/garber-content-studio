// Creates the tables. Run once after setting DATABASE_URL:  npm run db:migrate
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
if (!url) { console.error('Set DATABASE_URL first'); process.exit(1); }
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require', max: 1, onnotice: () => {} });
await sql.unsafe(readFileSync(new URL('../lib/schema.sql', import.meta.url), 'utf8'));
console.log('Schema is up to date.');
await sql.end();
