'use client';
import { useState } from 'react';
import { api, copyText } from '@/lib/client';

export type Seo = { metaTitle: string; metaDescription: string; canonical: string };

const LIMITS = { title: 60, description: 160 };

/** Meta title + description (with counters and "Write with Claude"), canonical URL, and a social preview. */
export default function SeoFields({ seo, onChange, html, dealershipId, pageTitle, template, ogImage, siteName, liveUrl, disabled }: {
  seo: Seo; onChange: (s: Seo) => void; html: string; dealershipId: number | null; pageTitle: string; template: string;
  ogImage: string; siteName: string; liveUrl?: string; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function write() {
    setBusy(true); setError('');
    try {
      const out = await api<{ title: string; description: string }>('/api/meta', { html, dealershipId, title: pageTitle, template });
      onChange({ ...seo, metaTitle: out.title, metaDescription: out.description });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copy(label: string, v: string) {
    if (await copyText(v)) { setCopied(label); setTimeout(() => setCopied(''), 1500); }
  }

  const t = seo.metaTitle.length, d = seo.metaDescription.length;
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong className="small">Search & social</strong>
        <button className="btn sm" onClick={write} disabled={busy || disabled || !html.trim()}>{busy ? 'Writing…' : seo.metaTitle ? 'Rewrite with Claude' : 'Write with Claude'}</button>
      </div>
      <div className="field">
        <label htmlFor="mt">Meta title</label>
        <input id="mt" className="input" value={seo.metaTitle} disabled={disabled} onChange={(e) => onChange({ ...seo, metaTitle: e.target.value })} placeholder="50–60 characters" />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className={`counter${t > LIMITS.title ? ' over' : ''}`}>{t} / {LIMITS.title}</span>
          {seo.metaTitle && <button className="btn sm ghost" onClick={() => copy('title', seo.metaTitle)}>{copied === 'title' ? 'Copied' : 'Copy'}</button>}
        </div>
      </div>
      <div className="field">
        <label htmlFor="md">Meta description</label>
        <textarea id="md" className="textarea" rows={3} value={seo.metaDescription} disabled={disabled} onChange={(e) => onChange({ ...seo, metaDescription: e.target.value })} placeholder="140–155 characters" />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className={`counter${d > LIMITS.description ? ' over' : ''}`}>{d} / {LIMITS.description}</span>
          {seo.metaDescription && <button className="btn sm ghost" onClick={() => copy('desc', seo.metaDescription)}>{copied === 'desc' ? 'Copied' : 'Copy'}</button>}
        </div>
        <span className="hint">Paste these into the page’s SEO title and description in Dealer.com. They also become the Open Graph tags in the copied HTML.</span>
      </div>
      <div className="field">
        <label htmlFor="cn">Canonical URL <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
        <input id="cn" className="input" value={seo.canonical} disabled={disabled} onChange={(e) => onChange({ ...seo, canonical: e.target.value })} placeholder="Leave empty unless this page duplicates another" />
      </div>
      {error && <p className="err">{error}</p>}
      <div className="field">
        <label>Social share preview</label>
        <div className="og-card">
          <div className="og-img" style={{ backgroundImage: `url("${ogImage}")` }} />
          <div className="og-text">
            <span className="small muted">{(liveUrl || siteName).replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toUpperCase()}</span>
            <strong className="small">{seo.metaTitle || pageTitle}</strong>
            <span className="small muted">{seo.metaDescription || 'Add a meta description'}</span>
          </div>
        </div>
        <span className="hint">The image is the dealership’s Open Graph image. Change it on the dealership’s page.</span>
      </div>
    </div>
  );
}
