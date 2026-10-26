'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadMedia, absolute, type Media } from '@/lib/upload';
import { api, copyText } from '@/lib/client';
import { formatBytes } from '@/lib/fragment';

type Dealer = { id: number; name: string; slug: string };

export default function MediaLibrary({ dealers, initialDealer, mode, total, totalBytes }: {
  dealers: Dealer[]; initialDealer: string; mode: 'blob' | 'local'; total: number; totalBytes: number;
}) {
  const [filter, setFilter] = useState(initialDealer); // '' all, 'group', or dealer id
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Media[] | null>(null);
  const [selected, setSelected] = useState<Media | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadTarget = filter && filter !== 'group' ? dealers.find((d) => String(d.id) === filter) ?? null : null;

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (filter) p.set('d', filter);
    if (q.trim()) p.set('q', q.trim());
    fetch(`/api/media?${p}`).then((r) => r.json()).then((d) => setItems(d.items ?? []));
  }, [filter, q]);
  useEffect(load, [load]);

  async function upload(files: FileList | File[] | null) {
    if (!files || !files.length) return;
    setError(''); setMsg('');
    const list = Array.from(files);
    let done = 0;
    for (const f of list) {
      setQueue((qq) => [...qq, f.name]);
      try {
        await uploadMedia(f, { dealershipId: uploadTarget?.id ?? null, dealerSlug: uploadTarget?.slug ?? null });
        done++;
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`);
      } finally {
        setQueue((qq) => qq.filter((n) => n !== f.name));
      }
    }
    if (done) setMsg(`Uploaded ${done} file${done > 1 ? 's' : ''} to ${uploadTarget?.name ?? 'the group library'}.`);
    load();
  }

  async function save(m: Media, patch: Record<string, unknown>) {
    try {
      await api(`/api/media/${m.id}`, patch, 'PATCH');
      setMsg('Saved'); load();
    } catch (e) { setError((e as Error).message); }
  }

  async function remove(m: Media) {
    if (!confirm(`Delete ${m.filename}? Pages using this URL would lose the image.`)) return;
    try {
      await api(`/api/media/${m.id}`, undefined, 'DELETE');
      setSelected(null); load(); setMsg('Deleted');
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <main className="wrap">
      <div className="head">
        <div>
          <div className="eyebrow">Media</div>
          <h1 className="title">Images & video</h1>
          <p className="sub">
            {total.toLocaleString()} file{total === 1 ? '' : 's'} · {formatBytes(totalBytes)} ·{' '}
            {mode === 'blob' ? 'stored in Vercel Blob, served from its global CDN' : 'local development storage (connect a Blob store on Vercel for production)'}
          </p>
        </div>
        <button className="btn primary" onClick={() => fileRef.current?.click()}>Upload</button>
        <input ref={fileRef} type="file" multiple accept="image/*,video/mp4,video/webm,application/pdf" hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </div>

      {msg && <div className="notice ok" style={{ marginBottom: 12 }}>{msg}</div>}
      {error && <div className="notice warn" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="row" style={{ marginBottom: 14 }}>
        <select className="select" style={{ maxWidth: 300 }} value={filter} onChange={(e) => { setFilter(e.target.value); setSelected(null); }} aria-label="Dealership">
          <option value="">All dealerships</option>
          <option value="group">Group (no dealership)</option>
          {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search file names and alt text" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>

      <div className={`dropzone${over ? ' over' : ''}`} style={{ marginBottom: 16 }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        Drop files here to upload them to <strong>{uploadTarget?.name ?? 'the group library'}</strong>.
        {!uploadTarget && <span className="small"> Pick a dealership above to file them under that store.</span>}
        <div className="small" style={{ marginTop: 4 }}>Photos wider than 2,400px are scaled down automatically. JPG, PNG, WebP, GIF, SVG, MP4, WebM and PDF.</div>
        {queue.length > 0 && <div className="small" style={{ marginTop: 8, color: 'var(--blue)' }}>Uploading {queue.join(', ')}…</div>}
      </div>

      <div className="editor" style={{ gridTemplateColumns: selected ? 'minmax(0,1fr) 340px' : 'minmax(0,1fr)' }}>
        <div>
          {!items && <p className="muted">Loading…</p>}
          {items && !items.length && <div className="card empty">No files here yet.</div>}
          <div className="media-grid">
            {items?.map((m) => (
              <button key={m.id} className={`media-tile${selected?.id === m.id ? ' on' : ''}`} onClick={() => setSelected(m)}>
                <span className="media-thumb" style={{ backgroundImage: m.content_type?.startsWith('image/') ? `url("${m.url}")` : undefined }}>
                  {!m.content_type?.startsWith('image/') && <span className="small muted">{m.content_type?.split('/')[1]?.toUpperCase()}</span>}
                </span>
                <span className="media-name">{m.filename}</span>
                <span className="small muted">{m.dealership ?? 'Group'}</span>
              </button>
            ))}
          </div>
        </div>
        {selected && <Details key={selected.id} m={selected} dealers={dealers} onSave={save} onDelete={remove} onCopied={() => setMsg('URL copied')} />}
      </div>
    </main>
  );
}

function Details({ m, dealers, onSave, onDelete, onCopied }: {
  m: Media; dealers: Dealer[]; onSave: (m: Media, p: Record<string, unknown>) => void; onDelete: (m: Media) => void; onCopied: () => void;
}) {
  const [alt, setAlt] = useState(m.alt ?? '');
  const [dealer, setDealer] = useState(m.dealership_id ? String(m.dealership_id) : '');
  const url = absolute(m.url);
  return (
    <aside className="card panel">
      <div className="panel-body stack">
        {m.content_type?.startsWith('image/') && <img src={m.url} alt={m.alt ?? ''} style={{ width: '100%', borderRadius: 10, background: '#eceef6' }} />}
        {m.content_type?.startsWith('video/') && <video src={m.url} controls style={{ width: '100%', borderRadius: 10 }} />}
        <dl className="kv">
          <dt>File</dt><dd style={{ wordBreak: 'break-all' }}>{m.filename}</dd>
          <dt>Size</dt><dd>{[m.width && m.height ? `${m.width}×${m.height}` : '', m.size ? formatBytes(m.size) : ''].filter(Boolean).join(' · ')}</dd>
          <dt>Uploaded</dt><dd>{new Date(m.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}{m.uploaded_by_name ? ` · ${m.uploaded_by_name}` : ''}</dd>
        </dl>
        <div className="field">
          <label htmlFor="murl">URL</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="murl" className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="btn sm" onClick={async () => { await copyText(url); onCopied(); }}>Copy</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="malt">Alt text</label>
          <input id="malt" className="input" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image for screen readers" />
        </div>
        <div className="field">
          <label htmlFor="mdl">Dealership</label>
          <select id="mdl" className="select" value={dealer} onChange={(e) => setDealer(e.target.value)}>
            <option value="">Group (no dealership)</option>
            {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => onSave(m, { alt, dealershipId: dealer || null })}>Save</button>
          <button className="btn danger" onClick={() => onDelete(m)}>Delete</button>
        </div>
      </div>
    </aside>
  );
}
