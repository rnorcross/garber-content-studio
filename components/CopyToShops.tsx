'use client';
import { useState } from 'react';

/** "Copy to other shops": pick sites, then run `onCopy` with their slugs. */
export default function CopyToShops({ others, onCopy, label = 'Copy to other shops' }: {
  others: { slug: string; name: string }[]; onCopy: (slugs: string[]) => Promise<string | void>; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <button className="btn sm ghost" onClick={() => { setOpen(true); setMsg(''); }}>{label}</button>;
  return (
    <div className="bs-copy">
      {others.length === 0
        ? <span className="sub" style={{ fontSize: 12.5 }}>Only one shop is in the studio so far. Other shops show up here once they’re added.</span>
        : (
          <>
            <label className="row" style={{ gap: 6, fontSize: 13, fontWeight: 650 }}>
              <input type="checkbox" checked={pick.length === others.length} onChange={(e) => setPick(e.target.checked ? others.map((o) => o.slug) : [])} /> All shops
            </label>
            {others.map((o) => (
              <label key={o.slug} className="row" style={{ gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={pick.includes(o.slug)} onChange={(e) => setPick(e.target.checked ? [...pick, o.slug] : pick.filter((x) => x !== o.slug))} /> {o.name}
              </label>
            ))}
            <div className="row">
              <button className="btn sm dark" disabled={!pick.length || busy} onClick={async () => {
                setBusy(true);
                try { setMsg((await onCopy(pick)) || `Copied to ${pick.length} ${pick.length === 1 ? 'shop' : 'shops'} as a draft.`); setPick([]); }
                catch (e: any) { setMsg(e.message); }
                finally { setBusy(false); }
              }}>Copy as draft</button>
            </div>
          </>
        )}
      <div className="row"><button className="btn sm ghost" onClick={() => setOpen(false)}>Close</button>{msg && <span className="sub" style={{ fontSize: 12.5 }}>{msg}</span>}</div>
    </div>
  );
}
