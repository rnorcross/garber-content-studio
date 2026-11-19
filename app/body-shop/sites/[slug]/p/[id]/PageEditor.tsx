'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import MediaPicker from '@/components/MediaPicker';
import type { Edit, Meta } from '@/lib/bodyshop';

type Props = {
  site: { slug: string; name: string; edits: Edit[]; liveEdits: Edit[] };
  page: { id: number; path: string; title: string; meta: Meta; edits: Edit[]; liveEdits: Edit[]; publishedAt: string | null; publishedBy: string | null };
  orig: { title: string; description: string };
  changed: boolean;
  broken: string[];
  history: { id: number; user_name: string; created_at: string; note: string | null }[];
};

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"');
const fmt = (d: string) => new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const KIND: Record<Edit['kind'], string> = { text: 'Text', img: 'Image', link: 'Link', alt: 'Alt text', replace: 'Replace' };
const plain = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export default function PageEditor({ site, page, orig, changed, broken, history }: Props) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const [mode, setMode] = useState<'edit' | 'draft' | 'live'>('edit');
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  const [scope, setScope] = useState<'page' | 'site'>('page');
  const [v, setV] = useState(0);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [img, setImg] = useState<{ src: string; alt: string; nth: number; count: number } | null>(null);
  const [alt, setAlt] = useState('');
  const [link, setLink] = useState<{ href: string; nth: number; count: number; newTab: boolean; text: string } | null>(null);
  const [href, setHref] = useState('');
  const [newTab, setNewTab] = useState(false);
  // When the same text, image or link appears more than once on the page: change only the
  // one that was clicked, or every copy. Site-wide edits always change every copy.
  const [copies, setCopies] = useState<'one' | 'all'>('one');
  const [picker, setPicker] = useState(false);
  const [title, setTitle] = useState(decode(page.meta.title ?? orig.title));
  const [desc, setDesc] = useState(decode(page.meta.description ?? orig.description));
  const [tab, setTab] = useState<'changes' | 'seo' | 'history'>('changes');

  const refresh = useCallback(() => { setV((n) => n + 1); router.refresh(); }, [router]);

  async function act(label: string, body: object) {
    setBusy(label); setErr('');
    try { await api(`/api/body-shop/pages/${page.id}`, body); refresh(); return true; }
    catch (e: any) { setErr(e.message); return false; }
    finally { setBusy(''); }
  }

  // Messages from the click-to-edit layer inside the preview frame.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.ws) return;
      const d = e.data;
      if (d.ws === 'scrolled') scrollY.current = d.y;
      else if (d.ws === 'text') act('save', { action: 'edit', kind: 'text', tag: d.tag, from: d.from, to: d.to, scope, ...one(d) });
      else if (d.ws === 'img') { setImg({ src: d.src, alt: d.alt, nth: d.nth, count: d.count }); setAlt(d.alt); setTab('changes'); }
      else if (d.ws === 'link') { setLink(d); setHref(d.href); setNewTab(!!d.newTab); setTab('changes'); }
      else if (d.ws === 'nolink') setLink(null);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  });

  /** The copy to change, when the clicked thing appears more than once and "only this one" is on. */
  const one = (d: { nth?: number; count?: number }) => (copies === 'one' && scope === 'page' && (d.count ?? 1) > 1 ? { nth: d.nth } : {});

  // Keep the reader's place when the frame reloads after a save.
  const onLoad = () => frame.current?.contentWindow?.postMessage({ ws: 'scroll', y: scrollY.current }, '*');

  const pageLive = new Set(page.liveEdits.map((e) => e.id));
  const brokenSet = new Set(broken);
  const siteLive = new Set(site.liveEdits.map((e) => e.id));
  const metaDirty = title !== decode(page.meta.title ?? orig.title) || desc !== decode(page.meta.description ?? orig.description);

  const editRow = (e: Edit, live: boolean, s: 'page' | 'site') => (
    <div key={e.id} className="bs-change">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <span className="row" style={{ gap: 6 }}>
          <span className={'chip' + (live ? ' ok' : ' warn')}>{live ? 'Live' : 'Draft'}</span>
          <span className="chip">{KIND[e.kind]}{e.kind === 'text' ? ` · ${e.tag}` : ''}{'nth' in e && e.nth != null ? ` · copy ${e.nth + 1}` : ''}</span>
          {brokenSet.has(e.id) && <span className="chip bad" title="The text, image or link this edit changes isn’t on the page anymore, so it does nothing. Undo it, or redo the change.">Not found</span>}
        </span>
        <button className="btn sm ghost danger" disabled={!!busy}
          onClick={() => s === 'site'
            ? api(`/api/body-shop/sites/${site.slug}`, { action: 'remove', id: e.id }).then(refresh, (x) => setErr(x.message))
            : act('rm', { action: 'remove', id: e.id, scope: 'page' })}>Undo</button>
      </div>
      {e.kind === 'img' ? (
        <div className="bs-change-imgs"><img src={e.from} alt="" /><span>→</span><img src={e.to} alt="" /></div>
      ) : e.kind === 'alt' ? (
        <>
          <div className="bs-change-imgs"><img src={e.from} alt="" style={{ width: 70 }} /></div>
          <div className="bs-change-to">Alt text: {e.to || <em>(empty, decorative)</em>}</div>
        </>
      ) : e.kind === 'link' ? (
        <>
          <div className="bs-change-from">{e.from}</div>
          <div className="bs-change-to">{e.to}{e.newTab ? ' · opens in a new tab' : ''}</div>
        </>
      ) : (
        <>
          <div className="bs-change-from">{e.from}</div>
          <div className="bs-change-to">{plain(e.to)}</div>
        </>
      )}
      {e.by && <div className="bs-change-by">{e.by} · {e.at ? fmt(e.at) : ''}</div>}
    </div>
  );

  return (
    <div className="bs-editor">
      <header className="bs-ed-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow"><Link href={`/body-shop/sites/${site.slug}`}>{site.name}</Link></div>
          <div className="bs-ed-title">{page.title} <span className="bs-row-sub">{page.path}</span></div>
        </div>
        <div className="row">
          <div className="seg">
            {(['edit', 'draft', 'live'] as const).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setV((n) => n + 1); }}>
                {m === 'edit' ? 'Edit' : m === 'draft' ? 'Preview' : 'Live'}
              </button>
            ))}
          </div>
          <div className="seg">
            <button className={width === 'desktop' ? 'on' : ''} onClick={() => setWidth('desktop')}>Desktop</button>
            <button className={width === 'phone' ? 'on' : ''} onClick={() => setWidth('phone')}>Phone</button>
          </div>
          <a className="btn sm" href={`/s/${site.slug}${page.path}`} target="_blank" rel="noreferrer">Open ↗</a>
          <button className="btn primary" disabled={!changed || !!busy} onClick={() => act('publish', { action: 'publish' })}>
            {busy === 'publish' ? 'Publishing…' : changed ? 'Publish' : 'Published'}
          </button>
        </div>
      </header>

      <div className="bs-ed-body">
        <div className="bs-ed-stage">
          {mode === 'edit' && <div className="bs-ed-tip">Click text to change it, an image to swap it or edit its alt text, or a link or button to change where it goes. Enter saves, Esc cancels.</div>}
          <iframe
            ref={frame}
            key={`${mode}-${v}`}
            title="Page preview"
            onLoad={onLoad}
            src={`/api/body-shop/pages/${page.id}/frame?mode=${mode}&v=${v}`}
            className={'bs-ed-frame' + (width === 'phone' ? ' phone' : '')}
          />
          {busy === 'save' && <div className="bs-ed-saving">Saving…</div>}
        </div>

        <aside className="bs-ed-panel">
          <div className="seg full">
            <button className={tab === 'changes' ? 'on' : ''} onClick={() => setTab('changes')}>Changes</button>
            <button className={tab === 'seo' ? 'on' : ''} onClick={() => setTab('seo')}>Search</button>
            <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History</button>
          </div>
          {err && <p className="bs-err">{err}</p>}

          {tab === 'changes' && (
            <div className="stack">
              <div className="field">
                <label>New edits apply to</label>
                <div className="seg full">
                  <button className={scope === 'page' ? 'on' : ''} onClick={() => setScope('page')}>This page</button>
                  <button className={scope === 'site' ? 'on' : ''} onClick={() => setScope('site')}>Every page</button>
                </div>
                <span className="hint">“Every page” is for things that repeat, like the header, footer or a button label.</span>
              </div>
              {scope === 'page' && (
                <div className="field">
                  <label>When it appears more than once on this page</label>
                  <div className="seg full">
                    <button className={copies === 'one' ? 'on' : ''} onClick={() => setCopies('one')}>Only the one I click</button>
                    <button className={copies === 'all' ? 'on' : ''} onClick={() => setCopies('all')}>Every copy</button>
                  </div>
                </div>
              )}

              {broken.length > 0 && (
                <p className="bs-warn">{broken.length} {broken.length === 1 ? 'edit no longer matches' : 'edits no longer match'} anything on this page, so {broken.length === 1 ? 'it does' : 'they do'} nothing. They’re marked “Not found” below.</p>
              )}

              {link && (
                <div className="bs-change">
                  <div className="bs-card-title" style={{ marginTop: 0, fontSize: 15 }}>Link</div>
                  {link.text && <div className="bs-change-by">“{link.text}”</div>}
                  <input className="input" value={href} onChange={(e) => setHref(e.target.value)} placeholder="/contact-us/ or https://…" />
                  <label className="row" style={{ gap: 8, fontSize: 13.5 }}>
                    <input type="checkbox" checked={newTab} onChange={(e) => setNewTab(e.target.checked)} /> Open in a new tab
                  </label>
                  {link.count > 1 && scope === 'page' && (
                    <span className="hint">{link.count} links on this page go to {link.href || 'this address'}. {copies === 'one' ? 'Only the one you clicked changes.' : 'All of them change.'}</span>
                  )}
                  <div className="row">
                    <button className="btn sm dark" disabled={!!busy || (href === link.href && newTab === link.newTab)}
                      onClick={async () => { if (await act('save', { action: 'edit', kind: 'link', from: link.href, to: href, newTab, scope, ...one(link) })) setLink(null); }}>
                      Save link
                    </button>
                    <button className="btn sm ghost" onClick={() => setLink(null)}>Close</button>
                  </div>
                </div>
              )}

              {img && (
                <div className="bs-change">
                  <div className="bs-card-title" style={{ marginTop: 0, fontSize: 15 }}>Swap image</div>
                  <img src={img.src} alt={img.alt} className="bs-img-current" />
                  <div className="row">
                    <button className="btn sm dark" onClick={() => setPicker(true)}>Choose or upload…</button>
                    <button className="btn sm ghost" onClick={() => setImg(null)}>Close</button>
                  </div>
                  <div className="field" style={{ marginTop: 6 }}>
                    <label>Alt text <span style={{ float: 'right' }}>{alt.length}/125</span></label>
                    <textarea className="textarea" rows={2} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="What the image shows, for screen readers and Google" />
                    <span className="hint">Leave empty only for decorative images.{img.count > 1 ? ` This image appears ${img.count} times on the page; the alt text changes on all of them.` : ''}</span>
                  </div>
                  <button className="btn sm" disabled={!!busy || alt === img.alt}
                    onClick={async () => { if (await act('save', { action: 'edit', kind: 'alt', from: img.src, to: alt, scope })) setImg({ ...img, alt }); }}>
                    Save alt text
                  </button>
                </div>
              )}

              {page.edits.length === 0 && site.edits.length === 0 && !img && (
                <p className="sub" style={{ fontSize: 13.5 }}>No edits yet. This page matches the approved design.</p>
              )}
              {page.edits.length > 0 && <div className="section-title" style={{ margin: '6px 0 0' }}>This page</div>}
              {[...page.edits].reverse().map((e) => editRow(e, pageLive.has(e.id), 'page'))}
              {site.edits.length > 0 && <div className="section-title" style={{ margin: '6px 0 0' }}>Every page on the site</div>}
              {[...site.edits].reverse().map((e) => editRow(e, siteLive.has(e.id), 'site'))}
              {changed && (
                <button className="btn sm ghost danger" disabled={!!busy} onClick={() => confirm('Throw away this page’s unpublished edits?') && act('discard', { action: 'discard' })}>
                  Discard unpublished edits on this page
                </button>
              )}
            </div>
          )}

          {tab === 'seo' && (
            <div className="stack">
              <div className="field">
                <label>Page title <span style={{ float: 'right' }}>{title.length}/60</span></label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="field">
                <label>Meta description <span style={{ float: 'right' }}>{desc.length}/160</span></label>
                <textarea className="textarea" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              <p className="sub" style={{ fontSize: 12.5 }}>Also used for Facebook and other share previews.</p>
              <button className="btn dark" disabled={!metaDirty || !!busy} onClick={() => act('meta', { action: 'meta', title, description: desc })}>Save to draft</button>
            </div>
          )}

          {tab === 'history' && (
            <div className="stack">
              {page.publishedAt && <p className="sub" style={{ fontSize: 13.5 }}>Live since {fmt(page.publishedAt)}{page.publishedBy ? ` · ${page.publishedBy}` : ''}.</p>}
              {history.length === 0 && <p className="sub" style={{ fontSize: 13.5 }}>No publishes from the studio yet. The live page is the approved design.</p>}
              {history.map((h, i) => (
                <div key={h.id} className="bs-change row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{fmt(h.created_at)}</div>
                    <div className="bs-change-by">{h.user_name}{i === 0 ? ' · current' : ''}</div>
                  </div>
                  {i > 0 && <button className="btn sm" disabled={!!busy} onClick={() => act('restore', { action: 'restore', publishId: h.id })}>Restore</button>}
                </div>
              ))}
              {history.length > 1 && <p className="sub" style={{ fontSize: 12.5 }}>Restoring puts that version back as a draft. Publish to make it live.</p>}
            </div>
          )}
        </aside>
      </div>

      {picker && img && (
        <MediaPicker
          dealershipId={null} dealerSlug={null} dealerName={site.name}
          onClose={() => setPicker(false)}
          onPick={async (url) => {
            setPicker(false);
            if (await act('save', { action: 'edit', kind: 'img', from: img.src, to: url, scope, ...one(img) })) setImg(null);
          }}
        />
      )}
    </div>
  );
}
