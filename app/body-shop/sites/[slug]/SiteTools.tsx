'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import type { Edit } from '@/lib/bodyshop';

/** Site-wide changes: find & replace on every page, publish everything, domains. */
export default function SiteTools({ slug, edits, liveEdits, domains, waiting }: {
  slug: string; edits: Edit[]; liveEdits: Edit[]; domains: string[]; waiting: number;
}) {
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const live = new Set(liveEdits.map((e) => e.id));

  async function run(label: string, body: object) {
    setBusy(label); setErr('');
    try { await api(`/api/body-shop/sites/${slug}`, body); router.refresh(); return true; }
    catch (e: any) { setErr(e.message); return false; }
    finally { setBusy(''); }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginBottom: 8 }}>
      <div className="card card-pad stack">
        <div>
          <div className="bs-card-title" style={{ marginTop: 0 }}>Publish</div>
          <p className="sub" style={{ fontSize: 13.5 }}>
            {waiting ? `${waiting} ${waiting === 1 ? 'change is' : 'changes are'} waiting. Publishing puts every page’s edits live within a few seconds.` : 'Everything on this site is live.'}
          </p>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!waiting || !!busy} onClick={() => run('publish', { action: 'publish-all' })}>
            {busy === 'publish' ? 'Publishing…' : 'Publish all changes'}
          </button>
        </div>
      </div>

      <div className="card card-pad stack">
        <div>
          <div className="bs-card-title" style={{ marginTop: 0 }}>Find &amp; replace on every page</div>
          <p className="sub" style={{ fontSize: 13.5 }}>For a new phone number, hours, an address or a name. Also updates links, page titles and search markup.</p>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" placeholder="Find, e.g. (989) 474-3816" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input" placeholder="Replace with" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="row">
          <button className="btn dark" disabled={!from.trim() || !!busy}
            onClick={async () => { if (await run('replace', { action: 'replace', from, to })) { setFrom(''); setTo(''); } }}>
            {busy === 'replace' ? 'Adding…' : 'Add to draft'}
          </button>
          <span className="sub" style={{ fontSize: 12.5 }}>Phone links use digits only, e.g. +19894743816. Add a second replace for those.</span>
        </div>
      </div>

      {edits.length > 0 && (
        <div className="card card-pad stack" style={{ gridColumn: '1 / -1' }}>
          <div className="bs-card-title" style={{ marginTop: 0 }}>Site-wide changes</div>
          {edits.map((e) => (
            <div key={e.id} className="bs-edit">
              <span className={'chip' + (live.has(e.id) ? ' ok' : ' warn')}>{live.has(e.id) ? 'Live' : 'Draft'}</span>
              <span className="bs-edit-kind">{e.kind === 'replace' ? 'Replace' : e.kind === 'img' ? 'Image' : 'Text'}</span>
              <span className="bs-edit-from">{e.kind === 'img' ? e.from.split('/').pop() : e.from}</span>
              <span>→</span>
              <span className="bs-edit-to">{e.kind === 'img' ? e.to.split('/').pop() : e.to.replace(/<[^>]+>/g, '')}</span>
              <button className="btn sm ghost danger" disabled={!!busy} onClick={() => run('rm', { action: 'remove', id: e.id })}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad stack" style={{ gridColumn: '1 / -1' }}>
        <div className="bs-card-title" style={{ marginTop: 0 }}>Domains</div>
        <p className="sub" style={{ fontSize: 13.5 }}>
          Answers on <strong>{domains.join(', ')}</strong> once those domains are added to this Vercel project and
          their DNS points here. Until then, the site is viewable at{' '}
          <a href={`/s/${slug}/`} target="_blank" rel="noreferrer">/s/{slug}/</a> on the studio’s address.
        </p>
      </div>
      {err && <p style={{ color: 'var(--bad)', gridColumn: '1 / -1' }}>{err}</p>}
    </div>
  );
}
