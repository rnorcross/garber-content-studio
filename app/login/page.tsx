'use client';
import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Sign-in failed'); setBusy(false); return; }
    location.href = d.mustReset ? '/account?reset=1' : '/';
  }

  return (
    <main className="login">
      <form className="stack" onSubmit={submit} style={{ width: '100%', maxWidth: 400 }}>
        <img src="/garber-logo-white.png" alt="Garber Automotive Group" />
        <div className="card stack" style={{ padding: 32 }}>
        <div>
          <div className="eyebrow">Garber Automotive Group</div>
          <h1 className="title" style={{ marginTop: 6 }}>Content Studio</h1>
          <p className="sub">Sign in to manage dealership website content.</p>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </form>
    </main>
  );
}
