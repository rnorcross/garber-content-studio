'use client';
import { cleanModelHtml } from './fragment';

export async function api<T = any>(url: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d as T;
}

/** Streams HTML from /api/generate, reporting progress; resolves to cleaned HTML. */
export async function streamHtml(body: unknown, onChunk: (soFar: string) => void, signal?: AbortSignal) {
  const r = await fetch('/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  if (!r.ok || !r.body) throw new Error((await r.text().catch(() => '')) || `Generation failed (${r.status})`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    onChunk(text);
  }
  const err = text.match(/<!--GCS_ERROR:([\s\S]*?)-->/);
  if (err) throw new Error(err[1]);
  const html = cleanModelHtml(text);
  if (!html) throw new Error('Claude returned no HTML');
  return html;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  }
}

export function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
