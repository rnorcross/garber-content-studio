import Link from 'next/link';
import type { SessionUser } from '@/lib/auth';

export type Section =
  | 'library' | 'dealerships' | 'new' | 'media' | 'templates' | 'team' | 'account'
  | 'bs-overview' | 'bs-sites' | 'bs-leads';

// Line icons (24px grid, stroke only).
const I: Record<string, string> = {
  library: 'M4 5h16M4 12h16M4 19h10',
  dealerships: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
  new: 'M12 5v14M5 12h14',
  media: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01',
  templates: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  'bs-overview': 'M4 4h6v8H4zM14 4h6v5h-6zM14 13h6v7h-6zM4 16h6v4H4z',
  'bs-sites': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  'bs-leads': 'M4 4h16v12H5.17L4 17.17zM8 9h8M8 12h5',
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** The app's left-hand navigation (kept under its old name so every page keeps working). */
export default function TopBar({ user, on }: { user: SessionUser; on?: Section }) {
  const groups: { label: string; items: [Section, string, string][] }[] = [
    {
      label: 'Body Shop Websites',
      items: [
        ['bs-overview', '/body-shop', 'Overview'],
        ['bs-sites', '/body-shop/sites', 'Sites'],
        ['bs-leads', '/body-shop/leads', 'Leads'],
      ],
    },
    {
      label: 'Dealership Websites',
      items: [
        ['library', '/', 'Library'],
        ['dealerships', '/dealerships', 'Dealerships'],
        ['new', '/new', 'New Page'],
        ['media', '/media', 'Media'],
        ...(user.role === 'admin' ? ([['templates', '/templates', 'Templates']] as [Section, string, string][]) : []),
      ],
    },
    {
      label: 'Admin',
      items: [
        ...(user.role === 'admin' ? ([['team', '/team', 'Team']] as [Section, string, string][]) : []),
        ['account', '/account', 'Account'],
      ],
    },
  ];
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <aside className="side">
      <input type="checkbox" id="side-toggle" className="side-toggle" aria-label="Show menu" />
      <div className="side-in">
        <div className="side-top">
          <Link href="/" className="side-brand" aria-label="Website Studio home">
            <span className="side-mark">G</span>
            <span className="side-name">WEBSITE/STUDIO</span>
          </Link>
          <label htmlFor="side-toggle" className="side-burger" aria-hidden="true"><Icon d="M4 7h16M4 12h16M4 17h16" /></label>
        </div>
        <nav className="side-nav" aria-label="Main">
          {groups.map((g) => (
            <div key={g.label} className="side-group">
              <div className="side-label">{g.label}</div>
              {g.items.map(([id, href, label]) => (
                <Link key={id} href={href} className={'side-link' + (on === id ? ' on' : '')} aria-current={on === id ? 'page' : undefined}>
                  <Icon d={I[id]} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-who">
          <span className="side-avatar">{initials}</span>
          <div className="side-who-text">
            <Link href="/account" className="side-who-name">{user.name}</Link>
            <form action="/api/auth/logout" method="post"><button type="submit" className="side-out">Sign out</button></form>
          </div>
        </div>
      </div>
    </aside>
  );
}
