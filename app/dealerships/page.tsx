import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';

export const dynamic = 'force-dynamic';

type DRow = { id: number; slug: string; name: string; city: string | null; logo: string | null; pages: number; stale: number };

export default async function Dealerships({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = '' } = await searchParams;
  const like = `%${q.trim()}%`;
  const dealers = await sql<DRow[]>`
    select d.id, d.slug, d.name, d.city, d.logo,
      count(p.id) filter (where p.status <> 'archived')::int as pages,
      count(p.id) filter (where p.live_version is not null and p.current_version <> p.live_version and p.status <> 'archived')::int as stale
    from dealerships d left join pages p on p.dealership_id = d.id
    where (${q} = '' or d.name ilike ${like} or d.city ilike ${like})
    group by d.id order by lower(d.name)`;
  const withPages = dealers.filter((d) => d.pages > 0).length;

  return (
    <>
      <TopBar user={user} on="dealerships" />
      <main className="wrap">
        <div className="head">
          <div>
            <div className="eyebrow">Dealerships</div>
            <h1 className="title">Every Garber store</h1>
            <p className="sub">{dealers.length} dealerships · {withPages} with pages. Open one to see its pages, settings and what’s live.</p>
          </div>
        </div>
        <form className="row" style={{ marginBottom: 16 }}>
          <input className="input" name="q" defaultValue={q} placeholder="Search dealerships or cities" style={{ maxWidth: 320 }} aria-label="Search dealerships" />
          <button className="btn" type="submit">Search</button>
          {q && <Link className="btn" href="/dealerships">Clear</Link>}
        </form>
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
          {!dealers.length && <p className="muted">No dealerships match “{q}”.</p>}
        </div>
      </main>
    </>
  );
}
