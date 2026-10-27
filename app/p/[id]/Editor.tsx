'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Preview, { type Device, type PreviewHandle } from '@/components/Preview';
import SeoFields, { type Seo } from '@/components/SeoFields';
import MediaPicker from '@/components/MediaPicker';
import { api, copyText, download, streamHtml } from '@/lib/client';
import { uploadMedia, absolute } from '@/lib/upload';
import {
  assemble, dataUriToFile, defaultOgImage, formatBytes, GROUP_OG_IMAGE, listImages, replaceAll, restoreInline, slugify, stashInline,
} from '@/lib/fragment';
import type { Page, LiveEvent } from '@/lib/db';
import { standardUrl, standardPath, matchesStandard } from '@/lib/urls.mjs';

type PageData = Page & { dealership: string | null; dslug: string | null; live_by: string | null };
type Dealer = { id: number; name: string; slug: string; og_image: string | null; website: string | null };
type VersionMeta = { number: number; source: string; note: string | null; prompt: string | null; created_at: string; size: number; author: string | null };
type Tpl = { slug: string; name: string; url_pattern: string | null };
type Tab = 'ask' | 'code' | 'images' | 'versions' | 'details';

const SOURCE_LABEL: Record<string, string> = {
  generated: 'Generated', imported: 'Imported', edited: 'Edited', 'ai-edit': 'Claude edit', restored: 'Restored',
};
const SUGGESTIONS = [
  'Tighten the copy so every section is scannable',
  'Check the phone layout and fix anything cramped',
  'Add a short FAQ section near the bottom',
  'Make the main call to action stronger',
];
const when = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const stamp = (s: string) => new Date(s).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

type Props = {
  page: PageData; initialHtml: string; dealers: Dealer[]; templates: Tpl[];
  initialLog: LiveEvent[];
};

