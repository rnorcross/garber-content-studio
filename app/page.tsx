import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';
import PageTable, { type PageRow } from '@/components/PageTable';

export const dynamic = 'force-dynamic';

type DRow = { id: number; slug: string; name: string; city: string | null; logo: string | null; pages: number; stale: number };

export default async function Library({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  const { q = '', status = '' } = await searchParams;
  const like = `%${q.trim()}%`;

  const pages = await sql<PageRow[]>`
    select p.id, p.title, p.page_type, p.status, p.current_version, p.live_version, p.live_url, p.updated_at,
           d.name as dealership, d.slug as dslug
    from pages p left join dealerships d on d.id = p.dealership_id
    where (${q} = '' or p.title ilike ${like} or d.name ilike ${like})
      and (${status} = '' or (${status} = 'stale' and p.live_version is not null and p.current_version <> p.live_version)
           or (${status} = 'draft' and p.live_version is null and p.status <> 'archived')
           or (${status} = 'live' and p.live_version is not null and p.current_version = p.live_version)
           or (${status} = 'archived' and p.status = 'archived'))
      and (${status} = 'archived' or p.status <> 'archived')
    order by p.updated_at desc
    limit 200`;

  const dealers = await sql<DRow[]>`
    select d.id, d.slug, d.name, d.city, d.logo,
      count(p.id) filter (where p.status <> 'archived')::int as pages,
      count(p.id) filter (where p.live_version is not null and p.current_version <> p.live_version and p.status <> 'archived')::int as stale
    from dealerships d left join pages p on p.dealership_id = d.id
    group by d.id order by d.sort, d.name`;

  const [{ stale }] = await sql<{ stale: number }[]>`
    select count(*)::int as stale from pages where live_version is not null and current_version <> live_version and status <> 'archived'`;

  const [k] = await sql<{ total: number; live: number; drafts: number; dealers: number }[]>`
    select count(*) filter (where status <> 'archived')::int as total,
      count(*) filter (where status <> 'archived' and live_version is not null and current_version = live_version)::int as live,
      count(*) filter (where status <> 'archived' and live_version is null)::int as drafts,
      count(distinct dealership_id) filter (where status <> 'archived')::int as dealers
    from pages`;
  const stats: [string, number, string][] = [
    ['Pages', k.total, 'var(--ink)'],
    ['Live & current', k.live, 'var(--ok)'],
    ['Re-paste needed', stale, stale ? 'var(--warn)' : 'var(--ink)'],
    ['Drafts', k.drafts, 'var(--blue)'],
    ['Dealerships covered', k.dealers, 'var(--purple)'],
  ];

  const filters = [['', 'All'], ['stale', `Re-paste needed${stale ? ` (${stale})` : ''}`], ['live', 'Live'], ['draft', 'Drafts'], ['archived', 'Archived']];

  return (
    <>
      <TopBar user={user} on="library" />
      <main className="wrap">
        <div className="head">
          <div>
            <div className="eyebrow">Library</div>
            <h1 className="title">Dealership website content</h1>
            <p className="sub">Every page we build for the dealer sites, with its history and what’s live.</p>
          </div>
          <Link className="btn primary" href="/new">New page</Link>
        </div>

        <div className="stats">
          {stats.map(([label, n, color]) => (
            <div key={label} className="card stat">
              <div className="eyebrow">{label}</div>
              <div className="stat-num" style={{ color }}>{n.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {stale > 0 && !status && (
          <div className="notice warn" style={{ marginBottom: 16 }}>
            {stale === 1 ? '1 page has' : `${stale} pages have`} edits that aren’t on the live site yet.{' '}
            <Link href="/?status=stale">Show {stale === 1 ? 'it' : 'them'}</Link>
          </div>
        )}

        <form className="row" style={{ marginBottom: 12 }}>
          <input className="input" name="q" defaultValue={q} placeholder="Search pages or dealerships" style={{ maxWidth: 320 }} aria-label="Search" />
          {status && <input type="hidden" name="status" value={status} />}
          <button className="btn" type="submit">Search</button>
          <div className="seg" style={{ marginLeft: 'auto' }}>
            {filters.map(([v, l]) => (
              <Link key={v} className={status === v ? 'on' : ''} href={`/?${new URLSearchParams({ ...(q ? { q } : {}), ...(v ? { status: v } : {}) })}`}>{l}</Link>
            ))}
          </div>
        </form>

        <PageTable rows={pages} />

        <h2 className="section-title">Dealerships</h2>
        <div className="grid g-3">
          {dealers.map((d) => (
            <Link key={d.id} href={`/d/${d.slug}`} className="card dtile">
              <span className="dlogo">{d.logo ? <img src={d.logo} alt="" /> : null}</span>
              <span style={{ minWidth: 0 }}>
                <span className="dname" style={{ display: 'block' }}>{d.name}</span>
                <span className="dmeta">
                  {d.pages ? `${d.pages} page${d.pages > 1 ? 's' : ''}` : 'No pages yet'}
                  {d.city ? ` · ${d.city}` : ''}
                </span>
                {d.stale > 0 && <span className="chip warn" style={{ marginTop: 6 }}>{d.stale} to re-paste</span>}
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
