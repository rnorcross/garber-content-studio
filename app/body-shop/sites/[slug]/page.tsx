import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';
import { getSite, type BsPage } from '@/lib/bodyshop';
import SiteTools from './SiteTools';

export const dynamic = 'force-dynamic';

const GROUPS: [string, (p: string) => boolean][] = [
  ['Main pages', (p) => !p.startsWith('/collision-repair-services/') && !/confirmation/.test(p)],
  ['Repair services', (p) => p.startsWith('/collision-repair-services/') && !/-collision-repair\/$/.test(p)],
  ['Brand pages', (p) => /-collision-repair\/$/.test(p)],
  ['Thank-you pages', (p) => /confirmation/.test(p)],
];

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const site = await getSite(slug);
  if (!site) notFound();
  const pages = await sql<(Pick<BsPage, 'id' | 'path' | 'title' | 'published_at' | 'published_by'> & { changed: boolean; n: number })[]>`
    select id, path, title, published_at, published_by,
      (edits <> live_edits or meta <> live_meta) as changed, jsonb_array_length(edits)::int as n
    from bs_pages where site_id = ${site.id} order by path`;
  const siteChanged = JSON.stringify(site.edits) !== JSON.stringify(site.live_edits);
  const waiting = pages.filter((p) => p.changed).length + (siteChanged ? 1 : 0);

  return (
    <>
      <TopBar user={user} on="bs-sites" />
      <main className="wrap">
        <div className="head">
          <div>
            <div className="eyebrow"><Link href="/body-shop/sites">Sites</Link></div>
            <h1 className="title">{site.name}</h1>
            <p className="sub">{site.city} · {site.domains[0]} · {pages.length} pages</p>
          </div>
          <div className="row">
            <a className="btn" href={`/s/${site.slug}/`} target="_blank" rel="noreferrer">View live site ↗</a>
          </div>
        </div>

        <SiteTools slug={site.slug} edits={site.edits} liveEdits={site.live_edits} domains={site.domains} waiting={waiting} />

        {GROUPS.map(([label, test]) => {
          const list = pages.filter((p) => test(p.path));
          if (!list.length) return null;
          return (
            <div key={label}>
              <div className="section-title">{label} <span style={{ opacity: 0.6 }}>· {list.length}</span></div>
              <div className="card">
                {list.map((p) => (
                  <Link key={p.id} href={`/body-shop/sites/${site.slug}/p/${p.id}`} className="bs-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="bs-row-title">{p.title}</div>
                      <div className="bs-row-sub">{p.path}</div>
                    </div>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      {p.changed ? <span className="chip warn">Unpublished</span> : <span className="chip ok">Live</span>}
                      {p.n > 0 && <span className="chip">{p.n} edit{p.n === 1 ? '' : 's'}</span>}
                      <span className="btn sm">Edit</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </main>
    </>
  );
}
