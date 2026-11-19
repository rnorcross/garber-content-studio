import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import TopBar from '@/components/TopBar';
import Team from './Team';
import { ensureBodyShop } from '@/lib/bodyshop';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const user = await requireAdmin();
  await ensureBodyShop(); // adds the bs_publish column the first time
  const users = await sql<{ id: number; name: string; email: string; role: string; must_reset: boolean; bs_publish: boolean; created_at: string }[]>`
    select id, name, email, role, must_reset, bs_publish, created_at from users order by name`;
  return (
    <>
      <TopBar user={user} on="team" />
      <Team users={JSON.parse(JSON.stringify(users))} me={user.id} />
    </>
  );
}
