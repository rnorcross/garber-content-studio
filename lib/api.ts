import { NextResponse } from 'next/server';
import { getUser, type SessionUser } from './auth';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Wraps a route handler with a signed-in check and uniform error handling. */
export function route<C = unknown>(
  fn: (req: Request, user: SessionUser, ctx: C) => Promise<Response>,
  opts: { admin?: boolean } = {},
) {
  return async (req: Request, ctx: C) => {
    const user = await getUser();
    if (!user) return fail('Not signed in', 401);
    if (opts.admin && user.role !== 'admin') return fail('Admins only', 403);
    try {
      return await fn(req, user, ctx);
    } catch (e) {
      console.error(e);
      return fail(e instanceof Error ? e.message : 'Something went wrong', 500);
    }
  };
}

export type IdCtx = { params: Promise<{ id: string }> };
export const idOf = async (ctx: IdCtx) => {
  const n = Number((await ctx.params).id);
  if (!Number.isInteger(n)) throw new Error('Bad id');
  return n;
};
