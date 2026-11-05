import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';
import { ensureBodyShop, ROSTER, type BsSite } from '@/lib/bodyshop';

export const dynamic = 'force-dynamic';

export default async function BodyShopOverview() {
  const user = await requireUser();
  await ensureBodyShop();
  const sites = await sql<(BsSite & { pages: number; changed: number })[]>`
    select s.*, count(p.id)::int as pages,
      count(p.id) filter (where p.edits <> p.live_edits or p.meta <> p.live_meta)::int as changed
    from bs_sites s left join bs_pages p on p.site_id = s.id group by s.id order by s.id`;
  const siteChanges = sites.filter((s) => JSON.stringify(s.edits) !== JSON.stringify(s.live_edits)).length;
  const unpublished = sites.reduce((n, s) => n + s.changed, 0) + siteChanges;
  const [last] = await sql<{ user_name: string; created_at: string; title: string | null; slug: string }[]>`
    select b.user_name, b.created_at, p.title, s.slug from bs_publishes b join bs_sites s on s.id = b.site_id
      left join bs_pages p on p.id = b.page_id order by b.created_at desc limit 1`;
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Detroit' });

  return (
    <>
      <TopBar user={user} on="bs-overview" />
      <main className="wrap">
        <div className="eyebrow">{day}</div>
        <h1 className="bs-hero">Overview</h1>
        <p className="sub" style={{ marginBottom: 24 }}>Garber’s body shop websites: what’s in the studio, what’s waiting to publish, and what’s next.</p>

        <div className="bs-stats">
          <div className="bs-stat accent">
            <div className="bs-stat-label">Sites in the studio</div>
            <div className="bs-stat-num">{sites.length}<span> / {ROSTER.length}</span></div>
            <Link href="/body-shop/sites" className="bs-stat-link">View sites →</Link>
          </div>
          <div className="bs-stat">
            <div className="bs-stat-label">Pages</div>
            <div className="bs-stat-num">{sites.reduce((n, s) => n + s.pages, 0)}</div>
          </div>
          <div className="bs-stat">
            <div className="bs-stat-label">Waiting to publish</div>
            <div className="bs-stat-num" style={{ color: unpublished ? 'var(--warn)' : undefined }}>{unpublished}</div>
          </div>
          <div className="bs-stat">
            <div className="bs-stat-label">Leads this month</div>
            <div className="bs-stat-num muted">—</div>
            <Link href="/body-shop/leads" className="bs-stat-link">Not connected yet →</Link>
          </div>
        </div>

        <div className="section-title">Sites</div>
        <div className="card">
          {sites.map((s) => (
            <Link key={s.id} href={`/body-shop/sites/${s.slug}`} className="bs-row">
              <div>
                <div className="bs-row-title">{s.name}</div>
                <div className="bs-row-sub">{s.city} · {s.domains[0]}</div>
              </div>
              <div className="row">
                {s.changed || JSON.stringify(s.edits) !== JSON.stringify(s.live_edits)
                  ? <span className="chip warn">Unpublished changes</span>
                  : <span className="chip ok">Up to date</span>}
                <span className="chip">{s.pages} pages</span>
              </div>
            </Link>
          ))}
        </div>
        {last && (
          <p className="sub" style={{ marginTop: 14, fontSize: 13 }}>
            Last published {new Date(last.created_at).toLocaleString('en-US', { timeZone: 'America/Detroit', dateStyle: 'medium', timeStyle: 'short' })} by {last.user_name}{last.title ? ` (${last.title})` : ''}.
          </p>
        )}
      </main>
    </>
  );
}
