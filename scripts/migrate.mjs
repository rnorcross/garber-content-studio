// Creates or updates the tables. Same as the first step of the Setup page in the app.
//   npm run db:migrate
import postgres from 'postgres';
import { migrate } from '../lib/setup.mjs';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
if (!url) { console.error('Set DATABASE_URL first (or put it in .env.local)'); process.exit(1); }
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require', max: 1, onnotice: () => {} });
await migrate(sql);
console.log('Schema is up to date.');
await sql.end();
