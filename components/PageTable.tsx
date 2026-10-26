import Link from 'next/link';

export type PageRow = {
  id: number; title: string; page_type: string; status: string; current_version: number | null;
  live_version: number | null; live_url: string | null; updated_at: string; dealership: string | null; dslug: string | null;
  template: string | null; live_marked_at?: string | null; live_by?: string | null;
};

export function statusChip(p: Pick<PageRow, 'status' | 'current_version' | 'live_version'>) {
  if (p.status === 'archived') return <span className="chip">Archived</span>;
  if (!p.live_version) return <span className="chip">Draft</span>;
  if (p.current_version !== p.live_version)
    return <span className="chip warn" title={`Live site has v${p.live_version}; latest is v${p.current_version}`}>Re-paste needed</span>;
  return <span className="chip ok">Live · current</span>;
}

const when = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function PageTable({ rows, showDealer = true }: { rows: PageRow[]; showDealer?: boolean }) {
  if (!rows.length) return <div className="card empty">No pages here yet.</div>;
  return (
    <div className="card table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Page</th>{showDealer && <th>Dealership</th>}<th>Template</th><th>Status</th><th>Version</th><th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><Link className="ptitle" href={`/p/${p.id}`}>{p.title}</Link></td>
              {showDealer && <td className="small">{p.dslug ? <Link href={`/d/${p.dslug}`}>{p.dealership}</Link> : <span className="muted">Group</span>}</td>}
              <td className="small muted">{p.template ?? 'Custom page'}</td>
              <td>{statusChip(p)}{p.live_marked_at && <div className="small muted" style={{ marginTop: 3 }}>{p.live_by ? `${p.live_by}, ` : ''}{new Date(p.live_marked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}</td>
              <td className="small">v{p.current_version ?? '–'}{p.live_version ? <span className="muted"> · live v{p.live_version}</span> : null}</td>
              <td className="small muted">{when(p.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
