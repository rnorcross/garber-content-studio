import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { sql, type Dealership } from '@/lib/db';
import TopBar from '@/components/TopBar';
import PageTable, { type PageRow } from '@/components/PageTable';

export const dynamic = 'force-dynamic';

export default async function DealershipPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const [d] = await sql<Dealership[]>`select * from dealerships where slug = ${slug}`;
  if (!d) notFound();
  const pages = await sql<PageRow[]>`
    select p.id, p.title, p.page_type, p.status, p.current_version, p.live_version, p.live_url, p.updated_at,
           ${d.name} as dealership, ${d.slug} as dslug
    from pages p where p.dealership_id = ${d.id} and p.status <> 'archived' order by p.updated_at desc`;

  return (
    <>
      <TopBar user={user} on="library" />
      <main className="wrap">
        <div className="head">
          <div className="row" style={{ gap: 16 }}>
            {d.logo && <span className="dlogo" style={{ width: 88, height: 60 }}><img src={d.logo} alt="" style={{ maxWidth: 76, maxHeight: 46 }} /></span>}
            <div>
              <div className="eyebrow"><Link href="/">Library</Link> / Dealership</div>
              <h1 className="title">{d.name}</h1>
              <p className="sub">
                {[d.city, d.makes.join(', ')].filter(Boolean).join(' · ')}
                {d.website && <> · <a href={d.website} target="_blank" rel="noopener">{d.website.replace(/^https?:\/\/(www\.)?/, '')}</a></>}
              </p>
            </div>
          </div>
          <Link className="btn primary" href={`/new?d=${d.id}`}>New page for {d.name}</Link>
        </div>
        <PageTable rows={pages} showDealer={false} />
      </main>
    </>
  );
}
