import { requireUser } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import Account from './Account';

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const user = await requireUser();
  const { reset } = await searchParams;
  return (
    <>
      <TopBar user={user} on="account" />
      <Account name={user.name} email={user.email} mustReset={!!reset} />
    </>
  );
}
