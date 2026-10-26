import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { sql } from './db';

export const SESSION_COOKIE = 'gcs_session';
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export type SessionUser = { id: number; email: string; name: string; role: 'admin' | 'editor' };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters)');
  return new TextEncoder().encode(s);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
}

export async function readToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: payload.id as number, email: payload.email as string, name: payload.name as string, role: payload.role as SessionUser['role'] };
  } catch {
    return null;
  }
}

export async function getUser() {
  return readToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireUser() {
  const u = await getUser();
  if (!u) redirect('/login');
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== 'admin') redirect('/');
  return u;
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/**
 * First-run bootstrap: when the users table is empty, ADMIN_EMAIL / ADMIN_PASSWORD
 * from the environment create the first admin on their first sign-in.
 */
export async function bootstrapAdmin(email: string, password: string) {
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from users`;
  if (count > 0) return null;
  const e = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const p = process.env.ADMIN_PASSWORD;
  if (!e || !p || email !== e || password !== p) return null;
  const [u] = await sql<SessionUser[]>`
    insert into users (email, name, password_hash, role)
    values (${e}, ${process.env.ADMIN_NAME || 'Admin'}, ${await hashPassword(p)}, 'admin')
    returning id, email, name, role`;
  return u;
}
