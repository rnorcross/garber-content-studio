'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

export default function Account({ name, email, mustReset }: { name: string; email: string; mustReset: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('');
    try {
      await api('/api/account/password', { current, next });
      setMsg('Password updated.'); setCurrent(''); setNext('');
      if (mustReset) setTimeout(() => (location.href = '/'), 800);
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <main className="wrap">
      <div className="head"><div><div className="eyebrow">Account</div><h1 className="title">{name}</h1><p className="sub">{email}</p></div></div>
      {mustReset && <div className="notice blue" style={{ marginBottom: 14, maxWidth: 480 }}>You signed in with a temporary password. Choose your own to continue.</div>}
      <form className="card card-pad stack" style={{ maxWidth: 480 }} onSubmit={submit}>
        <strong>Change password</strong>
        <div className="field"><label htmlFor="c">Current password</label><input id="c" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
        <div className="field"><label htmlFor="n">New password</label><input id="n" className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required /><span className="hint">At least 8 characters.</span></div>
        {msg && <p className="small" style={{ color: 'var(--ok)' }}>{msg}</p>}
        {error && <p className="err">{error}</p>}
        <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>Update password</button>
      </form>
    </main>
  );
}
