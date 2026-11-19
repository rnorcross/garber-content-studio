'use client';
// The page-builder side of the editor: the Structure tree (select, hide, drag to reorder) and
// the Style panel for the selected element (per device, previewed live before saving).
import { useMemo, useState } from 'react';
import type { Edit } from '@/lib/bodyshop';

export type Key = { tag: string; from: string; nth: number; count: number } | null;
export type TreeNode = { path: string; parent: string; depth: number; kind: string; label: string; key: Key; hidden: boolean; marks: string; hasKids: boolean };
export type Selected = {
  path: string; kind: string; label: string; key: Key; styles: Record<string, string>; marks: string;
  ancestors: { path: string; kind: string; label: string }[];
};
export type Device = 'all' | 'tablet' | 'phone';

const ICON: Record<string, string> = {
  Section: '▭', Header: '▔', Footer: '▁', Menu: '☰', Heading: 'H', Text: '¶', Image: '▣', Video: '▶', Button: '⬭', Link: '↗',
  List: '☷', 'List item': '•', Form: '✎', Container: '▦',
};

/** The page as a tree. Click to select, eye to hide, drag a row onto a sibling to move it. */
export function StructurePanel({ nodes, selected, edits, busy, post, onHide, onShow, onMove }: {
  nodes: TreeNode[] | null; selected: string | null; edits: Edit[]; busy: boolean;
  post: (msg: object) => void;
  onHide: (n: TreeNode) => void; onShow: (editId: string) => void;
  onMove: (n: TreeNode, after: TreeNode | null) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<TreeNode | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const hideEdits = edits.filter((e) => e.kind === 'hide');

  // Keep the selected element's parents expanded.
  const shown = useMemo(() => {
    if (!nodes) return [];
    const openNow = new Set(open);
    if (selected) nodes.forEach((n) => { if (selected.startsWith(n.path + '.')) openNow.add(n.path); });
    const byPath = new Map(nodes.map((n) => [n.path, n]));
    const visible = (n: TreeNode): boolean => n.depth === 0 || (openNow.has(n.parent) && (!byPath.get(n.parent) || visible(byPath.get(n.parent)!)));
    return nodes.filter(visible).map((n) => ({ ...n, isOpen: openNow.has(n.path) }));
  }, [nodes, open, selected]);

  if (!nodes) return <p className="sub">Reading the page…</p>;

  function drop(target: TreeNode) {
    setOver(null);
    if (!drag || drag.path === target.path || drag.parent !== target.parent || !drag.key || !target.key) return;
    const sibs = nodes!.filter((n) => n.parent === target.parent);
    const from = sibs.findIndex((n) => n.path === drag.path), to = sibs.findIndex((n) => n.path === target.path);
    // Dropping on a row below puts it after that row; on a row above, before it.
    const after = from < to ? target : to > 0 ? sibs[to - 1] : null;
    if (after?.path === drag.path) return;
    onMove(drag, after);
    setDrag(null);
  }

  return (
    <div className="bs-tree" onMouseLeave={() => post({ ws: 'hover-path', path: null })}>
      <p className="sub" style={{ fontSize: 12.5, margin: '0 0 6px' }}>Click to select and style. Drag a row onto another in the same group to move it. The eye hides it from the page.</p>
      {shown.map((n) => {
        const hide = hideEdits.find((e) => n.marks.split(' ').includes(e.id));
        const canDrag = !!n.key && !busy;
        return (
          <div key={n.path}
            className={'bs-tree-row' + (selected === n.path ? ' on' : '') + (over === n.path ? ' over' : '') + (n.hidden ? ' off' : '')}
            style={{ paddingLeft: 6 + n.depth * 14 }}
            draggable={canDrag}
            onDragStart={() => setDrag(n)}
            onDragEnd={() => { setDrag(null); setOver(null); }}
            onDragOver={(e) => { if (drag && drag.parent === n.parent && drag.path !== n.path) { e.preventDefault(); setOver(n.path); } }}
            onDragLeave={() => setOver((o) => (o === n.path ? null : o))}
            onDrop={(e) => { e.preventDefault(); drop(n); }}
            onMouseEnter={() => post({ ws: 'hover-path', path: n.path })}
          >
            <button className="bs-tree-caret" disabled={!n.hasKids} onClick={() => setOpen((s) => { const x = new Set(s); if (x.has(n.path)) x.delete(n.path); else x.add(n.path); return x; })}>
              {n.hasKids ? (n.isOpen ? '▾' : '▸') : ''}
            </button>
            <button className="bs-tree-name" onClick={() => post({ ws: 'pick', path: n.path })} title={n.label}>
              <span className="bs-tree-icon">{ICON[n.kind] ?? '▦'}</span>
              <span className="bs-tree-kind">{n.kind}</span>
              <span className="bs-tree-label">{n.label}</span>
            </button>
            {hide
              ? <button className="bs-tree-eye" title="Show it again" disabled={busy} onClick={() => onShow(hide.id)}>◌</button>
              : <button className="bs-tree-eye" title="Hide on this page" disabled={busy || !n.key} onClick={() => onHide(n)}>◉</button>}
          </div>
        );
      })}
    </div>
  );
}

const rgbToHex = (c: string) => {
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? c : '';
  if (m[4] !== undefined && Number(m[4]) === 0) return '';
  return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
};
const px = (v?: string) => (v ? v.replace(/px$/, '') : '');

/** Style for the selected element. Every change previews live; Save stores it for the chosen device. */
export function StylePanel({ sel, device, setDevice, draft, setDraft, busy, onPick, onSave, onClear, hasStyle }: {
  sel: Selected | null; device: Device; setDevice: (d: Device) => void;
  draft: Record<string, string>; setDraft: (d: Record<string, string>) => void;
  busy: boolean; onPick: (path: string) => void; onSave: () => void; onClear: () => void; hasStyle: boolean;
}) {
  if (!sel) return <p className="sub" style={{ fontSize: 13.5 }}>Click anything in the preview, or a row in Structure, to style it.</p>;
  const cur = (p: string) => sel.styles[p] ?? '';
  const val = (p: string) => draft[p] ?? '';
  const set = (p: string, v: string) => setDraft({ ...draft, [p]: v });
  const unit = (p: string, v: string) => set(p, v === '' ? '' : /^-?\d+(\.\d+)?$/.test(v) ? `${v}px` : v);
  const num = (p: string, label: string) => (
    <label className="bs-style-num">
      <span>{label}</span>
      <input className="input" value={px(val(p))} placeholder={px(cur(p))} onChange={(e) => unit(p, e.target.value)} />
    </label>
  );
  const dirty = Object.keys(draft).length > 0;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="bs-crumbs">
        {sel.ancestors.slice(-4).map((a) => (
          <button key={a.path} className="bs-crumb" onClick={() => onPick(a.path)} title={a.label}>{a.kind}</button>
        ))}
        <span className="bs-crumb on">{sel.kind}</span>
      </div>
      <div className="bs-change-by" style={{ marginTop: -6 }}>“{sel.label.slice(0, 80)}”</div>
      {!sel.key && <p className="bs-warn">This element has no text or image to anchor a style to. Select its parent instead.</p>}

      <div className="seg full">
        {([['all', 'All devices'], ['tablet', 'Tablet'], ['phone', 'Phone']] as [Device, string][]).map(([d, l]) => (
          <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>{l}</button>
        ))}
      </div>
      {device !== 'all' && <span className="hint">These values apply on {device === 'tablet' ? 'tablets and phones (1024px and narrower)' : 'phones (767px and narrower)'} and override “All devices”.</span>}

      <div className="bs-style-group">
        <div className="bs-style-title">Typography</div>
        <div className="bs-style-row">
          {num('font-size', 'Size')}
          <label className="bs-style-num"><span>Weight</span>
            <select className="select" value={val('font-weight')} onChange={(e) => set('font-weight', e.target.value)}>
              <option value="">{cur('font-weight') || '—'}</option>
              {['300', '400', '500', '600', '700', '800', '900'].map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          {num('line-height', 'Line height')}
          {num('letter-spacing', 'Spacing')}
        </div>
        <div className="bs-style-row">
          <label className="bs-style-num"><span>Color</span>
            <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <input type="color" value={rgbToHex(val('color') || cur('color')) || '#000000'} onChange={(e) => set('color', e.target.value)} />
              {val('color') && <button className="btn sm ghost" onClick={() => set('color', '')}>×</button>}
            </span>
          </label>
          <label className="bs-style-num"><span>Case</span>
            <select className="select" value={val('text-transform')} onChange={(e) => set('text-transform', e.target.value)}>
              <option value="">{cur('text-transform') || '—'}</option>
              <option value="none">Normal</option><option value="uppercase">UPPER</option><option value="capitalize">Title</option>
            </select>
          </label>
          <div className="bs-style-num" style={{ gridColumn: 'span 2' }}><span>Align</span>
            <div className="seg">
              {['left', 'center', 'right'].map((a) => (
                <button key={a} className={(val('text-align') || cur('text-align')) === a ? 'on' : ''} onClick={() => set('text-align', a)}>{a[0].toUpperCase() + a.slice(1)}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bs-style-group">
        <div className="bs-style-title">Background</div>
        <div className="bs-style-row">
          <label className="bs-style-num"><span>Color</span>
            <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <input type="color" value={rgbToHex(val('background-color') || cur('background-color')) || '#ffffff'} onChange={(e) => set('background-color', e.target.value)} />
              {val('background-color') && <button className="btn sm ghost" onClick={() => set('background-color', '')}>×</button>}
              {!rgbToHex(cur('background-color')) && !val('background-color') && <span className="sub" style={{ fontSize: 12 }}>none</span>}
            </span>
          </label>
          {num('border-radius', 'Corners')}
          {num('max-width', 'Max width')}
        </div>
      </div>

      <div className="bs-style-group">
        <div className="bs-style-title">Spacing <span className="sub" style={{ fontWeight: 400 }}>(px)</span></div>
        <div className="bs-style-row">
          {num('padding-top', 'Pad top')}{num('padding-right', 'Right')}{num('padding-bottom', 'Bottom')}{num('padding-left', 'Left')}
        </div>
        <div className="bs-style-row">
          {num('margin-top', 'Margin top')}{num('margin-right', 'Right')}{num('margin-bottom', 'Bottom')}{num('margin-left', 'Left')}
        </div>
      </div>

      <label className="row" style={{ gap: 8, fontSize: 13.5 }}>
        <input type="checkbox" checked={val('display') === 'none'} onChange={(e) => set('display', e.target.checked ? 'none' : '')} />
        Hide on {device === 'all' ? 'every device' : device === 'tablet' ? 'tablets and phones' : 'phones'}
      </label>

      <div className="row">
        <button className="btn dark" disabled={busy || !dirty || !sel.key} onClick={onSave}>Save style</button>
        {dirty && <button className="btn ghost" disabled={busy} onClick={() => setDraft({})}>Cancel</button>}
        {hasStyle && <button className="btn ghost danger" disabled={busy} onClick={onClear}>Clear all styles</button>}
      </div>
      <span className="hint">Placeholders show the current value. Leave a box empty to keep it. Changes preview right away; Save adds them to the draft.</span>
    </div>
  );
}
