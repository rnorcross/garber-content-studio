import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { hashPassword } from '@/lib/auth';

// Add a teammate with a temporary password (they're asked to change it on first sign-in).
export const POST = route(async (req) => {
  const b = await req.json();
  const email = String(b.email || '').toLowerCase().trim();
  const name = String(b.name || '').trim();
  const password = String(b.password || '');
  if (!email.includes('@') || !name) return fail('Enter a name and email');
  if (password.length < 8) return fail('Temporary password must be at least 8 characters');
  const role = b.role === 'admin' ? 'admin' : 'editor';
  const [exists] = await sql`select 1 from users where email = ${email}`;
  if (exists) return fail('Someone with that email already has an account');
  await sql`insert into users (email, name, password_hash, role, must_reset)
            values (${email}, ${name}, ${await hashPassword(password)}, ${role}, true)`;
  return json({ ok: true });
}, { admin: true });
