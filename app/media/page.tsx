import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { storageMode } from '@/lib/storage';
import TopBar from '@/components/TopBar';
import MediaLibrary from './MediaLibrary';

export const dynamic = 'force-dynamic';

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await requireUser();
  const { d } = await searchParams;
  const dealers = await sql<{ id: number; name: string; slug: string }[]>`select id, name, slug from dealerships order by sort, name`;
  const [{ count, bytes }] = await sql<{ count: number; bytes: number }[]>`select count(*)::int as count, coalesce(sum(size), 0)::bigint::float as bytes from media`;
  return (
    <>
      <TopBar user={user} on="media" />
      <MediaLibrary dealers={dealers} initialDealer={d ?? ''} mode={storageMode()} total={count} totalBytes={bytes} />
    </>
  );
}
