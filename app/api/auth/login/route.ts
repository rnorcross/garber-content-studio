import { sql } from '@/lib/db';
import { bootstrapAdmin, checkPassword, createSession, type SessionUser } from '@/lib/auth';
import { fail, json } from '@/lib/api';

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const e = String(email || '').toLowerCase().trim();
  const p = String(password || '');
  if (!e || !p) return fail('Enter your email and password');

  const [ready] = await sql<{ ok: boolean }[]>`select to_regclass('public.users') is not null as ok`;
  if (!ready.ok) return fail('The app isn’t set up yet. Open /setup to finish setup.', 503);

  const [row] = await sql<(SessionUser & { password_hash: string; must_reset: boolean })[]>`
    select id, email, name, role, password_hash, must_reset from users where email = ${e}`;

  let user: SessionUser | null = null;
  let mustReset = false;
  if (row && (await checkPassword(p, row.password_hash))) {
    user = { id: row.id, email: row.email, name: row.name, role: row.role };
    mustReset = row.must_reset;
  } else if (!row) {
    user = await bootstrapAdmin(e, p);
  }
  if (!user) return fail('That email and password don’t match', 401);

  await createSession(user);
  return json({ ok: true, mustReset });
}
