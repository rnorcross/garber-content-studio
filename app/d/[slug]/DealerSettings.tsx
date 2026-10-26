'use client';
import { useState } from 'react';
import MediaPicker from '@/components/MediaPicker';
import { api } from '@/lib/client';
import { defaultOgImage } from '@/lib/fragment';
import type { Dealership } from '@/lib/db';

const FIELDS: [keyof Form, string, string][] = [
  ['name', 'Name', ''], ['city', 'City', 'Saginaw, MI'], ['makes', 'Brands', 'Comma separated'], ['website', 'Website', 'https://…'],
  ['logo', 'Logo (color)', 'Image URL'], ['logoWhite', 'Logo (white)', 'Image URL'],
  ['imageH', 'Storefront (horizontal)', 'Image URL'], ['imageV', 'Storefront (vertical)', 'Image URL'],
];
type Form = { name: string; city: string; makes: string; website: string; logo: string; logoWhite: string; imageH: string; imageV: string; ogImage: string; notes: string };

/** Social image (and other brand details) for a dealership. Admins can edit; everyone can see. */
export default function DealerSettings({ d, canEdit }: { d: Dealership; canEdit: boolean }) {
  const [f, setF] = useState<Form>({
    name: d.name, city: d.city ?? '', makes: d.makes.join(', '), website: d.website ?? '', logo: d.logo ?? '', logoWhite: d.logo_white ?? '',
    imageH: d.image_h ?? '', imageV: d.image_v ?? '', ogImage: d.og_image ?? '', notes: d.notes ?? '',
  });
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<keyof Form | null>(null);
  const [imgOk, setImgOk] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const og = f.ogImage || defaultOgImage(d.slug);

  async function save() {
    setError(''); setMsg('');
    try { await api(`/api/dealerships/${d.id}`, f, 'PATCH'); setMsg('Saved'); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="card card-pad stack" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Social share image</strong>
        {canEdit && <button className="btn sm" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Edit dealership details'}</button>}
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="og-card" style={{ width: 300, flex: '0 0 auto' }}>
          <div className="og-img" style={{ backgroundImage: `url("${og}")` }}>
            <img src={og} alt="" hidden onError={() => setImgOk(false)} onLoad={() => setImgOk(true)} />
          </div>
        </div>
        <div className="stack" style={{ gap: 6, flex: '1 1 260px' }}>
          <p className="small">Every page for {d.name} uses this image in its Open Graph and Twitter tags, so shared links show this store. Use 1200×630.</p>
          <span className="url">{og}</span>
          {!imgOk && <span className="chip warn" style={{ alignSelf: 'flex-start' }}>Image not found at this URL — upload one</span>}
          {!f.ogImage && <span className="small muted">Using the standard assets.garberauto.com path for this store.</span>}
          {canEdit && (
            <span className="row">
              <button className="btn sm" onClick={() => setPicking('ogImage')}>Choose or upload</button>
              {f.ogImage && <button className="btn sm ghost" onClick={() => setF({ ...f, ogImage: '' })}>Use standard path</button>}
              <button className="btn sm primary" onClick={save}>Save</button>
            </span>
          )}
        </div>
      </div>
      {open && canEdit && (
        <div className="stack">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {FIELDS.map(([k, label, ph]) => (
              <div key={k} className="field">
                <label htmlFor={`d-${k}`}>{label}</label>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input id={`d-${k}`} className="input" value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                  {['logo', 'logoWhite', 'imageH', 'imageV'].includes(k) && <button className="btn sm" onClick={() => setPicking(k)}>Pick</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="field"><label htmlFor="d-notes">Notes for Claude</label><textarea id="d-notes" className="textarea" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Anything Claude should know when building this store’s pages" /></div>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={save}>Save dealership</button>
        </div>
      )}
      {msg && <p className="small" style={{ color: 'var(--ok)' }}>{msg}</p>}
      {error && <p className="err">{error}</p>}
      {picking && (
        <MediaPicker dealershipId={d.id} dealerSlug={d.slug} dealerName={d.name} onClose={() => setPicking(null)}
          onPick={(url) => { setF({ ...f, [picking]: url }); setPicking(null); setImgOk(true); }} />
      )}
    </div>
  );
}
