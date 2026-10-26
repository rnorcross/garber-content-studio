'use client';
import { useEffect, useState } from 'react';

type Status = {
  database: boolean; blob: boolean; authSecret: boolean; adminConfigured: boolean; claude: boolean;
  tables: boolean; users: number; pages: number; dealerships: number; error: string | null;
};

export default function Setup() {
  const [s, setS] = useState<Status | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const load = () => fetch('/api/setup').then((r) => r.json()).then(setS).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setLog([]);
    try {
      const r = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const d = await r.json().catch(() => ({ error: `Setup failed (${r.status})` }));
      setLog(d.log ?? []);
      if (!r.ok) throw new Error(d.error || 'Setup failed');
      setDone(true);
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const checks: [string, boolean, string][] = s ? [
    ['Database (Neon)', s.database, 'Connect Neon under Storage in Vercel, then redeploy.'],
    ['Image storage (Blob)', s.blob, 'Connect a public Blob store under Storage, then redeploy.'],
    ['AUTH_SECRET', s.authSecret, 'Add a random string of 32+ characters, then redeploy.'],
    ['ADMIN_EMAIL / ADMIN_PASSWORD', s.adminConfigured, 'Add both in Environment Variables, then redeploy.'],
    ['ANTHROPIC_API_KEY', s.claude, 'Optional for setup — needed for Generate and Ask Claude.'],
  ] : [];
  const ready = !!s && s.database && s.authSecret && (s.users > 0 || s.adminConfigured);
  const loaded = !!s && s.users > 0 && s.pages > 0;

  return (
    <main className="login">
      <div className="stack" style={{ width: '100%', maxWidth: 520 }}>
        <img src="/garber-logo-white.png" alt="Garber Automotive Group" />
        <div className="card stack" style={{ padding: 32 }}>
          <div>
            <div className="eyebrow">Content Studio</div>
            <h1 className="title" style={{ marginTop: 6 }}>Setup</h1>
            <p className="sub">Creates the database tables, your admin account, the shared images, and the pre-built pages for every dealership. Safe to run again — it only adds what’s missing.</p>
          </div>

          {!s && !error && <p className="muted small">Checking…</p>}
          {s && (
            <div className="stack" style={{ gap: 8 }}>
              {checks.map(([label, ok, fix]) => (
                <div key={label} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <span className={`chip ${ok ? 'ok' : label.startsWith('ANTHROPIC') ? '' : 'warn'}`} style={{ minWidth: 64, justifyContent: 'center' }}>{ok ? 'Ready' : 'Missing'}</span>
                  <span className="small"><strong>{label}</strong>{!ok && <span className="muted"> — {fix}</span>}</span>
                </div>
              ))}
              {s.tables && <p className="small muted">Loaded so far: {s.dealerships} dealerships · {s.pages} pages · {s.users} account{s.users === 1 ? '' : 's'}.</p>}
              {s.error && <p className="err">{s.error}</p>}
            </div>
          )}

          {loaded && !done && (
            <div className="notice ok">Setup has already run. <a href="/login">Sign in</a>. An admin can run it again from here after signing in.</div>
          )}

          {s && s.users === 0 && (
            <form className="stack" onSubmit={run}>
              <p className="small">Enter the <strong>ADMIN_EMAIL</strong> and <strong>ADMIN_PASSWORD</strong> you set in Vercel. They become your admin sign-in.</p>
              <div className="field"><label htmlFor="se">Admin email</label><input id="se" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="field"><label htmlFor="sp">Admin password</label><input id="sp" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <button className="btn primary" type="submit" disabled={busy || !ready}>{busy ? 'Setting up — about a minute…' : 'Run setup'}</button>
            </form>
          )}
          {s && s.users > 0 && (
            <button className="btn" onClick={run} disabled={busy || !ready}>{busy ? 'Running…' : 'Run setup again (admins)'}</button>
          )}

          {busy && <div className="progress"><i /></div>}
          {log.length > 0 && <pre className="code small" style={{ background: 'var(--soft)', padding: 12, borderRadius: 10, whiteSpace: 'pre-wrap', margin: 0 }}>{log.join('\n')}</pre>}
          {error && <p className="err" role="alert">{error}</p>}
          {done && <a className="btn dark" href="/login">Setup complete — sign in</a>}
        </div>
      </div>
    </main>
  );
}
