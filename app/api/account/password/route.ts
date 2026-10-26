import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { checkPassword, hashPassword } from '@/lib/auth';

export const POST = route(async (req, user) => {
  const { current, next } = await req.json();
  if (String(next || '').length < 8) return fail('New password must be at least 8 characters');
  const [row] = await sql<{ password_hash: string }[]>`select password_hash from users where id = ${user.id}`;
  if (!row || !(await checkPassword(String(current || ''), row.password_hash))) return fail('Current password is wrong');
  await sql`update users set password_hash = ${await hashPassword(String(next))}, must_reset = false where id = ${user.id}`;
  return json({ ok: true });
});
