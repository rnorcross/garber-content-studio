import { sql } from '@/lib/db';
import { route, json, fail, idOf, type IdCtx } from '@/lib/api';
import { hashPassword } from '@/lib/auth';

// Change a teammate's role or set a new temporary password.
export const PATCH = route<IdCtx>(async (req, user, ctx) => {
  const id = await idOf(ctx);
  const b = await req.json();
  if (b.role && id === user.id) return fail('You can’t change your own role');
  if (b.role) await sql`update users set role = ${b.role === 'admin' ? 'admin' : 'editor'} where id = ${id}`;
  if (b.password) {
    if (String(b.password).length < 8) return fail('Password must be at least 8 characters');
    await sql`update users set password_hash = ${await hashPassword(String(b.password))}, must_reset = true where id = ${id}`;
  }
  return json({ ok: true });
}, { admin: true });

export const DELETE = route<IdCtx>(async (_req, user, ctx) => {
  const id = await idOf(ctx);
  if (id === user.id) return fail('You can’t remove yourself');
  await sql`delete from users where id = ${id}`;
  return json({ ok: true });
}, { admin: true });
