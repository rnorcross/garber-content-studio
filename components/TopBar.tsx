import Link from 'next/link';
import type { SessionUser } from '@/lib/auth';

export type Section = 'library' | 'new' | 'media' | 'templates' | 'team' | 'account';

export default function TopBar({ user, on }: { user: SessionUser; on?: Section }) {
  const tabs: [Section, string, string][] = [
    ['library', '/', 'Library'],
    ['new', '/new', 'New Page'],
    ['media', '/media', 'Media'],
    ...(user.role === 'admin'
      ? ([['templates', '/templates', 'Templates'], ['team', '/team', 'Team']] as [Section, string, string][])
      : []),
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
