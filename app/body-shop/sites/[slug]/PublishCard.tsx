'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, copyText } from '@/lib/client';

const local = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
/** A datetime-local value for "tomorrow at 6:00 am" in the viewer's time zone. */
function tomorrow6() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(6, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** Publish now, schedule a publish, share a preview link, or (without publish rights) ask to publish. */
export default function PublishCard({ slug, waiting, canPublish, publishAt, publishBy, requests }: {
  slug: string; waiting: number; canPublish: boolean; publishAt: string | null; publishBy: string | null;
  requests: { id: number; user_name: string; note: string | null; created_at: string; page_title: string | null }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [at, setAt] = useState(tomorrow6());
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');

  async function run(label: string, body: object) {
    setBusy(label); setErr(''); setMsg('');
    try { const r = await api(`/api/body-shop/sites/${slug}`, body); router.refresh(); return r; }
    catch (e: any) { setErr(e.message); return null; }
    finally { setBusy(''); }
  }

  return (
    <div className="card card-pad stack">
      <div>
        <div className="bs-card-title" style={{ marginTop: 0 }}>Publish</div>
        <p className="sub" style={{ fontSize: 13.5 }}>
          {waiting ? `${waiting} ${waiting === 1 ? 'change is' : 'changes are'} waiting.` : 'Everything on this site is live.'}
          {canPublish ? ' Publishing puts every change live within a few seconds.' : ' You can save drafts; someone with publish rights puts them live.'}
        </p>
      </div>

      {publishAt && (
        <div className="bs-warn" style={{ background: 'var(--soft)', color: 'var(--ink)' }}>
          Scheduled to publish everything {local(publishAt)}{publishBy ? ` (set by ${publishBy})` : ''}.
          {canPublish && <button className="btn sm ghost danger" style={{ marginLeft: 8 }} disabled={!!busy} onClick={() => run('unsched', { action: 'schedule', at: null })}>Cancel</button>}
        </div>
      )}

      {canPublish ? (
        <>
          <div className="row">
            <button className="btn primary" disabled={!waiting || !!busy} onClick={() => run('publish', { action: 'publish-all' })}>
              {busy === 'publish' ? 'Publishing…' : 'Publish all changes'}
            </button>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={{ maxWidth: 230 }} />
            <button className="btn" disabled={!!busy || !at} onClick={async () => { if (await run('sched', { action: 'schedule', at: new Date(at).toISOString() })) setMsg('Scheduled.'); }}>
              {busy === 'sched' ? 'Scheduling…' : 'Schedule'}
            </button>
          </div>
          <span className="hint">A scheduled publish puts live whatever is waiting at that time, including edits made after you schedule it.</span>
        </>
      ) : (
        <>
          <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note: what changed, and when it should go live" />
          <div className="row">
            <button className="btn primary" disabled={!waiting || !!busy} onClick={async () => { if (await run('req', { action: 'request', note })) { setNote(''); setMsg('Sent. It shows on the Overview for the people who can publish.'); } }}>
              Ask to publish
            </button>
          </div>
        </>
      )}

      <div className="row">
        <button className="btn sm" disabled={!!busy} onClick={async () => {
          const r = await run('link', { action: 'preview-link', days: 7 });
          if (r?.url) { const full = location.origin + r.url; setLink(full); await copyText(full); }
        }}>Share a preview link</button>
        <span className="sub" style={{ fontSize: 12.5 }}>Anyone with the link sees the unpublished changes for 7 days, no sign-in.</span>
      </div>
      {link && <div className="bs-change-by">Copied: <a href={link} target="_blank" rel="noreferrer">{link}</a></div>}

      {requests.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="section-title" style={{ margin: 0 }}>Asked to publish</div>
          {requests.map((r) => (
            <div key={r.id} className="bs-edit" style={{ borderTop: 0, padding: 0 }}>
              <span className="chip warn">{r.page_title ?? 'Whole site'}</span>
              <span>{r.user_name}{r.note ? `: “${r.note}”` : ''}</span>
              <span className="bs-row-sub">{local(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="sub" style={{ color: 'var(--ok)', fontSize: 13.5 }}>{msg}</p>}
      {err && <p className="bs-err">{err}</p>}
    </div>
  );
}
