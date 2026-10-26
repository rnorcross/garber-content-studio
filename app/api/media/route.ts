import { sql } from '@/lib/db';
import { route, json, fail } from '@/lib/api';
import { storageMode, ALLOWED_TYPES } from '@/lib/storage';

export type MediaRow = {
  id: number; url: string; pathname: string; filename: string; content_type: string | null; size: number | null;
  width: number | null; height: number | null; alt: string | null; dealership_id: number | null;
  dealership: string | null; uploaded_by_name: string | null; created_at: string;
};

// List media, optionally for one dealership (?d=<id>, ?d=group for group-wide files) or a search (?q=).
export const GET = route(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.has('mode')) return json({ mode: storageMode() });
  const d = u.searchParams.get('d') ?? '';
  const q = (u.searchParams.get('q') ?? '').trim();
  const rows = await sql<MediaRow[]>`
    select m.*, dl.name as dealership, us.name as uploaded_by_name
    from media m left join dealerships dl on dl.id = m.dealership_id left join users us on us.id = m.uploaded_by
    where (${d} = '' or (${d} = 'group' and m.dealership_id is null) or m.dealership_id::text = ${d})
      and (${q} = '' or m.filename ilike ${'%' + q + '%'} or coalesce(m.alt, '') ilike ${'%' + q + '%'})
    order by m.created_at desc limit 500`;
  return json({ mode: storageMode(), items: rows });
});

// Record a file that was uploaded straight to Vercel Blob from the browser.
export const POST = route(async (req, user) => {
  const b = await req.json();
  const url = String(b.url || '');
  if (!/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(url)) return fail('Not a Blob URL');
  if (b.contentType && !ALLOWED_TYPES.includes(b.contentType)) return fail('That file type isn’t allowed');
  const [row] = await sql`
    insert into media (url, pathname, filename, content_type, size, width, height, alt, dealership_id, uploaded_by)
    values (${url}, ${String(b.pathname || '')}, ${String(b.filename || 'file')}, ${b.contentType || null}, ${Number(b.size) || null},
            ${Number(b.width) || null}, ${Number(b.height) || null}, ${b.alt || null}, ${b.dealershipId ? Number(b.dealershipId) : null}, ${user.id})
    on conflict (url) do update set alt = coalesce(excluded.alt, media.alt)
    returning *`;
  return json(row);
});
