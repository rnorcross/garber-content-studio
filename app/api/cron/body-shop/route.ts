import { runDueSchedules } from '@/lib/bodyshop';

// Vercel Cron (vercel.json) calls this every 15 minutes to run scheduled publishes.
// When CRON_SECRET is set, Vercel sends it as a Bearer token and anything else is refused.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  const n = await runDueSchedules();
  return Response.json({ ok: true, published: n });
}
