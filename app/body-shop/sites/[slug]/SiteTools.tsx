'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import type { Edit } from '@/lib/bodyshop';

/** Site-wide changes: find & replace on every page, publish everything, domains. */
export default function SiteTools({ slug, edits, liveEdits, domains, waiting, redirects }: {
  slug: string; edits: Edit[]; liveEdits: Edit[]; domains: string[]; waiting: number;
  redirects: { id: number; from_path: string; to_path: string; note: string | null; created_by: string | null }[];
}) {
  const router = useRouter();
  const [rFrom, setRFrom] = useState('');
  const [rTo, setRTo] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [check, setCheck] = useState<{ pages: { id: number; path: string; title: string; broken: number }[]; siteBroken: string[] } | null>(null);
  const live = new Set(liveEdits.map((e) => e.id));

  async function runCheck() {
    setBusy('check'); setErr('');
    try { setCheck(await api(`/api/body-shop/sites/${slug}`, { action: 'check' })); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(''); }
  }

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
          <div className="bs-card-title" style={{ marginTop: 0 }}>Site info</div>
          <p className="sub" style={{ fontSize: 13.5 }}>Name, phone, address, hours, map and social links, and who gets form leads. Change them once and every page updates.</p>
        </div>
        <div className="row"><Link className="btn dark" href={`/body-shop/sites/${slug}/info`}>Edit site info</Link></div>
      </div>

      <div className="card card-pad stack">
        <div>
          <div className="bs-card-title" style={{ marginTop: 0 }}>Check edits</div>
          <p className="sub" style={{ fontSize: 13.5 }}>Finds edits that no longer match anything on their page, for example after a page is re-imported, so none fail silently.</p>
        </div>
        <div className="row"><button className="btn" disabled={!!busy} onClick={runCheck}>{busy === 'check' ? 'Checking every page…' : 'Check every page'}</button></div>
        {check && (check.pages.length === 0 && check.siteBroken.length === 0
          ? <p className="sub" style={{ fontSize: 13.5, color: 'var(--ok)' }}>Every edit matches its page.</p>
          : (
            <div className="stack" style={{ gap: 4 }}>
              {check.siteBroken.length > 0 && <p className="bs-warn">{check.siteBroken.length} site-wide {check.siteBroken.length === 1 ? 'edit matches' : 'edits match'} nothing on any page.</p>}
              {check.pages.map((p) => (
                <Link key={p.id} href={`/body-shop/sites/${slug}/p/${p.id}`} className="bs-edit">
                  <span className="chip bad">{p.broken} not found</span><span>{p.title}</span><span className="bs-row-sub">{p.path}</span>
                </Link>
              ))}
            </div>
          ))}
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
              <span className="bs-edit-kind">{({ replace: 'Replace', img: 'Image', text: 'Text', link: 'Link', alt: 'Alt text', hide: 'Hidden', dup: 'Added item' } as const)[e.kind]}</span>
              <span className="bs-edit-from">{e.kind === 'img' || e.kind === 'alt' ? e.from.split('/').pop() : e.kind === 'hide' ? (e.label || e.from).slice(0, 60) : e.from.slice(0, 80)}</span>
              {e.kind !== 'hide' && <span>→</span>}
              {e.kind !== 'hide' && <span className="bs-edit-to">{e.kind === 'img' ? e.to.split('/').pop() : e.to.replace(/<[^>]+>/g, '')}</span>}
              {check?.siteBroken.includes(e.id) && <span className="chip bad">Not found</span>}
              <button className="btn sm ghost danger" disabled={!!busy} onClick={() => run('rm', { action: 'remove', id: e.id })}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad stack" style={{ gridColumn: '1 / -1' }}>
        <div>
          <div className="bs-card-title" style={{ marginTop: 0 }}>Redirects · {redirects.length}</div>
          <p className="sub" style={{ fontSize: 13.5 }}>
            Old addresses that should send visitors (and Google) somewhere else, with a permanent 301. End an address with * to cover
            everything under it, like /category/*. Redirects only apply when no live page has that address.
          </p>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" placeholder="Old address, e.g. /about-rf-collision/" value={rFrom} onChange={(e) => setRFrom(e.target.value)} />
          <input className="input" placeholder="Goes to, e.g. /about-garber-collision-center/" value={rTo} onChange={(e) => setRTo(e.target.value)} />
          <button className="btn dark" disabled={!rFrom.trim() || !rTo.trim() || !!busy}
            onClick={async () => { if (await run('redir', { action: 'redirect-add', from: rFrom, to: rTo })) { setRFrom(''); setRTo(''); } }}>Add</button>
        </div>
        <div className="row">
          <button className="btn sm" disabled={!!busy} onClick={() => run('wp', { action: 'redirect-wordpress' })}>Add common WordPress addresses</button>
          <span className="sub" style={{ fontSize: 12.5 }}>/feed/, /category/*, /author/*, /wp-admin/* and similar, all to the home page.</span>
        </div>
        {redirects.map((r) => (
          <div key={r.id} className="bs-edit">
            <span className="bs-edit-from" style={{ textDecoration: 'none' }}>{r.from_path}</span><span>→</span>
            <span className="bs-edit-to">{r.to_path}</span>
            {r.note && <span className="bs-row-sub">{r.note}</span>}
            <button className="btn sm ghost danger" disabled={!!busy} onClick={() => run('rm', { action: 'redirect-remove', id: r.id })}>Remove</button>
          </div>
        ))}
      </div>

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
