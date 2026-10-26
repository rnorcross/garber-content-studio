import Link from 'next/link';
import type { SessionUser } from '@/lib/auth';

export default function TopBar({ user, on }: { user: SessionUser; on?: 'library' | 'new' | 'team' | 'account' }) {
  return (
    <header className="topbar">
      <div className="in">
        <Link href="/" className="brand">Garber <small>Content Studio</small></Link>
        <nav className="nav" aria-label="Main">
          <Link href="/" className={on === 'library' ? 'on' : ''}>Library</Link>
          <Link href="/new" className={on === 'new' ? 'on' : ''}>New page</Link>
          {user.role === 'admin' && <Link href="/team" className={on === 'team' ? 'on' : ''}>Team</Link>}
        </nav>
        <div className="who">
          <Link href="/account" style={{ color: 'inherit' }}><span>{user.name}</span></Link>
          <form action="/api/auth/logout" method="post"><button type="submit">Sign out</button></form>
        </div>
      </div>
    </header>
  );
}
