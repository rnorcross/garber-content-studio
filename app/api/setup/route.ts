import { sql, databaseUrl } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { migrate, seed } from '@/lib/setup.mjs';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function status() {
  const out = {
    database: !!databaseUrl(), blob: !!process.env.BLOB_READ_WRITE_TOKEN, authSecret: (process.env.AUTH_SECRET ?? '').length >= 32,
    adminConfigured: !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD), claude: !!process.env.ANTHROPIC_API_KEY,
    tables: false, users: 0, pages: 0, dealerships: 0, error: null as string | null,
  };
  if (!out.database) return out;
  try {
    const [t] = await sql<{ ok: boolean }[]>`select to_regclass('public.pages') is not null as ok`;
    out.tables = t.ok;
    if (t.ok) {
      const [c] = await sql<{ users: number; pages: number; dealerships: number }[]>`
        select (select count(*) from users)::int as users, (select count(*) from pages)::int as pages,
               (select count(*) from dealerships)::int as dealerships`;
      Object.assign(out, c);
    }
  } catch (e) {
    out.error = (e as Error).message;
  }
  return out;
}

// What's configured and what's loaded — shown on the Setup page.
export async function GET() {
  return Response.json(await status());
}

/**
 * Creates the tables and loads the starter content. Before anyone has an account, it needs the
 * ADMIN_EMAIL / ADMIN_PASSWORD from Vercel; after that, only a signed-in admin can run it again.
 */
export async function POST(req: Request) {
  const s = await status();
  if (!s.database) return Response.json({ error: 'No database is connected. In Vercel, connect Neon under Storage, then redeploy.' }, { status: 400 });
  if (!s.authSecret) return Response.json({ error: 'AUTH_SECRET is missing or shorter than 32 characters. Add it in Vercel, then redeploy.' }, { status: 400 });

  if (s.users > 0) {
    const user = await getUser();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Setup has already run. Sign in as an admin to run it again.' }, { status: 403 });
  } else {
    const { email, password } = await req.json().catch(() => ({}));
    const okEmail = String(email || '').toLowerCase().trim() === (process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
    if (!s.adminConfigured) return Response.json({ error: 'Add ADMIN_EMAIL and ADMIN_PASSWORD in Vercel, then redeploy.' }, { status: 400 });
    if (!okEmail || String(password || '') !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'That email and password don’t match ADMIN_EMAIL and ADMIN_PASSWORD in Vercel.' }, { status: 401 });
    }
  }

  const log: string[] = [];
  try {
    await migrate(sql);
    log.push('Tables are up to date.');
    const result = await seed(sql, (m: string) => log.push(m));
    return Response.json({ ok: true, log, result });
  } catch (e) {
    console.error(e);
    return Response.json({ error: (e as Error).message, log }, { status: 500 });
  }
}
