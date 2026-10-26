'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

type U = { id: number; name: string; email: string; role: string; must_reset: boolean };

function tempPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) => a[n % a.length]).join('');
}

export default function Team({ users, me }: { users: U[]; me: number }) {
  const [list, setList] = useState(users);
  const [f, setF] = useState({ name: '', email: '', role: 'editor', password: tempPassword() });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('');
    try {
      await api('/api/users', f);
      setMsg(`${f.name} can sign in with ${f.email} and the temporary password ${f.password}. They’ll pick their own password on first sign-in.`);
      setList([...list, { id: Date.now(), name: f.name, email: f.email.toLowerCase(), role: f.role, must_reset: true }]);
      setF({ name: '', email: '', role: 'editor', password: tempPassword() });
      setTimeout(() => location.reload(), 100);
    } catch (e) { setError((e as Error).message); }
  }

  async function reset(u: U) {
    const pw = tempPassword();
    try { await api(`/api/users/${u.id}`, { password: pw }, 'PATCH'); setMsg(`New temporary password for ${u.name}: ${pw}`); }
    catch (e) { setError((e as Error).message); }
  }
  async function role(u: U, r: string) {
    try { await api(`/api/users/${u.id}`, { role: r }, 'PATCH'); setList(list.map((x) => (x.id === u.id ? { ...x, role: r } : x))); }
    catch (e) { setError((e as Error).message); }
  }
  async function remove(u: U) {
    if (!confirm(`Remove ${u.name}? Their past edits stay in page history.`)) return;
    try { await api(`/api/users/${u.id}`, undefined, 'DELETE'); setList(list.filter((x) => x.id !== u.id)); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <main className="wrap">
      <div className="head">
        <div>
          <div className="eyebrow">Team</div>
          <h1 className="title">Who can sign in</h1>
          <p className="sub">Editors can create, edit and mark pages live. Admins can also manage the team.</p>
        </div>
      </div>
      {msg && <div className="notice ok" style={{ marginBottom: 14 }}>{msg}</div>}
      {error && <div className="notice warn" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card table-scroll" style={{ marginBottom: 24 }}>
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong>{u.must_reset && <span className="chip" style={{ marginLeft: 8 }}>Temp password</span>}</td>
                <td className="small">{u.email}</td>
                <td>
                  <select className="select" style={{ width: 120 }} value={u.role} disabled={u.id === me} onChange={(e) => role(u, e.target.value)} aria-label={`Role for ${u.name}`}>
                    <option value="editor">Editor</option><option value="admin">Admin</option>
                  </select>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {u.id !== me && <span className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sm" onClick={() => reset(u)}>Reset password</button>
                    <button className="btn sm danger" onClick={() => remove(u)}>Remove</button>
                  </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card card-pad stack" style={{ maxWidth: 560 }} onSubmit={add}>
        <strong>Add a teammate</strong>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}><label htmlFor="n">Name</label><input id="n" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="e">Email</label><input id="e" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ width: 140 }}><label htmlFor="r">Role</label>
            <select id="r" className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="editor">Editor</option><option value="admin">Admin</option></select>
          </div>
          <div className="field" style={{ flex: 1 }}><label htmlFor="p">Temporary password</label><input id="p" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} /></div>
        </div>
        <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>Add teammate</button>
      </form>
    </main>
  );
}
