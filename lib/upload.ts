'use client';
import { upload, uploadPresigned } from '@vercel/blob/client';

export type Media = {
  id: number; url: string; pathname: string; filename: string; content_type: string | null; size: number | null;
  width: number | null; height: number | null; alt: string | null; dealership_id: number | null;
  dealership?: string | null; uploaded_by_name?: string | null; created_at: string;
};

const MAX_EDGE = 2400; // photos larger than this are scaled down before upload

let mode: Promise<'blob' | 'blob-presigned' | 'local'> | null = null;
function storageMode() {
  mode ??= fetch('/api/media?mode=1').then((r) => r.json()).then((d) => d.mode);
  return mode;
}

async function dimensions(file: Blob) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return { width: null, height: null, bitmap: null };
  try {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, bitmap };
  } catch {
    return { width: null, height: null, bitmap: null };
  }
}

/** Scales very large JPEG/PNG/WebP photos down to MAX_EDGE on their long side. */
async function shrink(file: File): Promise<{ file: File; width: number | null; height: number | null }> {
  const { width, height, bitmap } = await dimensions(file);
  if (!bitmap || !width || !height || !/image\/(jpeg|png|webp)/.test(file.type) || Math.max(width, height) <= MAX_EDGE) {
    bitmap?.close();
    return { file, width, height };
  }
  const k = MAX_EDGE / Math.max(width, height);
  const w = Math.round(width * k), h = Math.round(height * k);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const out = await canvas.convertToBlob({ type: file.type, quality: 0.86 });
  if (out.size >= file.size) return { file, width, height };
  return { file: new File([out], file.name, { type: file.type }), width: w, height: h };
}

const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '') || 'file';

/** Uploads a file to the media library and returns its record. */
export async function uploadMedia(
  input: File,
  opts: { dealershipId?: number | null; dealerSlug?: string | null; alt?: string; onProgress?: (pct: number) => void } = {},
): Promise<Media> {
  const { file, width, height } = await shrink(input);
  const folder = opts.dealerSlug ? `dealers/${opts.dealerSlug}` : 'group';

  if ((await storageMode()) === 'local') {
    const form = new FormData();
    form.set('file', file);
    form.set('folder', folder);
    if (opts.dealershipId) form.set('dealershipId', String(opts.dealershipId));
    if (width) form.set('width', String(width));
    if (height) form.set('height', String(height));
    if (opts.alt) form.set('alt', opts.alt);
    const r = await fetch('/api/media/local', { method: 'POST', body: form });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Upload failed');
    opts.onProgress?.(100);
    return d;
  }

  const send = (await storageMode()) === 'blob-presigned' ? uploadPresigned : upload;
  const blob = await send(`${folder}/${safe(file.name)}`, file, {
    access: 'public',
    handleUploadUrl: '/api/media/upload',
    contentType: file.type,
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: (e) => opts.onProgress?.(Math.round(e.percentage)),
  });
  const r = await fetch('/api/media', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: blob.url, pathname: blob.pathname, filename: file.name, contentType: file.type,
      size: file.size, width, height, alt: opts.alt || null, dealershipId: opts.dealershipId ?? null }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Upload failed');
  return d;
}

/** Absolute URL for pasting into a dealer site (local-dev URLs are relative). */
export const absolute = (url: string) => (url.startsWith('/') && typeof location !== 'undefined' ? location.origin + url : url);
