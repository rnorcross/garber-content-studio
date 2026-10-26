// Loads all starter content. Same as the Setup page in the app.
//   npm run db:seed            (reads DATABASE_URL, BLOB_READ_WRITE_TOKEN, ADMIN_* from .env.local)
import postgres from 'postgres';
import { seed } from '../lib/setup.mjs';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
if (!url) { console.error('Set DATABASE_URL first (or put it in .env.local)'); process.exit(1); }
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require', max: 1, onnotice: () => {} });
await seed(sql);
await sql.end();
