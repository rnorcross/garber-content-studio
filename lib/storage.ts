import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { del } from '@vercel/blob';

/**
 * Where uploaded images live.
 *  - On Vercel: Vercel Blob. Newer stores authenticate with OIDC + BLOB_STORE_ID; older ones
 *    with BLOB_READ_WRITE_TOKEN. Both are added when you connect a Blob store.
 *    Files are durable, served from a global CDN, and get permanent public URLs.
 *  - Local development without a token: files are written under .data/uploads and served
 *    by /api/media/file/… so the app works offline.
 */
export const hasBlob = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
/** 'blob-presigned' = newer stores (OIDC + BLOB_STORE_ID); 'blob' = read-write token; 'local' = dev disk. */
export const storageMode = () =>
  (process.env.BLOB_STORE_ID ? 'blob-presigned' : process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local') as 'blob' | 'blob-presigned' | 'local';

const LOCAL_ROOT = path.join(process.cwd(), '.data', 'uploads');

export function safeName(name: string) {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const base = path.basename(name, path.extname(name)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';
  return `${base}${ext}`;
}

/** Local mode only: saves a file and returns its URL and pathname. */
export async function saveLocal(folder: string, filename: string, data: Buffer) {
  const rand = Math.random().toString(36).slice(2, 8);
  const rel = path.posix.join(folder, `${path.basename(filename, path.extname(filename))}-${rand}${path.extname(filename)}`);
  const full = path.join(LOCAL_ROOT, rel);
  if (!full.startsWith(LOCAL_ROOT)) throw new Error('Bad path');
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return { url: `/api/media/file/${rel}`, pathname: rel };
}

export function localPath(rel: string) {
  const full = path.join(LOCAL_ROOT, rel);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error('Bad path');
  return full;
}

export async function removeStored(url: string, pathname: string) {
  if (url.startsWith('/api/media/file/')) {
    await unlink(localPath(pathname)).catch(() => {});
  } else if (hasBlob()) {
    await del(url);
  }
}

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'video/mp4', 'video/webm', 'application/pdf'];
export const MAX_BYTES = 250 * 1024 * 1024;
