import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { sql, type Page, type LiveEvent } from '@/lib/db';
import { listTemplates } from '@/lib/templates';
import TopBar from '@/components/TopBar';
import Editor from './Editor';

export const dynamic = 'force-dynamic';

export default async function PageEditor({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [page] = await sql<(Page & { dealership: string | null; dslug: string | null; live_by: string | null })[]>`
    select p.*, d.name as dealership, d.slug as dslug, u.name as live_by
    from pages p left join dealerships d on d.id = p.dealership_id left join users u on u.id = p.live_marked_by
    where p.id = ${id}`;
  if (!page) notFound();
  const [cur] = await sql<{ html: string }[]>`
    select html from page_versions where page_id = ${id} and number = ${page.current_version}`;
  const dealers = await sql<{ id: number; name: string; slug: string; og_image: string | null; website: string | null }[]>`
    select id, name, slug, og_image, website from dealerships order by sort, name`;
  const templates = (await listTemplates(true)).map((t) => ({ slug: t.slug, name: t.name, url_pattern: t.url_pattern }));
  const log = await sql<LiveEvent[]>`
    select id, page_id, version, live_url, note, user_name, created_at from live_events where page_id = ${id} order by created_at desc`;

  return (
    <>
      <TopBar user={user} on="library" />
      <Editor
        page={JSON.parse(JSON.stringify(page))}
        initialHtml={cur?.html ?? ''}
        dealers={dealers}
        templates={templates}
        initialLog={JSON.parse(JSON.stringify(log))}
      />
    </>
  );
}
