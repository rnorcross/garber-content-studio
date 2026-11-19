import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';
import { getPage, getSite, pageChanged, brokenEdits, canPublish } from '@/lib/bodyshop';
import PageEditor from './PageEditor';

export const dynamic = 'force-dynamic';

export default async function EditPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const user = await requireUser();
  const { slug, id } = await params;
  const page = await getPage(Number(id));
  if (!page) notFound();
  const site = await getSite(slug);
  if (!site || site.id !== page.site_id) notFound();
  const broken = [...brokenEdits(site, page)];
  const history = await sql<{ id: number; user_name: string; created_at: string; note: string | null }[]>`
    select id, user_name, created_at, note from bs_publishes where page_id = ${page.id} order by created_at desc limit 20`;
  // Original search text, so the fields can show what's live when nothing's been changed.
  const orig = {
    title: page.base_html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '',
    description: page.base_html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '',
    // Share image as served from the studio (the page's /og/ files live under /sites/<slug>/og/).
    ogImage: (page.base_html.match(/<meta property="og:image" content="([^"]*)"/)?.[1] ?? '').replace(/^https?:\/\/[^/]+\/og\//, `/sites/${site.slug}/og/`),
  };
  const pages = await sql<{ path: string; title: string }[]>`select path, title from bs_pages where site_id = ${site.id} and status = 'live' order by path`;

  return (
    <>
      <TopBar user={user} on="bs-sites" />
      <PageEditor
        site={{ id: site.id, slug: site.slug, name: site.name, edits: site.edits, liveEdits: site.live_edits }}
        page={{ id: page.id, path: page.path, title: page.title, meta: page.meta, liveMeta: page.live_meta, edits: page.edits, liveEdits: page.live_edits, publishedAt: page.published_at, publishedBy: page.published_by, status: page.status }}
        pages={pages}
        canPublish={await canPublish(user)}
        others={await sql<{ slug: string; name: string }[]>`select slug, name from bs_sites where id <> ${site.id} order by name`}
        orig={orig}
        changed={pageChanged(site, page)}
        broken={broken}
        history={history}
      />
    </>
  );
}
