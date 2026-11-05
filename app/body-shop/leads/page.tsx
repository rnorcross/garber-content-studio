import { requireUser } from '@/lib/auth';
import TopBar from '@/components/TopBar';

export default async function Leads() {
  const user = await requireUser();
  return (
    <>
      <TopBar user={user} on="bs-leads" />
      <main className="wrap">
        <div className="eyebrow">Body Shop Websites</div>
        <h1 className="title">Leads</h1>
        <p className="sub" style={{ maxWidth: 640 }}>
          Estimate requests and contact messages from every body shop site will land here, with who they were
          routed to and how fast someone responded. The forms will post to the functions app
          (collision-center-leads and collision-center-estimates), which keeps the log and handles routing.
        </p>
        <div className="card card-pad" style={{ marginTop: 20, maxWidth: 640 }}>
          <div className="section-title" style={{ marginTop: 0 }}>Not connected yet</div>
          <p className="sub">The Saginaw forms don’t submit anywhere yet. Connecting them needs access to the functions app’s code.</p>
        </div>
      </main>
    </>
  );
}
