import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

/** The connection string, under any of the names Vercel's Neon integration uses. */
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
}

function make() {
  const url = databaseUrl();
  if (!url) throw new Error('No database connection string is set (DATABASE_URL). Connect Neon to the project in Vercel → Storage.');
  const local = /localhost|127\.0\.0\.1|\/var\/run/.test(url);
  return postgres(url, {
    ssl: local ? false : 'require',
    max: local ? 5 : 1,
    idle_timeout: 20,
    prepare: false, // required for Neon's pooled (pgbouncer) endpoint
  });
}

type Sql = ReturnType<typeof postgres>;
const real = (): Sql => globalThis.__sql ?? (globalThis.__sql = make());

/**
 * Connects on first use rather than when the module loads, so `next build` works before
 * the database is configured and a missing connection string only fails real requests.
 */
export const sql = new Proxy(function () {} as unknown as Sql, {
  apply: (_t, _this, args) => (real() as any)(...args),
  get: (_t, prop) => {
    const s = real() as any;
    const v = s[prop];
    return typeof v === 'function' ? v.bind(s) : v;
  },
}) as Sql;

export type Dealership = {
  id: number; slug: string; name: string; city: string | null; makes: string[];
  website: string | null; logo: string | null; logo_white: string | null;
  image_h: string | null; image_v: string | null; notes: string | null; sort: number; og_image: string | null;
};

export type Page = {
  id: number; dealership_id: number | null; title: string; page_type: string;
  live_url: string | null; status: 'draft' | 'live' | 'archived';
  current_version: number | null; live_version: number | null;
  live_marked_at: string | null; notes: string | null;
  meta_title: string | null; meta_description: string | null; canonical_url: string | null;
  created_at: string; updated_at: string;
};

export type LiveEvent = {
  id: number; page_id: number; version: number; live_url: string | null; note: string | null;
  user_name: string | null; created_at: string;
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
