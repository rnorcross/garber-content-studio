import Link from 'next/link';
import type { SessionUser } from '@/lib/auth';

export default function TopBar({ user, on }: { user: SessionUser; on?: 'library' | 'new' | 'team' | 'account' }) {
  const tabs: [NonNullable<typeof on>, string, string][] = [
    ['library', '/', 'Library'],
    ['new', '/new', 'New Page'],
    ...(user.role === 'admin' ? [['team', '/team', 'Team'] as [NonNullable<typeof on>, string, string]] : []),
    ['account', '/account', 'Account'],
  ];
  return (
    <header className="topbar">
      <div className="in">
        <div className="top">
          <Link href="/" className="brand" aria-label="Content Studio home">
            <img src="/garber-logo-white.png" alt="Garber Automotive Group" />
            <span>Content Studio</span>
          </Link>
          <div className="who">
            <Link href="/account" className="pill-dark name">{user.name}</Link>
            <form action="/api/auth/logout" method="post"><button type="submit" className="pill-dark">Sign out</button></form>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {tabs.map(([id, href, label]) => (
            <Link key={id} href={href} className={on === id ? 'on' : ''} aria-current={on === id ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
