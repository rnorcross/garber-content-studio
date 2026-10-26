import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { listTemplates } from '@/lib/templates';
import TopBar from '@/components/TopBar';
import Templates from './Templates';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const user = await requireAdmin();
  const templates = await listTemplates(true);
  const pages = await sql<{ id: number; title: string }[]>`select id, title from pages where status <> 'archived' order by title`;
  const usage = await sql<{ page_type: string; n: number }[]>`select page_type, count(*)::int as n from pages where status <> 'archived' group by page_type`;
  return (
    <>
      <TopBar user={user} on="templates" />
      <Templates templates={JSON.parse(JSON.stringify(templates))} pages={pages}
        usage={Object.fromEntries(usage.map((u) => [u.page_type, u.n]))} />
    </>
  );
}
