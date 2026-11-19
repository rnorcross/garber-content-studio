import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';
import { getSite, siteChanged, canPublish, ASSET_MANIFEST, type BsPage } from '@/lib/bodyshop';
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
  const pages = await sql<(Pick<BsPage, 'id' | 'path' | 'title' | 'published_at' | 'published_by' | 'status'> & { changed: boolean; n: number })[]>`
    select id, path, title, published_at, published_by, status,
      (edits <> live_edits or meta <> live_meta or status = 'draft') as changed, jsonb_array_length(edits)::int as n
    from bs_pages where site_id = ${site.id} order by path`;
  const redirects = await sql<{ id: number; from_path: string; to_path: string; note: string | null; created_by: string | null }[]>`
    select id, from_path, to_path, note, created_by from bs_redirects where site_id = ${site.id} order by from_path`;
  const requests = await sql<{ id: number; user_name: string; note: string | null; created_at: string; page_title: string | null }[]>`
    select r.id, r.user_name, r.note, r.created_at, p.title as page_title from bs_requests r left join bs_pages p on p.id = r.page_id
    where r.site_id = ${site.id} and r.resolved_at is null order by r.created_at desc`;
  const others = await sql<{ slug: string; name: string }[]>`select slug, name from bs_sites where id <> ${site.id} order by name`;
  const publisher = await canPublish(user);
  const waiting = pages.filter((p) => p.changed).length + (siteChanged(site) ? 1 : 0);

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

        <SiteTools slug={site.slug} edits={site.edits} liveEdits={site.live_edits} domains={site.domains} waiting={waiting} redirects={redirects}
          canPublish={publisher} publishAt={site.publish_at ? new Date(site.publish_at).toISOString() : null} publishBy={site.publish_by} requests={JSON.parse(JSON.stringify(requests))}
          announce={site.announce} liveAnnounce={site.live_announce} others={others}
          isAdmin={user.role === 'admin'} files={(ASSET_MANIFEST as Record<string, { path: string; size: number }[]>)[site.slug] ?? []} assetBase={site.asset_base} />

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
                      {p.status === 'hidden' ? <span className="chip bad">Hidden</span>
                        : p.status === 'draft' ? <span className="chip warn">New, not published</span>
                        : p.changed ? <span className="chip warn">Unpublished</span> : <span className="chip ok">Live</span>}
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
