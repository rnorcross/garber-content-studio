'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { previewDoc } from '@/lib/fragment';

export type Device = 'desktop' | 'tablet' | 'phone';
const WIDTHS: Record<Device, number> = { desktop: 1280, tablet: 820, phone: 390 };

export type PreviewHandle = {
  /** Current HTML of the preview body — reflects edits made in text-edit mode. */
  read(): string | null;
};

type Props = { html: string; device: Device; editing?: boolean; onDirty?: () => void };

/**
 * Renders a fragment in an iframe. In editing mode the body is contentEditable so the
 * team can fix copy in place; read() returns the edited markup.
 */
const Preview = forwardRef<PreviewHandle, Props>(function Preview({ html, device, editing = false, onDirty }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const width = WIDTHS[device];

  useImperativeHandle(ref, () => ({
    read() {
      const doc = frame.current?.contentDocument;
      if (!doc?.body) return null;
      const clone = doc.body.cloneNode(true) as HTMLElement;
      clone.removeAttribute('contenteditable');
      clone.removeAttribute('spellcheck');
      clone.querySelectorAll('[data-gcs-tmp]').forEach((n) => n.remove());
      return clone.innerHTML.trim();
    },
  }));

  // fit the chosen width into the available space
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, (el.clientWidth - 32) / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.contentEditable = editing ? 'true' : 'false';
    doc.body.spellcheck = editing;
  }, [editing, html]);

  function onLoad() {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    // Links shouldn't navigate while editing.
    doc.addEventListener('click', (e) => {
      if (doc.body.isContentEditable && (e.target as HTMLElement).closest('a')) e.preventDefault();
    });
    doc.body.addEventListener('input', () => onDirty?.());
    doc.body.contentEditable = editing ? 'true' : 'false';
  }

  return (
    <div ref={host} className={`frame-host${editing ? ' editing' : ''}`}>
      <div style={{ width: width * scale, height: 'max(520px, calc(100vh - 260px))', flex: '0 0 auto', overflow: 'hidden' }}>
        <iframe
          ref={frame}
          title="Page preview"
          srcDoc={previewDoc(html)}
          onLoad={onLoad}
          sandbox="allow-scripts allow-same-origin allow-popups"
          style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left', height: `calc(max(520px, 100vh - 260px) / ${scale})` }}
        />
      </div>
    </div>
  );
});

export default Preview;
