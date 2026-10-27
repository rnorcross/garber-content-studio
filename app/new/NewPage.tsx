'use client';
import { useRef, useState } from 'react';
import Preview, { type Device } from '@/components/Preview';
import SeoFields, { type Seo } from '@/components/SeoFields';
import { api, streamHtml } from '@/lib/client';
import { toFragment, formatBytes, extractSocialMeta, defaultOgImage, GROUP_OG_IMAGE } from '@/lib/fragment';
import type { Template } from '@/lib/templates';
import { standardUrl } from '@/lib/urls.mjs';

type Dealer = { id: number; name: string; slug: string; og_image: string | null; website: string | null };
type Props = {
  dealers: Dealer[];
  pages: { id: number; title: string; dealership: string | null }[];
  templates: Template[];
  initialDealer: number | null;
  initialTemplate: string | null;
};

export default function NewPage({ dealers, pages, templates, initialDealer, initialTemplate }: Props) {
  const [mode, setMode] = useState<'generate' | 'import'>('generate');
  const [dealerId, setDealerId] = useState<string>(initialDealer ? String(initialDealer) : '');
  const [slug, setSlug] = useState(initialTemplate && templates.some((t) => t.slug === initialTemplate) ? initialTemplate : templates[0]?.slug ?? 'custom');
  const tpl = templates.find((t) => t.slug === slug) ?? null;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [refId, setRefId] = useState<string>(''); // '' = template default, '0' = none
  const [liveUrlEdit, setLiveUrl] = useState<string | null>(null); // null = use the standard URL
  const [importHtml, setImportHtml] = useState('');
  const [seo, setSeo] = useState<Seo>({ metaTitle: '', metaDescription: '', canonical: tpl?.default_canonical ?? '' });

  const [html, setHtml] = useState('');
  const [streamed, setStreamed] = useState(0);
  const [busy, setBusy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const abort = useRef<AbortController | null>(null);

  const dealer = dealers.find((d) => String(d.id) === dealerId) ?? null;
  const stdUrl = standardUrl(tpl?.url_pattern ?? null, dealer);
  const liveUrl = liveUrlEdit ?? stdUrl ?? '';
  const autoTitle = `${dealer?.name ?? 'Garber Automotive Group'} — ${tpl?.name ?? 'Custom page'}`;
  const ogImage = dealer ? dealer.og_image || defaultOgImage(dealer.slug) : GROUP_OG_IMAGE;
  const refDefault = tpl?.reference_page_id ? pages.find((p) => p.id === tpl.reference_page_id) : null;

  function pickTemplate(t: Template) {
    setSlug(t.slug);
    setSeo((s) => ({ ...s, canonical: t.default_canonical ?? '' }));
  }

  async function writeMeta(body: string) {
    setBusy('meta');
    try {
      const m = await api<{ title: string; description: string }>('/api/meta', { html: body, dealershipId: dealer?.id ?? null, title: title || autoTitle, template: tpl?.name });
      setSeo((s) => ({ ...s, metaTitle: m.title, metaDescription: m.description }));
    } catch (e) {
      setError(`Page built, but the meta title/description failed: ${(e as Error).message}`);
    }
  }

  async function generate() {
    if (tpl?.is_custom && !prompt.trim()) { setError('Describe the page you want.'); return; }
    setBusy('page'); setError(''); setHtml(''); setStreamed(0);
    abort.current = new AbortController();
    let last = 0;
    try {
      const out = await streamHtml(
        { mode: 'create', dealershipId: dealerId || null, templateSlug: slug, title: title || autoTitle, prompt, fields,
          referencePageId: refId === '' ? null : Number(refId) },
        (t) => {
          setStreamed(t.length);
          if (t.length - last > 4000) { last = t.length; setHtml(t.replace(/^```html?\s*/i, '')); }
        },
        abort.current.signal,
      );
      setHtml(out);
      await writeMeta(out);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  // Imported HTML: pull any existing social tags out into the SEO fields.
  function onImport(v: string) {
    setImportHtml(v);
    const m = extractSocialMeta(toFragment(v));
    setSeo((s) => ({
      metaTitle: s.metaTitle || m.title || '', metaDescription: s.metaDescription || m.description || '', canonical: s.canonical || m.canonical || '',
    }));
  }

  async function save() {
    const body = mode === 'import' ? toFragment(importHtml) : html;
    if (!body.trim()) return;
    setSaving(true); setError('');
    try {
      const { id } = await api<{ id: number }>('/api/pages', {
        title: title || autoTitle, dealershipId: dealerId || null, pageType: slug, html: body,
        source: mode === 'import' ? 'imported' : 'generated',
        prompt: mode === 'generate' ? [prompt, ...Object.entries(fields).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n\n') : null,
        liveUrl: liveUrl || null, metaTitle: seo.metaTitle, metaDescription: seo.metaDescription, canonical: seo.canonical,
      });
      location.href = `/p/${id}`;
    } catch (e) {
      setError((e as Error).message); setSaving(false);
    }
  }

  const shown = mode === 'import' ? extractSocialMeta(toFragment(importHtml)).html : html;

  return (
    <main className="wrap">
      <div className="head">
        <div>
          <div className="eyebrow">New page</div>
          <h1 className="title">{mode === 'generate' ? 'Pick a template and Claude builds the page' : 'Bring in an existing page'}</h1>
          <p className="sub">{mode === 'generate'
            ? 'Built in the Garber design system as a paste-ready fragment: no header or footer, styles scoped, mobile-ready.'
            : 'Paste the HTML that’s on the dealer site now (or a saved .html file) so it can be versioned and edited here.'}</p>
        </div>
        <div className="seg">
          <button className={mode === 'generate' ? 'on' : ''} onClick={() => setMode('generate')}>Generate</button>
          <button className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>Import HTML</button>
        </div>
      </div>

      <div className="card card-pad stack" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 260px', maxWidth: 380 }}>
            <label htmlFor="dealer">Dealership</label>
            <select id="dealer" className="select" value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
              <option value="">Garber Automotive Group (group page)</option>
              {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 260px', maxWidth: 420 }}>
            <label htmlFor="title">Title in the CMS</label>
            <input id="title" className="input" value={title} placeholder={autoTitle} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Template</label>
          <div className="tpl-grid" role="radiogroup" aria-label="Template">
            {templates.map((t, i) => (
              <button key={t.slug} role="radio" aria-checked={slug === t.slug} className={`tpl${slug === t.slug ? ' on' : ''}`} onClick={() => pickTemplate(t)}>
                <strong>{i + 1}. {t.name}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
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
            {busy === 'page' && <span className="small muted">Writing… {formatBytes(streamed)}</span>}
            {busy === 'meta' && <span className="small muted">Writing the meta title and description…</span>}
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
            {mode === 'generate' ? (
              <>
                {tpl?.fields.map((f) => (
                  <div className="field" key={f.key}>
                    <label htmlFor={`f-${f.key}`}>{f.label}</label>
                    {f.type === 'text'
                      ? <input id={`f-${f.key}`} className="input" value={fields[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
                      : <textarea id={`f-${f.key}`} className="textarea" rows={4} value={fields[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />}
                  </div>
                ))}
                <div className="field">
                  <label htmlFor="prompt">{tpl?.is_custom ? 'Describe the page' : 'Anything else? (optional)'}</label>
                  <textarea id="prompt" className="textarea" rows={tpl?.is_custom ? 7 : 3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                    placeholder={tpl?.is_custom
                      ? 'What the page is for, who it’s for, the sections you want, the main call to action, and any facts or copy to use.'
                      : 'Extra direction for this page.'} />
                </div>
                <div className="field">
                  <label htmlFor="ref">Match the style of</label>
                  <select id="ref" className="select" value={refId} onChange={(e) => setRefId(e.target.value)}>
                    <option value="">{refDefault ? `Template default: ${refDefault.title}` : 'Template default (none)'}</option>
                    <option value="0">No reference page</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div className="row">
                  {busy === 'page'
                    ? <button className="btn" onClick={() => abort.current?.abort()}>Stop</button>
                    : <button className="btn primary" onClick={generate} disabled={!!busy}>{html ? 'Generate again' : 'Generate page'}</button>}
                </div>
              </>
            ) : (
              <div className="field">
                <label htmlFor="imp">HTML</label>
                <textarea id="imp" className="textarea code" rows={12} value={importHtml} onChange={(e) => onImport(e.target.value)}
                  placeholder="<style>…</style>&#10;<div class=&quot;…&quot;>…</div>" spellCheck={false} />
                <label className="btn sm" style={{ alignSelf: 'flex-start' }}>
                  Choose .html file
                  <input type="file" accept=".html,.htm,text/html" hidden onChange={async (e) => {
                    const f = e.target.files?.[0]; if (f) onImport(await f.text());
                  }} />
                </label>
                <span className="hint">Existing Open Graph tags are moved into the meta fields below.</span>
              </div>
            )}

            <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
            <SeoFields seo={seo} onChange={setSeo} html={shown} dealershipId={dealer?.id ?? null} pageTitle={title || autoTitle}
              template={tpl?.name ?? 'Custom page'} ogImage={ogImage} siteName={dealer?.website ?? 'garberauto.com'} liveUrl={liveUrl} disabled={busy === 'meta'} />
            <div className="field">
              <label htmlFor="live">Page URL on the dealer site</label>
              <input id="live" className="input" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder={dealer?.website ? `${dealer.website}/…` : 'https://…'} />
              {stdUrl && <span className="hint">Standard address for {tpl?.name}. Create the page in Dealer.com at this URL.{liveUrlEdit !== null && liveUrlEdit !== stdUrl && <> <button className="btn sm ghost" onClick={() => setLiveUrl(null)}>Use standard URL</button></>}</span>}
            </div>

            {error && <p className="err" role="alert">{error}</p>}
            <button className="btn dark" onClick={save} disabled={saving || !!busy || !shown.trim()}>
              {saving ? 'Saving…' : 'Save to library'}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
