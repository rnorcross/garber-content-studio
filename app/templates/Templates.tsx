'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import type { Template, TemplateField } from '@/lib/templates';

type Draft = {
  id?: number; name: string; description: string; brief: string; fields: TemplateField[];
  referencePageId: string; defaultCanonical: string; urlPattern: string; active: boolean; sort: number; is_custom?: boolean;
};

const toDraft = (t: Template): Draft => ({
  id: t.id, name: t.name, description: t.description ?? '', brief: t.brief, fields: t.fields,
  referencePageId: t.reference_page_id ? String(t.reference_page_id) : '', defaultCanonical: t.default_canonical ?? '', urlPattern: t.url_pattern ?? '',
  active: t.active, sort: t.sort, is_custom: t.is_custom,
});
const blank = (sort: number): Draft => ({ name: '', description: '', brief: '', fields: [], referencePageId: '', defaultCanonical: '', urlPattern: '', active: true, sort });

export default function Templates({ templates, pages, usage }: { templates: Template[]; pages: { id: number; title: string }[]; usage: Record<string, number> }) {
  const [list, setList] = useState(templates);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function save() {
    if (!edit) return;
    setError(''); setMsg('');
    try {
      if (edit.id) await api(`/api/templates/${edit.id}`, edit, 'PATCH');
      else await api('/api/templates', edit);
      setMsg(`Saved ${edit.name}.`);
      location.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const setField = (i: number, patch: Partial<TemplateField>) =>
    edit && setEdit({ ...edit, fields: edit.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  return (
    <main className="wrap">
      <div className="head">
        <div>
          <div className="eyebrow">Templates</div>
          <h1 className="title">Page templates</h1>
          <p className="sub">What the New Page picker offers. Each template is a brief Claude follows, the inputs it asks for, and an optional page to copy the style of.</p>
        </div>
        <button className="btn primary" onClick={() => setEdit(blank((list.at(-1)?.sort ?? 90) + 10))}>New template</button>
      </div>
      {msg && <div className="notice ok" style={{ marginBottom: 12 }}>{msg}</div>}
      {error && <div className="notice warn" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="editor" style={{ gridTemplateColumns: edit ? 'minmax(0, 1fr) minmax(0, 1.3fr)' : 'minmax(0, 1fr)' }}>
        <div className="card table-scroll">
          <table className="table">
            <thead><tr><th>#</th><th>Template</th><th>Page URL</th><th>Inputs</th><th>Pages</th><th></th></tr></thead>
            <tbody>
              {list.map((t, i) => (
                <tr key={t.id} style={{ opacity: t.active ? 1 : 0.5 }}>
                  <td className="small muted">{i + 1}</td>
                  <td><strong>{t.name}</strong>{!t.active && <span className="chip" style={{ marginLeft: 6 }}>Hidden</span>}<div className="small muted">{t.description}</div></td>
                  <td className="small"><code>{t.url_pattern ?? '—'}</code></td>
                  <td className="small">{t.is_custom ? 'Prompt' : `${t.fields.length} field${t.fields.length === 1 ? '' : 's'}`}</td>
                  <td className="small">{usage[t.slug] ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <Link className="btn sm" href={`/new?t=${t.slug}`}>Use</Link>
                      <button className="btn sm" onClick={() => setEdit(toDraft(t))}>Edit</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {edit && (
          <div className="card card-pad stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{edit.id ? `Edit ${edit.name}` : 'New template'}</strong>
              <button className="btn sm ghost" onClick={() => setEdit(null)}>Close</button>
            </div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="field" style={{ flex: '1 1 220px' }}><label htmlFor="tn">Name</label><input id="tn" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="field" style={{ width: 110 }}><label htmlFor="ts">Order</label><input id="ts" className="input" type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></div>
            </div>
            <div className="field"><label htmlFor="td">Short description</label><input id="td" className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Shown on the template card" /></div>
            <div className="field">
              <label htmlFor="tb">Brief for Claude</label>
              <textarea id="tb" className="textarea" rows={12} value={edit.brief} onChange={(e) => setEdit({ ...edit, brief: e.target.value })}
                placeholder="The sections in order, required headlines or wording, what’s group-wide vs store-specific, layout notes…" />
              <span className="hint">Claude always gets the Garber design system and paste-in rules; this adds what’s specific to this kind of page.</span>
            </div>
            {!edit.is_custom && (
              <div className="field">
                <label>Inputs on the New Page form</label>
                <div className="stack" style={{ gap: 8 }}>
                  {edit.fields.map((f, i) => (
                    <div key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                      <input className="input" style={{ flex: 2 }} value={f.label} placeholder="Label" onChange={(e) => setField(i, { label: e.target.value })} aria-label="Field label" />
                      <select className="select" style={{ width: 130 }} value={f.type} onChange={(e) => setField(i, { type: e.target.value as TemplateField['type'] })} aria-label="Field type">
                        <option value="text">One line</option><option value="textarea">Paragraph</option>
                      </select>
                      <input className="input" style={{ flex: 3 }} value={f.placeholder ?? ''} placeholder="Hint (optional)" onChange={(e) => setField(i, { placeholder: e.target.value })} aria-label="Field hint" />
                      <button className="btn sm ghost" onClick={() => setEdit({ ...edit, fields: edit.fields.filter((_, j) => j !== i) })} aria-label="Remove field">Remove</button>
                    </div>
                  ))}
                  <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ ...edit, fields: [...edit.fields, { key: '', label: '', type: 'textarea' }] })}>Add input</button>
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="tr">Style reference page</label>
              <select id="tr" className="select" value={edit.referencePageId} onChange={(e) => setEdit({ ...edit, referencePageId: e.target.value })}>
                <option value="">None</option>
                {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <span className="hint">Claude matches this page’s layout and components when building new pages from the template.</span>
            </div>
            <div className="field">
              <label htmlFor="tu">Page URL on the dealer site</label>
              <input id="tu" className="input" value={edit.urlPattern} onChange={(e) => setEdit({ ...edit, urlPattern: e.target.value })} placeholder="/{dealer}-page-name.htm" />
              <span className="hint">{'{dealer}'} becomes the dealership name, e.g. Garber Buick → garber-buick. Every page from this template gets this address on its dealership’s website.</span>
            </div>
            <div className="field"><label htmlFor="tc">Default canonical URL</label><input id="tc" className="input" value={edit.defaultCanonical} onChange={(e) => setEdit({ ...edit, defaultCanonical: e.target.value })} placeholder="Optional — e.g. the group page these store pages duplicate" /></div>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Show in the New Page picker
            </label>
            <div className="row"><button className="btn primary" onClick={save}>Save template</button></div>
          </div>
        )}
      </div>
    </main>
  );
}
