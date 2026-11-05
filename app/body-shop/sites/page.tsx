import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';
import { ensureBodyShop, ROSTER } from '@/lib/bodyshop';

export const dynamic = 'force-dynamic';

export default async function Sites() {
  const user = await requireUser();
  await ensureBodyShop();
  const rows = await sql<{ slug: string; pages: number }[]>`
    select s.slug, count(p.id)::int as pages from bs_sites s left join bs_pages p on p.site_id = s.id group by s.slug`;
  const have = new Map(rows.map((r) => [r.slug, r.pages]));

  return (
    <>
      <TopBar user={user} on="bs-sites" />
      <main className="wrap">
        <div className="head">
          <div>
            <div className="eyebrow">Body Shop Websites</div>
            <h1 className="title">Sites</h1>
            <p className="sub">Every Garber collision center, plus the group site. Shops join the studio one at a time.</p>
          </div>
        </div>
        <div className="grid g-3">
          {ROSTER.map((r) => {
            const pages = have.get(r.slug);
            const inStudio = pages !== undefined;
            const body = (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className={'chip' + (inStudio ? ' ok' : '')}>{inStudio ? 'In the studio' : 'Not added yet'}</span>
                  {inStudio && <span className="chip">{pages} pages</span>}
                </div>
                <div className="bs-card-title">{r.name}</div>
                <div className="bs-row-sub">{r.city}</div>
                <div className="bs-row-sub">{r.domain}</div>
              </>
            );
            return inStudio
              ? <Link key={r.slug} href={`/body-shop/sites/${r.slug}`} className="card card-pad bs-card">{body}</Link>
              : <div key={r.slug} className="card card-pad bs-card off">{body}</div>;
          })}
        </div>
      </main>
    </>
  );
}
