'use client';
import { useEffect, useRef, useState } from 'react';
import { uploadMedia, absolute, type Media } from '@/lib/upload';
import { formatBytes } from '@/lib/fragment';

type Props = {
  dealershipId: number | null;
  dealerSlug: string | null;
  dealerName: string | null;
  accept?: string;
  onPick: (url: string, media: Media) => void;
  onClose: () => void;
};

/** Modal for choosing a file from the media library or uploading a new one. */
export default function MediaPicker({ dealershipId, dealerSlug, dealerName, accept = 'image/*', onPick, onClose }: Props) {
  const [scope, setScope] = useState<'dealer' | 'all'>(dealershipId ? 'dealer' : 'all');
  const [items, setItems] = useState<Media[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = new URLSearchParams();
    if (scope === 'dealer') p.set('d', dealershipId ? String(dealershipId) : 'group');
    if (q.trim()) p.set('q', q.trim());
    setItems(null);
    fetch(`/api/media?${p}`).then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch((e) => setError(e.message));
  }, [scope, q, dealershipId, reload]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    try {
      let last: Media | null = null;
      for (const f of Array.from(files)) {
        setBusy(`Uploading ${f.name}…`);
        last = await uploadMedia(f, { dealershipId, dealerSlug, onProgress: (p) => setBusy(`Uploading ${f.name}… ${p}%`) });
      }
      if (last && files.length === 1) { onPick(absolute(last.url), last); return; }
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(''); }
  }

  const images = (items ?? []).filter((m) => accept === '*' || !m.content_type || m.content_type.startsWith(accept.replace('/*', '/')));

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Media library" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal card">
        <div className="modal-head">
          <strong>Choose an image</strong>
          <button className="btn sm ghost" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <div className="seg">
            {dealershipId && <button className={scope === 'dealer' ? 'on' : ''} onClick={() => setScope('dealer')}>{dealerName}</button>}
            {!dealershipId && <button className={scope === 'dealer' ? 'on' : ''} onClick={() => setScope('dealer')}>Group</button>}
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All dealerships</button>
          </div>
          <input className="input" style={{ maxWidth: 220, height: 34 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search media" />
          <span style={{ flex: 1 }} />
          <button className="btn sm primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>Upload</button>
          <input ref={fileRef} type="file" accept={accept === '*' ? undefined : accept} multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
        {busy && <div className="notice blue" style={{ borderRadius: 0 }}>{busy}</div>}
        {error && <div className="notice warn" style={{ borderRadius: 0 }}>{error}</div>}
        <div className="modal-body">
          {!items && <p className="muted small">Loading…</p>}
          {items && !images.length && <p className="muted small">Nothing here yet. Upload a file to add it to the library.</p>}
          <div className="media-grid">
            {images.map((m) => (
              <button key={m.id} className="media-tile" onClick={() => onPick(absolute(m.url), m)} title={m.alt || m.filename}>
                <span className="media-thumb" style={{ backgroundImage: m.content_type?.startsWith('image/') ? `url("${m.url}")` : undefined }}>
                  {!m.content_type?.startsWith('image/') && <span className="small muted">{m.content_type?.split('/')[1]?.toUpperCase()}</span>}
                </span>
                <span className="media-name">{m.filename}</span>
                <span className="small muted">{[m.width && m.height ? `${m.width}×${m.height}` : '', m.size ? formatBytes(m.size) : ''].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