export default function Editor({ page: initial, initialHtml, dealers, templates, initialLog }: Props) {
  const [page, setPage] = useState(initial);
  const [savedHtml, setSavedHtml] = useState(initialHtml);
  const [html, setHtml] = useState(initialHtml);
  const [pendingSource, setPendingSource] = useState<'edited' | 'ai-edit' | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const dirty = html !== savedHtml;

  const [device, setDevice] = useState<Device>('desktop');
  const [editing, setEditing] = useState(false);
  const [textDirty, setTextDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('ask');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [liveLog, setLiveLog] = useState(initialLog);
  const [liveForm, setLiveForm] = useState<{ version: number; url: string; note: string } | null>(null);
  const preview = useRef<PreviewHandle>(null);

  const dealer = dealers.find((d) => d.id === page.dealership_id) ?? null;
  const ogImage = dealer ? dealer.og_image || defaultOgImage(dealer.slug) : GROUP_OG_IMAGE;
  const head = {
    siteName: dealer?.name ?? 'Garber Automotive Group', title: page.meta_title, description: page.meta_description,
    image: ogImage, url: page.live_url, canonical: page.canonical_url,
  };

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty || textDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, textDirty]);

  const change = useCallback((next: string, source: 'edited' | 'ai-edit', prompt: string | null = null) => {
    setHtml(next); setPendingSource(source); setPendingPrompt(prompt);
  }, []);

  function finishTextEdit() {
    const out = preview.current?.read();
    if (out != null && textDirty) change(out, 'edited');
    setEditing(false); setTextDirty(false);
  }

  async function saveVersion() {
    let body = html;
    if (editing) { const out = preview.current?.read(); if (out != null && textDirty) body = out; setEditing(false); setTextDirty(false); }
    if (body === savedHtml) return;
    await run('save', async () => {
      const { number } = await api<{ number: number }>(`/api/pages/${page.id}/versions`, {
        html: body, source: pendingSource ?? 'edited', note: note || null, prompt: pendingPrompt,
      });
      setSavedHtml(body); setHtml(body); setNote(''); setPendingSource(null); setPendingPrompt(null);
      setPage((p) => ({ ...p, current_version: number, updated_at: new Date().toISOString() }));
      setVersions(null);
      flash(`Saved as v${number}`);
    });
  }

  function discard() {
    setHtml(savedHtml); setPendingSource(null); setPendingPrompt(null); setEditing(false); setTextDirty(false);
  }

  const output = () => assemble(savedHtml, head);
  async function copy() {
    const ok = await copyText(output());
    flash(ok ? `Copied v${page.current_version} with its social tags — paste it into the Dealer.com content area` : 'Copy failed — use Download instead');
  }

  function openLive(version = page.current_version ?? 1) {
    const std = standardUrl(templates.find((t) => t.slug === page.page_type)?.url_pattern ?? null, dealer);
    setLiveForm({ version, url: page.live_url || std || '', note: '' });
  }
  async function recordLive() {
    if (!liveForm) return;
    await run('live', async () => {
      const ev = await api<LiveEvent>(`/api/pages/${page.id}/live`, { version: liveForm.version, liveUrl: liveForm.url || null, note: liveForm.note || null });
      setLiveLog((l) => [ev, ...l]);
      setPage((p) => ({ ...p, live_version: ev.version, live_marked_at: ev.created_at, live_by: ev.user_name, status: 'live', live_url: liveForm.url || p.live_url }));
      setLiveForm(null);
      flash(`v${ev.version} recorded as live — ${ev.user_name}, ${stamp(ev.created_at)}`);
    });
  }

  // --- version history ---
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [viewing, setViewing] = useState<{ number: number; html: string } | null>(null);
  useEffect(() => {
    if (tab === 'versions' && !versions) api<VersionMeta[]>(`/api/pages/${page.id}/versions`).then(setVersions).catch((e) => setError(e.message));
  }, [tab, versions, page.id]);

  async function view(n: number) {
    if (n === page.current_version) { setViewing(null); return; }
    await run('view', async () => setViewing(await api(`/api/pages/${page.id}/versions/${n}`)));
  }
  async function restore() {
    if (!viewing) return;
    const from = viewing;
    await run('restore', async () => {
      const { number } = await api<{ number: number }>(`/api/pages/${page.id}/versions`, {
        html: from.html, source: 'restored', note: `Restored from v${from.number}`,
      });
      setSavedHtml(from.html); setHtml(from.html); setViewing(null); setVersions(null);
      setPage((p) => ({ ...p, current_version: number }));
      flash(`v${from.number} restored as v${number}`);
    });
  }

  const stale = page.live_version != null && page.live_version !== page.current_version;
  const shown = viewing ? viewing.html : html;

  return (
    <main className="wrap">
      <div className="head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            <Link href="/">Library</Link>{page.dslug && <> / <Link href={`/d/${page.dslug}`}>{page.dealership}</Link></>}
          </div>
          <h1 className="title">{page.title}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="chip blue">v{page.current_version}</span>
            {page.status === 'archived' ? <span className="chip">Archived</span>
              : page.live_version == null ? <span className="chip">Not live yet</span>
              : stale ? <span className="chip warn">Live site has v{page.live_version} — re-paste needed</span>
              : <span className="chip ok">Live site is current</span>}
            {page.live_marked_at && (
              <span className="small muted">Set live {stamp(page.live_marked_at)}{page.live_by ? ` by ${page.live_by}` : ''}</span>
            )}
            {page.live_url && <a className="small" href={page.live_url} target="_blank" rel="noopener">View live page ↗</a>}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => download(`${slugify(page.title)}-v${page.current_version}.html`, output())}>Download</button>
          <button className="btn primary" onClick={copy}>Copy HTML</button>
          <button className="btn dark" onClick={() => openLive()} disabled={busy === 'live'}>Set live</button>
        </div>
      </div>

      {liveForm && (
        <div className="card card-pad stack" style={{ marginBottom: 14 }}>
          <strong>Record this page as live on the dealer site</strong>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ width: 150 }}>
              <label htmlFor="lv">Version</label>
              <select id="lv" className="select" value={liveForm.version} onChange={(e) => setLiveForm({ ...liveForm, version: Number(e.target.value) })}>
                {Array.from({ length: page.current_version ?? 1 }, (_, i) => (page.current_version ?? 1) - i).map((n) => (
                  <option key={n} value={n}>v{n}{n === page.current_version ? ' (current)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: '1 1 280px' }}>
              <label htmlFor="lu2">Live page URL</label>
              <input id="lu2" className="input" value={liveForm.url} onChange={(e) => setLiveForm({ ...liveForm, url: e.target.value })} placeholder={dealer?.website ? `${dealer.website}/…` : 'https://…'} />
            </div>
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="ln">Note (optional)</label>
              <input id="ln" className="input" value={liveForm.note} onChange={(e) => setLiveForm({ ...liveForm, note: e.target.value })} placeholder="e.g. Pasted into the About page content area" />
            </div>
          </div>
          <p className="small muted">This logs your name and the date and time. Paste the HTML on the dealer site first.</p>
          <div className="row">
            <button className="btn" onClick={() => setLiveForm(null)}>Cancel</button>
            <button className="btn dark" onClick={recordLive} disabled={busy === 'live'}>{busy === 'live' ? 'Recording…' : `Record v${liveForm.version} as live`}</button>
          </div>
        </div>
      )}

      {(dirty || textDirty) && !viewing && (
        <div className="notice blue row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
          <span>Unsaved changes{pendingSource === 'ai-edit' ? ' from Claude' : ''}. Save them as a new version to copy them.</span>
          <span className="row">
            <input className="input" style={{ width: 240, height: 32, padding: '4px 12px' }} placeholder="What changed? (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Version note" />
            <button className="btn sm" onClick={discard}>Discard</button>
            <button className="btn sm primary" onClick={saveVersion} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : `Save as v${(page.current_version ?? 0) + 1}`}</button>
          </span>
        </div>
      )}
      {viewing && (
        <div className="notice warn row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
          <span>Previewing v{viewing.number}. The current version is v{page.current_version}.</span>
          <span className="row">
            <button className="btn sm" onClick={() => setViewing(null)}>Back to current</button>
            <button className="btn sm dark" onClick={restore} disabled={busy === 'restore'}>Restore v{viewing.number}</button>
          </span>
        </div>
      )}
      {toast && <div className="notice ok" role="status" style={{ marginBottom: 14 }}>{toast}</div>}
      {error && <div className="notice warn" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="editor">
        <section className="card stage" aria-label="Preview">
          <div className="stage-bar">
            <div className="seg" role="group" aria-label="Preview width">
              {(['desktop', 'tablet', 'phone'] as Device[]).map((d) => (
                <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>{d[0].toUpperCase() + d.slice(1)}</button>
              ))}
            </div>
            {!viewing && (editing
              ? <button className="btn sm primary" onClick={finishTextEdit}>Done editing text</button>
              : <button className="btn sm" onClick={() => setEditing(true)}>Edit text on the page</button>)}
          </div>
          {editing && <div className="notice blue" style={{ borderRadius: 0 }}>Click any text in the preview and type. Links won’t open while you edit.</div>}
          <Preview ref={preview} html={shown} device={device} editing={editing && !viewing} onDirty={() => setTextDirty(true)} />
        </section>

        <aside className="card panel" aria-label="Tools">
          <div className="tabs" role="tablist">
            {([['ask', 'Ask Claude'], ['code', 'Code'], ['images', 'Images'], ['versions', 'History'], ['details', 'Details']] as [Tab, string][]).map(([t, l]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>
            ))}
          </div>
          <div className="panel-body">
            {tab === 'ask' && <AskPanel html={html} disabled={!!viewing || editing} onResult={(h, p) => change(h, 'ai-edit', p)} />}
            {tab === 'code' && <CodePanel html={html} disabled={!!viewing || editing} onApply={(h) => change(h, 'edited')} />}
            {tab === 'images' && <ImagesPanel html={html} dealer={dealer} disabled={!!viewing || editing} onChange={(h) => change(h, 'edited')} flash={flash} />}
            {tab === 'versions' && (
              <div className="stack">
                <div className="stack" style={{ gap: 8 }}>
                  <strong className="small">Live log</strong>
                  {!liveLog.length && <p className="small muted">Nobody has set this page live yet.</p>}
                  <div className="livelog">
                    {liveLog.map((e) => (
                      <div key={e.id} className="ev">
                        <span className="chip ok">v{e.version}</span>
                        <span>
                          <strong>{e.user_name ?? 'Someone'}</strong> set it live · {stamp(e.created_at)}
                          {e.note && <span className="muted"> — {e.note}</span>}
                          {e.live_url && <><br /><a className="small" href={e.live_url} target="_blank" rel="noopener">{e.live_url.replace(/^https?:\/\/(www\.)?/, '')}</a></>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <strong className="small">Versions</strong>
                <div className="vlist">
                  {!versions && <p className="muted small">Loading…</p>}
                  {versions?.map((v) => (
                    <div key={v.number} className={`vitem${(viewing?.number ?? page.current_version) === v.number ? ' cur' : ''}`}>
                      <button style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }} onClick={() => view(v.number)}>
                        <span className="row" style={{ justifyContent: 'space-between' }}>
                          <strong>v{v.number}</strong>
                          <span className="row" style={{ gap: 6 }}>
                            {v.number === page.live_version && <span className="chip ok">Live</span>}
                            {v.number === page.current_version && <span className="chip blue">Current</span>}
                            <span className="chip">{SOURCE_LABEL[v.source] ?? v.source}</span>
                          </span>
                        </span>
                        {(v.note || v.prompt) && <span className="small">{v.note || v.prompt?.slice(0, 140)}</span>}
                        <span className="small muted">{when(v.created_at)}{v.author ? ` · ${v.author}` : ''} · {formatBytes(v.size)}</span>
                      </button>
                      {v.number !== page.live_version && (
                        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => openLive(v.number)}>Set v{v.number} live</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === 'details' && (
              <DetailsPanel page={page} dealers={dealers} templates={templates} html={html} ogImage={ogImage} onPage={setPage}
                onScoped={(h) => change(h, 'edited')} flash={flash} setError={setError} />
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function AskPanel({ html, disabled, onResult }: { html: string; disabled: boolean; onResult: (html: string, prompt: string) => void }) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  async function ask() {
    if (!instruction.trim()) return;
    setBusy(true); setError(''); setProgress(0);
    abort.current = new AbortController();
    const { html: compact, store } = stashInline(html);
    try {
      const out = await streamHtml({ mode: 'edit', html: compact, instruction }, (t) => setProgress(Math.min(99, Math.round((t.length / compact.length) * 100))), abort.current.signal);
      onResult(restoreInline(out, store), instruction);
      setInstruction('');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="ask">Tell Claude what to change</label>
        <textarea id="ask" className="textarea" rows={5} value={instruction} disabled={disabled || busy}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(); }}
          placeholder="e.g. Replace the hours card with Mon–Fri 8–7, Sat 9–5. Swap the second review for the one below…" />
        <span className="hint">Claude rewrites only what you ask and keeps the rest. Review the preview, then save it as a version.</span>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {SUGGESTIONS.map((s) => <button key={s} className="btn sm ghost" style={{ border: '1px solid var(--line)' }} disabled={disabled || busy} onClick={() => setInstruction(s)}>{s}</button>)}
      </div>
      {busy && <div className="stack" style={{ gap: 6 }}><div className="progress"><i /></div><span className="small muted">Rewriting… about {progress}%</span></div>}
      {error && <p className="err">{error}</p>}
      <div className="row">
        {busy ? <button className="btn" onClick={() => abort.current?.abort()}>Stop</button>
          : <button className="btn primary" onClick={ask} disabled={disabled || !instruction.trim()}>Make the change</button>}
      </div>
      {disabled && <p className="small muted">Finish text editing or go back to the current version first.</p>}
    </div>
  );
}

function CodePanel({ html, disabled, onApply }: { html: string; disabled: boolean; onApply: (html: string) => void }) {
  const stash = useMemo(() => stashInline(html), [html]);
  const [code, setCode] = useState(stash.html);
  useEffect(() => setCode(stash.html), [stash.html]);
  const changed = code !== stash.html;
  return (
    <div className="stack">
      {stash.store.length > 0 && <p className="small muted">{stash.store.length} embedded image{stash.store.length > 1 ? 's are' : ' is'} shown as <code>inline-image://N</code> to keep this readable. Leave those tokens in place.</p>}
      <p className="small muted">Social tags aren’t stored in the page; they’re added from the Details tab when you copy.</p>
      <textarea className="textarea code" style={{ minHeight: 'calc(100vh - 420px)' }} value={code} disabled={disabled}
        onChange={(e) => setCode(e.target.value)} spellCheck={false} aria-label="HTML source" />
      <div className="row">
        <button className="btn primary" disabled={!changed || disabled} onClick={() => onApply(restoreInline(code, stash.store))}>Apply to preview</button>
        <button className="btn" disabled={!changed} onClick={() => setCode(stash.html)}>Reset</button>
      </div>
    </div>
  );
}

function ImagesPanel({ html, dealer, disabled, onChange, flash }: {
  html: string; dealer: Dealer | null; disabled: boolean; onChange: (html: string) => void; flash: (m: string) => void;
}) {
  const images = useMemo(() => listImages(html), [html]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [hosting, setHosting] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);
  const inline = images.filter((i) => i.inline);
  const inlineBytes = inline.reduce((s, i) => s + i.bytes * i.count, 0);

  const swap = (from: string, to: string) => onChange(replaceAll(html, from, to));

  async function hostAll() {
    setError('');
    let next = html;
    try {
      for (let i = 0; i < inline.length; i++) {
        setHosting(`Uploading ${i + 1} of ${inline.length}…`);
        const file = await dataUriToFile(inline[i].value, slugify(dealer?.slug ?? 'group') || 'image');
        const m = await uploadMedia(file, { dealershipId: dealer?.id ?? null, dealerSlug: dealer?.slug ?? null });
        next = replaceAll(next, inline[i].value, absolute(m.url));
      }
      onChange(next);
      flash(`${inline.length} image${inline.length > 1 ? 's' : ''} moved to the media library — save to keep the change`);
    } catch (e) {
      if (next !== html) onChange(next);
      setError(`Stopped: ${(e as Error).message}`);
    } finally { setHosting(''); }
  }

  async function uploadReplacement(files: FileList | null) {
    const target = uploadFor.current;
    if (!files?.[0] || !target) return;
    setHosting('Uploading…'); setError('');
    try {
      const m = await uploadMedia(files[0], { dealershipId: dealer?.id ?? null, dealerSlug: dealer?.slug ?? null });
      swap(target, absolute(m.url));
    } catch (e) { setError((e as Error).message); } finally { setHosting(''); }
  }

  if (!images.length) return <p className="muted small">No images on this page.</p>;
  return (
    <div className="stack">
      {inline.length > 0 && (
        <div className="notice warn stack" style={{ gap: 8 }}>
          <span>{inline.length} image{inline.length > 1 ? 's are' : ' is'} embedded in the HTML ({formatBytes(inlineBytes)}). Move {inline.length > 1 ? 'them' : 'it'} to the media library so the page is light to paste and fast to load.</span>
          <button className="btn sm dark" style={{ alignSelf: 'flex-start' }} onClick={hostAll} disabled={disabled || !!hosting}>
            {hosting || `Host all ${inline.length} embedded image${inline.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
      {hosting && !inline.length && <p className="small muted">{hosting}</p>}
      {error && <p className="err">{error}</p>}
      <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm" hidden onChange={(e) => { uploadReplacement(e.target.files); e.target.value = ''; }} />
      {images.map((img) => (
        <div key={img.value} className="img-row">
          <span className="thumb" style={{ backgroundImage: img.kind === 'video' || img.kind === 'source' ? undefined : `url("${img.value}")` }} />
          <div className="stack" style={{ gap: 6, minWidth: 0 }}>
            <span className="row" style={{ gap: 6 }}>
              <span className="chip">{img.kind === 'css' ? 'Background' : img.kind === 'img' ? 'Image' : 'Video'}</span>
              {img.inline ? <span className="chip warn">Embedded · {formatBytes(img.bytes)}</span> : <span className="chip ok">Hosted</span>}
              {img.count > 1 && <span className="small muted">used {img.count}×</span>}
            </span>
            {!img.inline && <span className="url">{img.value}</span>}
            <span className="row" style={{ gap: 6 }}>
              <button className="btn sm" disabled={disabled || !!hosting} onClick={() => { uploadFor.current = img.value; fileRef.current?.click(); }}>Upload new</button>
              <button className="btn sm" disabled={disabled || !!hosting} onClick={() => setPicking(img.value)}>From library</button>
            </span>
            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <input className="input" style={{ height: 32, padding: '4px 12px', fontSize: 13 }} placeholder="…or paste an image URL" disabled={disabled}
                value={edits[img.value] ?? ''} onChange={(e) => setEdits({ ...edits, [img.value]: e.target.value })} aria-label="Replacement image URL" />
              <button className="btn sm" disabled={disabled || !edits[img.value]?.trim()} onClick={() => {
                swap(img.value, edits[img.value].trim());
                setEdits({ ...edits, [img.value]: '' });
              }}>Swap</button>
            </span>
          </div>
        </div>
      ))}
      {picking && (
        <MediaPicker dealershipId={dealer?.id ?? null} dealerSlug={dealer?.slug ?? null} dealerName={dealer?.name ?? null}
          onClose={() => setPicking(null)} onPick={(url) => { swap(picking, url); setPicking(null); }} />
      )}
    </div>
  );
}

function DetailsPanel({ page, dealers, templates, html, ogImage, onPage, onScoped, flash, setError }: {
  page: PageData; dealers: Dealer[]; templates: Tpl[]; html: string; ogImage: string;
  onPage: (fn: (p: PageData) => PageData) => void; onScoped: (html: string) => void;
  flash: (m: string) => void; setError: (m: string) => void;
}) {
  const [f, setF] = useState({
    title: page.title, dealershipId: page.dealership_id ? String(page.dealership_id) : '', pageType: page.page_type,
    liveUrl: page.live_url ?? '', notes: page.notes ?? '',
  });
  const [seo, setSeo] = useState<Seo>({ metaTitle: page.meta_title ?? '', metaDescription: page.meta_description ?? '', canonical: page.canonical_url ?? '' });
  const [busy, setBusy] = useState(false);
  const scoped = /class="gcs-[a-z0-9-]+/.test(html);
  const dealer = dealers.find((d) => String(d.id) === f.dealershipId) ?? null;
  const pattern = templates.find((t) => t.slug === f.pageType)?.url_pattern ?? null;
  const std = standardUrl(pattern, dealer);
  const stdPath = standardPath(pattern, dealer?.name);
  const onStd = matchesStandard(f.liveUrl, pattern, dealer?.name);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true); setError('');
    try {
      await api(`/api/pages/${page.id}`, { ...f, ...seo, ...extra }, 'PATCH');
      onPage((p) => ({ ...p, title: f.title, dealership_id: dealer?.id ?? null, dealership: dealer?.name ?? null, dslug: dealer?.slug ?? null,
        page_type: f.pageType, live_url: f.liveUrl || null, notes: f.notes || null,
        meta_title: seo.metaTitle || null, meta_description: seo.metaDescription || null, canonical_url: seo.canonical || null,
        ...(extra.status ? { status: extra.status as PageData['status'] } : {}) }));
      flash('Details saved');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function scope() {
    setBusy(true); setError('');
    try {
      const { html: out } = await api<{ html: string }>('/api/tools/scope', { html, name: `${dealer?.slug ?? 'group'}-${page.page_type}` });
      onScoped(out);
      flash('Styles scoped — review the preview, then save');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <div className="field"><label htmlFor="t">Title in the CMS</label><input id="t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="field"><label htmlFor="dl">Dealership</label>
        <select id="dl" className="select" value={f.dealershipId} onChange={(e) => setF({ ...f, dealershipId: e.target.value })}>
          <option value="">Garber Automotive Group (group page)</option>
          {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="pt">Template</label>
        <select id="pt" className="select" value={f.pageType} onChange={(e) => setF({ ...f, pageType: e.target.value })}>
          {templates.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="lu">Page URL on the dealer site</label>
        <input id="lu" className="input" value={f.liveUrl} placeholder={std ?? 'https://…'} onChange={(e) => setF({ ...f, liveUrl: e.target.value })} />
        {stdPath && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="hint">Standard address for this template: <code>{stdPath}</code>. Create the page in Dealer.com at exactly this URL.</span>
            <span className="row" style={{ gap: 6 }}>
              {f.liveUrl && !onStd && <span className="chip warn">Doesn’t match the standard URL</span>}
              {f.liveUrl && onStd && <span className="chip ok">Standard URL</span>}
              {!onStd && std && <button className="btn sm" onClick={() => setF({ ...f, liveUrl: std })}>Use standard URL</button>}
              <button className="btn sm ghost" onClick={async () => { if (await copyText(stdPath)) flash('URL path copied'); }}>Copy path</button>
            </span>
          </div>
        )}
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
      <SeoFields seo={seo} onChange={setSeo} html={html} dealershipId={dealer?.id ?? null} pageTitle={f.title}
        template={templates.find((t) => t.slug === f.pageType)?.name ?? 'Custom page'} ogImage={ogImage}
        siteName={dealer?.website ?? 'garberauto.com'} liveUrl={f.liveUrl} />

      <div className="field"><label htmlFor="nt">Notes</label><textarea id="nt" className="textarea" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <button className="btn primary" onClick={() => save()} disabled={busy}>Save details</button>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
      <div className="stack" style={{ gap: 8 }}>
        <strong className="small">Paste safety</strong>
        {scoped
          ? <p className="small muted">Styles are scoped to this page’s wrapper, so they won’t change the rest of the dealer site.</p>
          : <p className="small muted">This page’s CSS isn’t scoped yet — rules like <code>body</code> or <code>.card</code> could restyle the dealer site around it. Scoping wraps the content and prefixes every rule.</p>}
        <button className="btn" onClick={scope} disabled={busy || scoped}>{scoped ? 'Already scoped' : 'Scope the CSS'}</button>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
      {page.status === 'archived'
        ? <button className="btn" onClick={() => save({ status: page.live_version ? 'live' : 'draft' })} disabled={busy}>Restore from archive</button>
        : <button className="btn danger" onClick={() => { if (confirm('Archive this page? It leaves the library list but keeps its history.')) save({ status: 'archived' }); }} disabled={busy}>Archive page</button>}
    </div>
  );
}
