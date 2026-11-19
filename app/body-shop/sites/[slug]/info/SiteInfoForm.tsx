'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { DAYS, SOCIALS, hoursFormats, type Hours, type SiteInfo } from '@/lib/bodyshop-info';

const DAY_LABEL: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const SOCIAL_LABEL: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn' };
const closedWeek = () => Object.fromEntries(DAYS.map((d) => [d, null])) as Hours;

export default function SiteInfoForm({ slug, base, info, live }: { slug: string; base: SiteInfo; info: SiteInfo; live: SiteInfo }) {
  const router = useRouter();
  const [f, setF] = useState<SiteInfo>(() => ({ ...info, hours: info.hours ?? base.hours ?? closedWeek(), social: { ...(info.social ?? {}) } }));
  const [leads, setLeads] = useState((info.leadEmails ?? []).join(', '));
  const [estimates, setEstimates] = useState((info.estimateEmails ?? []).join(', '));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const known = Object.keys(base).length > 0;
  const set = (k: keyof SiteInfo, v: any) => setF((x) => ({ ...x, [k]: v }));
  const setDay = (d: string, v: { open: string; close: string } | null) => setF((x) => ({ ...x, hours: { ...(x.hours as Hours), [d]: v } }));
  const draftDiffers = JSON.stringify(info) !== JSON.stringify(live);
  /** A dot next to a field that differs from what the approved pages were built with. */
  const dot = (a: unknown, b: unknown) => (JSON.stringify(a ?? '') !== JSON.stringify(b ?? '') ? <span className="bs-changed-dot" title={`Pages were built with: ${typeof b === 'string' ? b : 'a different value'}`} /> : null);

  async function save(publish: boolean) {
    setBusy(publish ? 'publish' : 'save'); setErr(''); setMsg('');
    try {
      await api(`/api/body-shop/sites/${slug}`, { action: 'info', info: { ...f, leadEmails: leads, estimateEmails: estimates } });
      if (publish) await api(`/api/body-shop/sites/${slug}`, { action: 'publish-all' });
      setMsg(publish ? 'Saved and published. The site shows the new details within a few seconds.' : 'Saved to draft. Check a page in Preview, then publish.');
      router.refresh();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(''); }
  }

  const text = (k: 'name' | 'phone' | 'street' | 'city' | 'region' | 'zip' | 'mapUrl', label: string, ph = '') => (
    <div className="field">
      <label>{label}{dot(f[k], base[k])}</label>
      <input className="input" value={(f[k] as string) ?? ''} placeholder={ph || (base[k] as string) || ''} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div className="stack">
      {!known && (
        <p className="bs-warn">The home page has no business markup to read, so nothing here is connected to the pages yet. Use find &amp; replace on the site page instead.</p>
      )}

      <div className="card card-pad stack">
        <div className="bs-card-title" style={{ marginTop: 0 }}>Business</div>
        <div className="bs-info-grid">
          {text('name', 'Shop name')}
          {text('phone', 'Phone', '(989) 474-3816')}
        </div>
        <span className="hint">The phone number also updates tap-to-call links and the number in Google’s business details.</span>
      </div>

      <div className="card card-pad stack">
        <div className="bs-card-title" style={{ marginTop: 0 }}>Address</div>
        <div className="bs-info-grid">
          {text('street', 'Street')}
          {text('city', 'City')}
          {text('region', 'State')}
          {text('zip', 'ZIP')}
        </div>
        {text('mapUrl', 'Google Maps link')}
      </div>

      <div className="card card-pad stack">
        <div className="bs-card-title" style={{ marginTop: 0 }}>Hours{dot(f.hours, base.hours)}</div>
        <div className="bs-hours">
          {DAYS.map((d) => {
            const h = (f.hours as Hours)[d];
            return (
              <div key={d} style={{ display: 'contents' }}>
                <span className="day">{DAY_LABEL[d]}</span>
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={!!h} onChange={(e) => setDay(d, e.target.checked ? { open: '08:00', close: '17:00' } : null)} /> Open
                </label>
                {h ? <input className="input" type="time" value={h.open} onChange={(e) => setDay(d, { ...h, open: e.target.value })} /> : <span className="sub">Closed</span>}
                {h ? <input className="input" type="time" value={h.close} onChange={(e) => setDay(d, { ...h, close: e.target.value })} /> : <span />}
              </div>
            );
          })}
        </div>
        <span className="hint">Shows on the pages as: {hoursFormats(f.hours as Hours).longLines.join(' · ')}</span>
      </div>

      <div className="card card-pad stack">
        <div className="bs-card-title" style={{ marginTop: 0 }}>Social links</div>
        <div className="bs-info-grid">
          {SOCIALS.map((s) => (
            <div key={s} className="field">
              <label>{SOCIAL_LABEL[s]}{dot(f.social?.[s], base.social?.[s])}</label>
              <input className="input" value={f.social?.[s] ?? ''} placeholder={base.social?.[s] ?? 'https://…'}
                onChange={(e) => set('social', { ...(f.social ?? {}), [s]: e.target.value })} />
            </div>
          ))}
        </div>
        <span className="hint">Changing a link updates it everywhere it appears. To remove a social icon, edit the page directly.</span>
      </div>

      <div className="card card-pad stack">
        <div className="bs-card-title" style={{ marginTop: 0 }}>Form recipients</div>
        <div className="bs-info-grid">
          <div className="field">
            <label>Estimate requests go to</label>
            <input className="input" value={estimates} onChange={(e) => setEstimates(e.target.value)} placeholder="name@garberauto.com, …" />
          </div>
          <div className="field">
            <label>Contact messages go to</label>
            <input className="input" value={leads} onChange={(e) => setLeads(e.target.value)} placeholder="name@garberauto.com, …" />
          </div>
        </div>
        <span className="hint">Saved now, used once the forms are connected to the functions app.</span>
      </div>

      {err && <p className="bs-err">{err}</p>}
      {msg && <p className="sub" style={{ color: 'var(--ok)' }}>{msg}</p>}
      <div className="row">
        <button className="btn dark" disabled={!!busy} onClick={() => save(false)}>{busy === 'save' ? 'Saving…' : 'Save to draft'}</button>
        <button className="btn primary" disabled={!!busy} onClick={() => save(true)}>{busy === 'publish' ? 'Publishing…' : 'Save and publish'}</button>
        {draftDiffers && <span className="chip warn">Draft differs from live</span>}
      </div>
      <p className="sub" style={{ fontSize: 12.5 }}>“Save and publish” also publishes any other waiting changes on this site.</p>
    </div>
  );
}
