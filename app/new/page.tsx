import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';
import NewPage from './NewPage';

export const dynamic = 'force-dynamic';

export default async function New({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await requireUser();
  const { d } = await searchParams;
  const dealers = await sql<{ id: number; name: string }[]>`select id, name from dealerships order by sort, name`;
  const pages = await sql<{ id: number; title: string; dealership: string | null }[]>`
    select p.id, p.title, d.name as dealership from pages p left join dealerships d on d.id = p.dealership_id
    where p.status <> 'archived' order by p.updated_at desc limit 200`;
  return (
    <>
      <TopBar user={user} on="new" />
      <NewPage dealers={dealers} pages={pages} initialDealer={d ? Number(d) : null} />
    </>
  );
}
