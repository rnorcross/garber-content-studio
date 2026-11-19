'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload, uploadPresigned } from '@vercel/blob/client';
import { api } from '@/lib/client';
import { formatBytes } from '@/lib/fragment';

/**
 * Moves a site's own images, share images and video from the app (public/sites/<slug>/) to
 * Vercel Blob. The browser copies each file (same names, under body-shop/<slug>/assets/), then
 * the pages switch to the Blob copies. Edits keep working either way. Switching back is one click.
 */
export default function SiteFilesCard({ slug, files, assetBase }: { slug: string; files: { path: string; size: number }[]; assetBase: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const total = files.reduce((n, f) => n + f.size, 0);

  async function move() {
    setErr('');
    const mode = (await fetch('/api/media?mode=1').then((r) => r.json())).mode;
    if (mode === 'local') { setErr('No Blob store is connected here (local development).'); return; }
    const send = mode === 'blob-presigned' ? uploadPresigned : upload;
    let base = '';
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setBusy(`Copying ${i + 1} of ${files.length}: ${f.path}`);
        const res = await fetch(`/sites/${slug}/${f.path}`);
        if (!res.ok) throw new Error(`Couldn’t read ${f.path} (${res.status})`);
        const blob = await res.blob();
        const out = await send(`body-shop/${slug}/assets/${f.path}`, blob, {
          access: 'public', handleUploadUrl: '/api/media/upload', contentType: blob.type || undefined, multipart: blob.size > 20 * 1024 * 1024,
        });
        base = out.url.slice(0, out.url.length - f.path.length - 1);
      }
      setBusy('Switching the pages to the Blob copies…');
      await api(`/api/body-shop/sites/${slug}`, { action: 'asset-base', base });
      router.refresh();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(''); }
  }

  return (
    <div className="card card-pad stack" style={{ gridColumn: '1 / -1' }}>
      <div>
        <div className="bs-card-title" style={{ marginTop: 0 }}>Site files {assetBase ? <span className="chip ok">On Blob</span> : <span className="chip">In the app</span>}</div>
        <p className="sub" style={{ fontSize: 13.5 }}>
          This site’s own images, share images and video: {files.length} files, {formatBytes(total)}.{' '}
          {assetBase
            ? 'Pages load them from Vercel Blob. The copies in the code can be removed once you’ve checked the site.'
            : 'They’re stored in the code, which makes every deploy heavier. Moving them to Vercel Blob keeps the repo small as shops are added.'}
        </p>
      </div>
      <div className="row">
        {!assetBase && <button className="btn dark" disabled={!!busy || !files.length} onClick={move}>Move to Blob</button>}
        {assetBase && <button className="btn ghost" disabled={!!busy} onClick={async () => {
          if (!confirm('Load this site’s files from the app again?')) return;
          await api(`/api/body-shop/sites/${slug}`, { action: 'asset-base', base: null }).then(() => router.refresh(), (e) => setErr(e.message));
        }}>Switch back to the app’s copies</button>}
      </div>
      {busy && <p className="sub" style={{ fontSize: 13 }}>{busy}</p>}
      {err && <p className="bs-err">{err}</p>}
    </div>
  );
}
