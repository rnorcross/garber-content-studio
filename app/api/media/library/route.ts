import { sql } from '@/lib/db';
import { route, json } from '@/lib/api';

// The starter image library (seed/assets): file name -> hosted URL. Used to turn
// gcs-asset://<file> references in edited files back into real image links.
export const GET = route(async () => {
  const rows = await sql<{ pathname: string; url: string }[]>`select pathname, url from media where pathname like 'library/%'`;
  return json(Object.fromEntries(rows.map((r) => [r.pathname.slice('library/'.length), r.url])));
});
