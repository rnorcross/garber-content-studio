import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const local = /localhost|127\.0\.0\.1|\/var\/run/.test(url);
  return postgres(url, {
    ssl: local ? false : 'require',
    max: local ? 5 : 1,
    idle_timeout: 20,
    prepare: false, // required for Neon's pooled (pgbouncer) endpoint
  });
}

export const sql = globalThis.__sql ?? (globalThis.__sql = make());

export type Dealership = {
  id: number; slug: string; name: string; city: string | null; makes: string[];
  website: string | null; logo: string | null; logo_white: string | null;
  image_h: string | null; image_v: string | null; notes: string | null; sort: number;
};

export type Page = {
  id: number; dealership_id: number | null; title: string; page_type: string;
  live_url: string | null; status: 'draft' | 'live' | 'archived';
  current_version: number | null; live_version: number | null;
  live_marked_at: string | null; notes: string | null;
  created_at: string; updated_at: string;
};

export type Version = {
  id: number; page_id: number; number: number; html: string; source: string;
  prompt: string | null; note: string | null; created_by: number | null;
  created_at: string; author?: string | null;
};

/** Adds a new version to a page and points the page at it. Returns the version number. */
export async function addVersion(
  pageId: number,
  html: string,
  source: Version['source'],
  userId: number | null,
  opts: { prompt?: string | null; note?: string | null } = {},
) {
  return sql.begin(async (tx) => {
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(number), 0) + 1 as next from page_versions where page_id = ${pageId}`;
    await tx`
      insert into page_versions (page_id, number, html, source, prompt, note, created_by)
      values (${pageId}, ${next}, ${html}, ${source}, ${opts.prompt ?? null}, ${opts.note ?? null}, ${userId})`;
    await tx`update pages set current_version = ${next}, updated_at = now() where id = ${pageId}`;
    return next;
  });
}
