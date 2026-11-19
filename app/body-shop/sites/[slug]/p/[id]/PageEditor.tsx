'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import MediaPicker from '@/components/MediaPicker';
import type { Edit, Meta, PageStatus } from '@/lib/bodyshop';

type Props = {
  site: { slug: string; name: string; edits: Edit[]; liveEdits: Edit[] };
  page: {
    id: number; path: string; title: string; meta: Meta; liveMeta: Meta; edits: Edit[]; liveEdits: Edit[];
    publishedAt: string | null; publishedBy: string | null; status: PageStatus;
  };
  orig: { title: string; description: string; ogImage: string };
  changed: boolean;
  broken: string[];
  history: { id: number; user_name: string; created_at: string; note: string | null }[];
  pages: { path: string; title: string }[];
};

type Scan = {
  sections: { i: number; tag: string; from: string; nth: number; count: number; label: string; marks: string; hidden: boolean }[];
  images: { src: string; alt: string }[];
};
type Item = { tag: string; from: string; nth: number; count: number; leaf: string; label: string };
type Tab = 'changes' | 'sections' | 'seo' | 'page' | 'history';

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"');
const fmt = (d: string) => new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const KIND: Record<Edit['kind'], string> = { text: 'Text', img: 'Image', link: 'Link', alt: 'Alt text', replace: 'Replace', hide: 'Hidden', dup: 'Added item' };
const plain = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export default function PageEditor({ site, page, orig, changed, broken, history, pages }: Props) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const [mode, setMode] = useState<'edit' | 'draft' | 'live'>('edit');
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  const [scope, setScope] = useState<'page' | 'site'>('page');
  const [v, setV] = useState(0);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('changes');
  const [scan, setScan] = useState<Scan | null>(null);

  // What was clicked in the preview.
  const [img, setImg] = useState<{ src: string; alt: string; nth: number; count: number } | null>(null);
  const [alt, setAlt] = useState('');
  const [link, setLink] = useState<{ href: string; nth: number; count: number; newTab: boolean; text: string } | null>(null);
  const [href, setHref] = useState('');
  const [newTab, setNewTab] = useState(false);
  const [item, setItem] = useState<Item | null>(null);
  const [addText, setAddText] = useState('');
  const [picker, setPicker] = useState<null | 'swap' | 'og'>(null);
  // When the same text, image or link appears more than once on the page: change only the
  // one that was clicked, or every copy. Site-wide edits always change every copy.
  const [copies, setCopies] = useState<'one' | 'all'>('one');

  // Search tab.
  const [title, setTitle] = useState(decode(page.meta.title ?? orig.title));
  const [desc, setDesc] = useState(decode(page.meta.description ?? orig.description));
  const [ogImage, setOgImage] = useState(page.meta.ogImage ?? '');
  const [noindex, setNoindex] = useState(!!page.meta.noindex);
  const [altDraft, setAltDraft] = useState<Record<string, string>>({});

  // Page tab.
  const [dup, setDup] = useState({ path: '', title: '', description: '', headline: '' });
  const [redirectTo, setRedirectTo] = useState('/');

  const refresh = useCallback(() => { setV((n) => n + 1); router.refresh(); }, [router]);

  async function act(label: string, body: object) {
    setBusy(label); setErr('');
    try { const r = await api(`/api/body-shop/pages/${page.id}`, body); refresh(); return r || true; }
    catch (e: any) { setErr(e.message); return false; }
    finally { setBusy(''); }
  }

  /** The copy to change, when the clicked thing appears more than once and "only this one" is on. */
  const one = (d: { nth?: number; count?: number }) => (copies === 'one' && scope === 'page' && (d.count ?? 1) > 1 ? { nth: d.nth } : {});

  // Messages from the click-to-edit layer inside the preview frame.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.ws) return;
      const d = e.data;
      if (d.ws === 'scrolled') scrollY.current = d.y;
      else if (d.ws === 'scan') setScan({ sections: d.sections, images: d.images });
      else if (d.ws === 'text') act('save', { action: 'edit', kind: 'text', tag: d.tag, from: d.from, to: d.to, scope, ...one(d) });
      else if (d.ws === 'img') { setImg({ src: d.src, alt: d.alt, nth: d.nth, count: d.count }); setAlt(d.alt); setTab('changes'); }
      else if (d.ws === 'link') { setLink(d); setHref(d.href); setNewTab(!!d.newTab); setTab('changes'); }
      else if (d.ws === 'nolink') setLink(null);
      else if (d.ws === 'item') { setItem(d); setAddText(''); }
      else if (d.ws === 'noitem') setItem(null);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  });

  // Ask the preview for its sections and images until it answers (it can finish loading before
  // this page is listening). A new frame (after a save) starts over.
  useEffect(() => { setScan(null); }, [mode, v]);
  useEffect(() => {
    if (scan || mode !== 'edit') return;
    const t = setInterval(() => frame.current?.contentWindow?.postMessage({ ws: 'scan?' }, '*'), 700);
    return () => clearInterval(t);
  }, [mode, v, scan]);

  // Keep the reader's place when the frame reloads after a save.
  const onLoad = () => frame.current?.contentWindow?.postMessage({ ws: 'scroll', y: scrollY.current }, '*');
  const goto = (i: number) => frame.current?.contentWindow?.postMessage({ ws: 'goto', i }, '*');

  const pageLive = new Set(page.liveEdits.map((e) => e.id));
  const brokenSet = new Set(broken);
  const siteLive = new Set(site.liveEdits.map((e) => e.id));
  const metaDirty = title !== decode(page.meta.title ?? orig.title) || desc !== decode(page.meta.description ?? orig.description)
    || ogImage !== (page.meta.ogImage ?? '') || noindex !== !!page.meta.noindex;
  const hideEdits = [...page.edits, ...site.edits].filter((e) => e.kind === 'hide');
  const missingAlt = (scan?.images ?? []).filter((i) => !i.alt.trim());

  const removeEdit = (e: Edit) => (e.scope === 'site'
    ? api(`/api/body-shop/sites/${site.slug}`, { action: 'remove', id: e.id }).then(refresh, (x) => setErr(x.message))
    : act('rm', { action: 'remove', id: e.id, scope: 'page' }));

  const editRow = (e: Edit, live: boolean) => (
    <div key={e.id} className="bs-change">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <span className="row" style={{ gap: 6 }}>
          <span className={'chip' + (live ? ' ok' : ' warn')}>{live ? 'Live' : 'Draft'}</span>
          <span className="chip">{KIND[e.kind]}{e.kind === 'text' ? ` · ${e.tag}` : ''}{'nth' in e && e.nth != null ? ` · copy ${e.nth + 1}` : ''}</span>
          {brokenSet.has(e.id) && <span className="chip bad" title="What this edit changes isn’t on the page anymore, so it does nothing. Undo it, or redo the change.">Not found</span>}
        </span>
        <button className="btn sm ghost danger" disabled={!!busy} onClick={() => removeEdit(e)}>Undo</button>
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
      ) : e.kind === 'hide' ? (
        <div className="bs-change-to">{e.label || e.from.slice(0, 80)}</div>
      ) : e.kind === 'dup' ? (
        <>
          <div className="bs-change-by">After “{e.leaf.slice(0, 60)}”</div>
          <div className="bs-change-to">{e.to}</div>
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

  const statusChip = page.status === 'draft' ? <span className="chip warn">Not published yet</span>
    : page.status === 'hidden' ? <span className="chip bad">Hidden</span> : null;

  return (
    <div className="bs-editor">
      <header className="bs-ed-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow"><Link href={`/body-shop/sites/${site.slug}`}>{site.name}</Link></div>
          <div className="bs-ed-title">{page.title} <span className="bs-row-sub">{page.path}</span> {statusChip}</div>
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
          <div className="seg full bs-tabs">
            {([['changes', 'Changes'], ['sections', 'Sections'], ['seo', 'Search'], ['page', 'Page'], ['history', 'History']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
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

              {item && mode === 'edit' && (
                <div className="bs-change">
                  <div className="bs-card-title" style={{ marginTop: 0, fontSize: 15 }}>List item</div>
                  <div className="bs-change-by">“{item.label}{item.label.length >= 70 ? '…' : ''}”</div>
                  <div className="row">
                    <button className="btn sm" disabled={!!busy}
                      onClick={() => act('save', { action: 'edit', kind: 'hide', tag: item.tag, from: item.from, label: item.label, scope, ...one(item) }).then((ok) => ok && setItem(null))}>
                      Hide this item
                    </button>
                  </div>
                  <div className="field">
                    <label>Add an item after it</label>
                    <input className="input" value={addText} onChange={(e) => setAddText(e.target.value)} placeholder={`Copy of “${item.leaf.slice(0, 40)}” with new text`} />
                    <span className="hint">The new item copies this one’s look. Its “{item.leaf.slice(0, 40)}” text becomes what you type; click it afterwards to change anything else.</span>
                  </div>
                  <div className="row">
                    <button className="btn sm dark" disabled={!!busy || !addText.trim()}
                      onClick={() => act('save', { action: 'edit', kind: 'dup', tag: item.tag, from: item.from, leaf: item.leaf, to: addText, scope, ...one(item) }).then((ok) => ok && setItem(null))}>
                      Add item
                    </button>
                    <button className="btn sm ghost" onClick={() => setItem(null)}>Close</button>
                  </div>
                </div>
              )}

              {link && (
                <div className="bs-change">
                  <div className="bs-card-title" style={{ marginTop: 0, fontSize: 15 }}>Link</div>
                  {link.text && <div className="bs-change-by">“{link.text}”</div>}
                  <input className="input" list="bs-page-paths" value={href} onChange={(e) => setHref(e.target.value)} placeholder="/contact-us/ or https://…" />
                  <datalist id="bs-page-paths">{pages.map((p) => <option key={p.path} value={p.path}>{p.title}</option>)}</datalist>
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
                  <div className="bs-card-title" style={{ marginTop: 0, fontSize: 15 }}>Image</div>
                  <img src={img.src} alt={img.alt} className="bs-img-current" />
                  <div className="row">
                    <button className="btn sm dark" onClick={() => setPicker('swap')}>Swap: choose or upload…</button>
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

              {page.edits.length === 0 && site.edits.length === 0 && !img && !link && !item && (
                <p className="sub" style={{ fontSize: 13.5 }}>No edits yet. This page matches the approved design.</p>
              )}
              {page.edits.length > 0 && <div className="section-title" style={{ margin: '6px 0 0' }}>This page</div>}
              {[...page.edits].reverse().map((e) => editRow(e, pageLive.has(e.id)))}
              {site.edits.length > 0 && <div className="section-title" style={{ margin: '6px 0 0' }}>Every page on the site</div>}
              {[...site.edits].reverse().map((e) => editRow(e, siteLive.has(e.id)))}
              {changed && (
                <button className="btn sm ghost danger" disabled={!!busy} onClick={() => confirm('Throw away this page’s unpublished edits?') && act('discard', { action: 'discard' })}>
                  Discard unpublished edits on this page
                </button>
              )}
            </div>
          )}

          {tab === 'sections' && (
            <div className="stack">
              <p className="sub" style={{ fontSize: 13.5 }}>Hide a section to take it off this page without deleting it. Hidden sections show faded in Edit view.</p>
              {mode !== 'edit' && <p className="bs-warn">Switch to Edit view to list this page’s sections.</p>}
              {mode === 'edit' && !scan && <p className="sub">Reading the page…</p>}
              {mode === 'edit' && scan?.sections.map((sec) => {
                const hide = hideEdits.find((e) => sec.marks.split(' ').includes(e.id));
                return (
                  <div key={sec.i} className="bs-section-row">
                    <button className="bs-section-name" onClick={() => goto(sec.i)} title="Show it in the preview">
                      <span className={sec.hidden ? 'off' : ''}>{sec.label || `(${sec.tag})`}</span>
                      <span className="bs-row-sub">{sec.tag}</span>
                    </button>
                    {hide
                      ? <button className="btn sm" disabled={!!busy} onClick={() => removeEdit(hide)}>Show</button>
                      : <button className="btn sm ghost" disabled={!!busy}
                          onClick={() => act('save', { action: 'edit', kind: 'hide', tag: sec.tag, from: sec.from, label: sec.label, scope: 'page', ...(sec.count > 1 ? { nth: sec.nth } : {}) })}>
                          Hide
                        </button>}
                  </div>
                );
              })}
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
              <div className="field">
                <label>Share image (Facebook, texts, Slack)</label>
                <img src={ogImage || orig.ogImage} alt="" className="bs-img-current" />
                <div className="row">
                  <button className="btn sm" onClick={() => setPicker('og')}>Choose or upload…</button>
                  {ogImage && <button className="btn sm ghost" onClick={() => setOgImage('')}>Use the original</button>}
                </div>
                <span className="hint">1200 × 630 works best.</span>
              </div>
              <label className="row" style={{ gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} />
                Hide this page from Google (noindex, and left out of the sitemap)
              </label>
              <button className="btn dark" disabled={!metaDirty || !!busy}
                onClick={() => act('meta', { action: 'meta', title, description: desc, ogImage, noindex })}>Save to draft</button>

              <div className="section-title" style={{ margin: '10px 0 0' }}>Images without alt text {scan ? `· ${missingAlt.length}` : ''}</div>
              {mode !== 'edit' && <p className="sub" style={{ fontSize: 13 }}>Switch to Edit view to check images.</p>}
              {mode === 'edit' && scan && missingAlt.length === 0 && <p className="sub" style={{ fontSize: 13.5, color: 'var(--ok)' }}>Every image on this page has alt text.</p>}
              {mode === 'edit' && missingAlt.map((im) => (
                <div key={im.src} className="bs-change">
                  <img src={im.src} alt="" className="bs-img-current" style={{ maxHeight: 90 }} />
                  <input className="input" placeholder="Describe the image" value={altDraft[im.src] ?? ''}
                    onChange={(e) => setAltDraft({ ...altDraft, [im.src]: e.target.value })} />
                  <button className="btn sm" disabled={!!busy || !(altDraft[im.src] ?? '').trim()}
                    onClick={() => act('save', { action: 'edit', kind: 'alt', from: im.src, to: altDraft[im.src], scope: 'page' })}>Save alt text</button>
                </div>
              ))}
            </div>
          )}

          {tab === 'page' && (
            <div className="stack">
              <div className="bs-change">
                <div className="bs-card-title" style={{ marginTop: 0, fontSize: 15 }}>Duplicate this page</div>
                <p className="sub" style={{ fontSize: 13 }}>Makes a new page with this one’s design and edits, at its own address. It stays unpublished until you publish it.</p>
                <div className="field"><label>Address</label>
                  <input className="input" value={dup.path} onChange={(e) => setDup({ ...dup, path: e.target.value })} placeholder="/state-farm-collision-repair/" /></div>
                <div className="field"><label>Page title</label>
                  <input className="input" value={dup.title} onChange={(e) => setDup({ ...dup, title: e.target.value })} placeholder={`State Farm Collision Repair | ${site.name}`} /></div>
                <div className="field"><label>Headline (optional)</label>
                  <input className="input" value={dup.headline} onChange={(e) => setDup({ ...dup, headline: e.target.value })} placeholder="Replaces this page’s main heading" /></div>
                <div className="field"><label>Meta description (optional)</label>
                  <textarea className="textarea" rows={2} value={dup.description} onChange={(e) => setDup({ ...dup, description: e.target.value })} /></div>
                <button className="btn sm dark" disabled={!!busy || !dup.path.trim() || !dup.title.trim()}
                  onClick={async () => {
                    const r = await act('dup', { action: 'duplicate', ...dup });
                    if (r && (r as any).id) router.push(`/body-shop/sites/${site.slug}/p/${(r as any).id}`);
                  }}>{busy === 'dup' ? 'Creating…' : 'Create page'}</button>
              </div>

              {page.path !== '/' && (
                <div className="bs-change">
                  <div className="bs-card-title" style={{ marginTop: 0, fontSize: 15 }}>{page.status === 'hidden' ? 'This page is hidden' : 'Take this page down'}</div>
                  {page.status === 'hidden' ? (
                    <>
                      <p className="sub" style={{ fontSize: 13 }}>Visitors are redirected or see “page not found.” Putting it back removes its redirect.</p>
                      <button className="btn sm dark" disabled={!!busy} onClick={() => act('status', { action: 'status', status: 'live' })}>Put the page back</button>
                    </>
                  ) : (
                    <>
                      <div className="field"><label>Send visitors to</label>
                        <input className="input" list="bs-page-paths2" value={redirectTo} onChange={(e) => setRedirectTo(e.target.value)} />
                        <datalist id="bs-page-paths2">{pages.filter((p) => p.path !== page.path).map((p) => <option key={p.path} value={p.path}>{p.title}</option>)}</datalist>
                        <span className="hint">A permanent (301) redirect, so search rankings carry over. Leave empty for “page not found.”</span>
                      </div>
                      <div className="row">
                        <button className="btn sm" disabled={!!busy} onClick={() => act('status', { action: 'status', status: 'hidden', redirectTo: redirectTo.trim() || null })}>Hide page</button>
                        <button className="btn sm ghost danger" disabled={!!busy}
                          onClick={async () => {
                            if (!confirm(`Delete “${page.title}”? Its edits and history go with it.`)) return;
                            if (await act('del', { action: 'delete', redirectTo: redirectTo.trim() || null })) router.push(`/body-shop/sites/${site.slug}`);
                          }}>Delete page</button>
                      </div>
                      <span className="hint">Hide keeps the page so you can put it back. Delete removes it for good.</span>
                    </>
                  )}
                </div>
              )}
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
                    <div className="bs-change-by">{h.user_name}{h.note ? ` · ${h.note}` : ''}{i === 0 ? ' · current' : ''}</div>
                  </div>
                  {i > 0 && <button className="btn sm" disabled={!!busy} onClick={() => act('restore', { action: 'restore', publishId: h.id })}>Restore</button>}
                </div>
              ))}
              {history.length > 1 && <p className="sub" style={{ fontSize: 12.5 }}>Restoring puts that version back as a draft. Publish to make it live.</p>}
            </div>
          )}
        </aside>
      </div>

      {picker && (
        <MediaPicker
          dealershipId={null} dealerSlug={null} dealerName={site.name}
          onClose={() => setPicker(null)}
          onPick={async (url) => {
            const which = picker;
            setPicker(null);
            if (which === 'og') { setOgImage(url); return; }
            if (img && await act('save', { action: 'edit', kind: 'img', from: img.src, to: url, scope, ...one(img) })) setImg(null);
          }}
        />
      )}
    </div>
  );
}
