import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { listTemplates } from '@/lib/templates';
import TopBar from '@/components/TopBar';
import NewPage from './NewPage';

export const dynamic = 'force-dynamic';

export default async function New({ searchParams }: { searchParams: Promise<{ d?: string; t?: string }> }) {
  const user = await requireUser();
  const { d, t } = await searchParams;
  const dealers = await sql<{ id: number; name: string; slug: string; og_image: string | null; website: string | null }[]>`
    select id, name, slug, og_image, website from dealerships order by sort, name`;
  const pages = await sql<{ id: number; title: string; dealership: string | null }[]>`
    select p.id, p.title, d.name as dealership from pages p left join dealerships d on d.id = p.dealership_id
    where p.status <> 'archived' order by p.updated_at desc limit 200`;
  const templates = await listTemplates();
  return (
    <>
      <TopBar user={user} on="new" />
      <NewPage dealers={dealers} pages={pages} templates={JSON.parse(JSON.stringify(templates))}
        initialDealer={d ? Number(d) : null} initialTemplate={t ?? null} />
    </>
  );
}
