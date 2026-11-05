import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';
import { getPage, pageChanged, type BsSite } from '@/lib/bodyshop';
import PageEditor from './PageEditor';

export const dynamic = 'force-dynamic';

export default async function EditPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const user = await requireUser();
  const { slug, id } = await params;
  const page = await getPage(Number(id));
  if (!page) notFound();
  const [site] = await sql<BsSite[]>`select * from bs_sites where id = ${page.site_id} and slug = ${slug}`;
  if (!site) notFound();
  const history = await sql<{ id: number; user_name: string; created_at: string; note: string | null }[]>`
    select id, user_name, created_at, note from bs_publishes where page_id = ${page.id} order by created_at desc limit 20`;
  // Original search text, so the fields can show what's live when nothing's been changed.
  const orig = {
    title: page.base_html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '',
    description: page.base_html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '',
  };

  return (
    <>
      <TopBar user={user} on="bs-sites" />
      <PageEditor
        site={{ slug: site.slug, name: site.name, edits: site.edits, liveEdits: site.live_edits }}
        page={{ id: page.id, path: page.path, title: page.title, meta: page.meta, edits: page.edits, liveEdits: page.live_edits, publishedAt: page.published_at, publishedBy: page.published_by }}
        orig={orig}
        changed={pageChanged(site, page)}
        history={history}
      />
    </>
  );
}
