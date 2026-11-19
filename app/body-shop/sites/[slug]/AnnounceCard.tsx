'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import type { Announce } from '@/lib/bodyshop';

const BG = { navy: '#002256', red: '#b3261e', gold: '#b8922f', green: '#0a6b45' } as const;
const toLocal = (iso?: string) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

/** The bar across the top of every page, with optional start and end times. */
export default function AnnounceCard({ slug, announce, live }: { slug: string; announce: Announce; live: Announce }) {
  const router = useRouter();
  const [a, setA] = useState<Announce>(announce);
  const [start, setStart] = useState(toLocal(announce.start));
  const [end, setEnd] = useState(toLocal(announce.end));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function save(clear = false) {
    setBusy(true); setErr(''); setMsg('');
    try {
      await api(`/api/body-shop/sites/${slug}`, clear ? { action: 'announce' } : {
        action: 'announce', ...a,
        start: start ? new Date(start).toISOString() : '', end: end ? new Date(end).toISOString() : '',
      });
      if (clear) { setA({}); setStart(''); setEnd(''); }
      setMsg(clear ? 'Removed from the draft. Publish to take it down.' : 'Saved to draft. Publish to show it.');
      router.refresh();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const isLive = !!live.text;
  return (
    <div className="card card-pad stack" style={{ gridColumn: '1 / -1' }}>
      <div>
        <div className="bs-card-title" style={{ marginTop: 0 }}>Announcement bar {isLive && <span className="chip ok">Live</span>}</div>
        <p className="sub" style={{ fontSize: 13.5 }}>A bar across the top of every page, for holiday hours, a closure or a promotion. Set an end time and it takes itself down.</p>
      </div>
      {a.text && (
        <div style={{ background: BG[a.color ?? 'navy'], color: '#fff', padding: '10px 16px', borderRadius: 8, textAlign: 'center', fontWeight: 600, fontSize: 14 }}>
          {a.text}{a.linkText && <u style={{ marginLeft: 6, fontWeight: 700 }}>{a.linkText}</u>}
        </div>
      )}
      <div className="field"><label>Message <span style={{ float: 'right' }}>{(a.text ?? '').length}/240</span></label>
        <input className="input" value={a.text ?? ''} onChange={(e) => setA({ ...a, text: e.target.value })} placeholder="Closed Thursday, Nov 26 for Thanksgiving. Open Friday 7:30am." /></div>
      <div className="bs-info-grid">
        <div className="field"><label>Link text (optional)</label>
          <input className="input" value={a.linkText ?? ''} onChange={(e) => setA({ ...a, linkText: e.target.value })} placeholder="Request an estimate" /></div>
        <div className="field"><label>Link goes to</label>
          <input className="input" value={a.href ?? ''} onChange={(e) => setA({ ...a, href: e.target.value })} placeholder="/request-estimate/" /></div>
        <div className="field"><label>Show from (optional)</label>
          <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field"><label>Take down at (optional)</label>
          <input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <div className="row">
        <span className="sub" style={{ fontSize: 13 }}>Color</span>
        {(Object.keys(BG) as (keyof typeof BG)[]).map((c) => (
          <button key={c} type="button" title={c} onClick={() => setA({ ...a, color: c })}
            style={{ width: 26, height: 26, borderRadius: '50%', background: BG[c], border: (a.color ?? 'navy') === c ? '3px solid var(--ink)' : '2px solid #fff', boxShadow: '0 0 0 1px var(--line)', cursor: 'pointer' }} />
        ))}
      </div>
      <div className="row">
        <button className="btn dark" disabled={busy || !(a.text ?? '').trim()} onClick={() => save()}>Save to draft</button>
        {(announce.text || isLive) && <button className="btn ghost danger" disabled={busy} onClick={() => save(true)}>Remove</button>}
      </div>
      {msg && <p className="sub" style={{ color: 'var(--ok)', fontSize: 13.5 }}>{msg}</p>}
      {err && <p className="bs-err">{err}</p>}
    </div>
  );
}
