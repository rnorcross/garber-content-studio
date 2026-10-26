'use client';
import { useRef, useState } from 'react';
import Preview, { type Device } from '@/components/Preview';
import { PAGE_TYPES, pageTypeLabel } from '@/lib/prompt';
import { api, streamHtml } from '@/lib/client';
import { toFragment, formatBytes } from '@/lib/fragment';

type Props = {
  dealers: { id: number; name: string }[];
  pages: { id: number; title: string; dealership: string | null }[];
  initialDealer: number | null;
};

export default function NewPage({ dealers, pages, initialDealer }: Props) {
  const [mode, setMode] = useState<'generate' | 'import'>('generate');
  const [dealerId, setDealerId] = useState<string>(initialDealer ? String(initialDealer) : '');
  const [pageType, setPageType] = useState('about');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [refId, setRefId] = useState('');
  const [liveUrl, setLiveUrl] = useState('');
  const [importHtml, setImportHtml] = useState('');

  const [html, setHtml] = useState('');
  const [streamed, setStreamed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const abort = useRef<AbortController | null>(null);

  const dealerName = dealers.find((d) => String(d.id) === dealerId)?.name;
  const autoTitle = `${dealerName ?? 'Garber Automotive Group'} — ${pageTypeLabel(pageType)}`;

  async function generate() {
    setBusy(true); setError(''); setHtml(''); setStreamed(0);
    abort.current = new AbortController();
    let last = 0;
    try {
      const out = await streamHtml(
        { mode: 'create', dealershipId: dealerId || null, pageType, title: title || autoTitle, prompt, content, referencePageId: refId || null },
        (t) => {
          setStreamed(t.length);
          // refresh the preview every ~4 KB so the page builds up as it streams
          if (t.length - last > 4000) { last = t.length; setHtml(t.replace(/^```html?\s*/i, '')); }
        },
        abort.current.signal,
      );
      setHtml(out);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const body = mode === 'import' ? toFragment(importHtml) : html;
    if (!body.trim()) return;
    setSaving(true); setError('');
    try {
      const { id } = await api<{ id: number }>('/api/pages', {
        title: title || autoTitle, dealershipId: dealerId || null, pageType, html: body,
        source: mode === 'import' ? 'imported' : 'generated', prompt: mode === 'generate' ? [prompt, content].filter(Boolean).join('\n\n---\n\n') : null,
        liveUrl: liveUrl || null,
      });
      location.href = `/p/${id}`;
    } catch (e) {
      setError((e as Error).message); setSaving(false);
    }
  }

  const shown = mode === 'import' ? toFragment(importHtml) : html;

  return (
    <main className="wrap">
      <div className="head">
        <div>
          <div className="eyebrow">New page</div>
          <h1 className="title">{mode === 'generate' ? 'Describe the page and Claude builds it' : 'Bring in an existing page'}</h1>
          <p className="sub">{mode === 'generate'
            ? 'Built in the Garber design system as a paste-ready fragment: no header or footer, styles scoped, mobile-ready.'
            : 'Paste the HTML that’s on the dealer site now (or a saved .html file) so it can be versioned and edited here.'}</p>
        </div>
        <div className="seg">
          <button className={mode === 'generate' ? 'on' : ''} onClick={() => setMode('generate')}>Generate</button>
          <button className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>Import HTML</button>
        </div>
      </div>

      <div className="editor">
        <section className="card stage" aria-label="Preview">
          <div className="stage-bar">
            <div className="seg" role="group" aria-label="Preview width">
              {(['desktop', 'tablet', 'phone'] as Device[]).map((d) => (
                <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>{d[0].toUpperCase() + d.slice(1)}</button>
              ))}
            </div>
            {busy && <span className="small muted">Writing… {formatBytes(streamed)}</span>}
            {!busy && shown && <span className="small muted">{formatBytes(shown.length)} of HTML</span>}
          </div>
          {busy && <div className="progress"><i /></div>}
          {shown ? <Preview html={shown} device={device} /> : (
            <div className="frame-host" style={{ alignItems: 'center' }}>
              <p className="muted">{mode === 'generate' ? 'Your page will appear here as it’s written.' : 'Paste HTML on the right to preview it.'}</p>
            </div>
          )}
        </section>

        <aside className="card panel" aria-label="Page setup">
          <div className="panel-body stack">
            <div className="field">
              <label htmlFor="dealer">Dealership</label>
              <select id="dealer" className="select" value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
                <option value="">Garber Automotive Group (group page)</option>
                {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="ptype">Page type</label>
                <select id="ptype" className="select" value={pageType} onChange={(e) => setPageType(e.target.value)}>
                  {PAGE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="title">Title in the CMS</label>
              <input id="title" className="input" value={title} placeholder={autoTitle} onChange={(e) => setTitle(e.target.value)} />
            </div>

            {mode === 'generate' ? (
              <>
                <div className="field">
                  <label htmlFor="prompt">What should the page do?</label>
                  <textarea id="prompt" className="textarea" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. An About Us page in the same card style as Garber Buick. Lead with the store’s 40 years in Midland, then service, community, and the group accolades." />
                </div>
                <div className="field">
                  <label htmlFor="content">Content to include <span className="muted">(optional)</span></label>
                  <textarea id="content" className="textarea" rows={6} value={content} onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste facts, copy, reviews, partner names, image URLs… Claude uses these instead of inventing anything." />
                </div>
                <div className="field">
                  <label htmlFor="ref">Match the style of</label>
                  <select id="ref" className="select" value={refId} onChange={(e) => setRefId(e.target.value)}>
                    <option value="">No reference page</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.title}{p.dealership && !p.title.includes(p.dealership) ? ` (${p.dealership})` : ''}</option>)}
                  </select>
                  <span className="hint">Claude copies the layout language of the page you pick.</span>
                </div>
                <div className="row">
                  {busy
                    ? <button className="btn" onClick={() => abort.current?.abort()}>Stop</button>
                    : <button className="btn primary" onClick={generate}>{html ? 'Generate again' : 'Generate page'}</button>}
                </div>
              </>
            ) : (
              <div className="field">
                <label htmlFor="imp">HTML</label>
                <textarea id="imp" className="textarea code" rows={14} value={importHtml} onChange={(e) => setImportHtml(e.target.value)}
                  placeholder="<style>…</style>&#10;<div class=&quot;…&quot;>…</div>" spellCheck={false} />
                <label className="btn sm" style={{ alignSelf: 'flex-start' }}>
                  Choose .html file
                  <input type="file" accept=".html,.htm,text/html" hidden onChange={async (e) => {
                    const f = e.target.files?.[0]; if (f) setImportHtml(await f.text());
                  }} />
                </label>
                <span className="hint">Full documents are trimmed to their content, styles and social meta tags.</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="live">Live page URL <span className="muted">(optional)</span></label>
              <input id="live" className="input" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://www.garberbuick.com/…" />
            </div>

            {error && <p className="err" role="alert">{error}</p>}
            <button className="btn dark" onClick={save} disabled={saving || busy || !shown.trim()}>
              {saving ? 'Saving…' : 'Save to library'}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
