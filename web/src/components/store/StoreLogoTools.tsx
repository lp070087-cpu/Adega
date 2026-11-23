'use client';

import { useState } from 'react';
import { uploadStoreLogoAction } from '@/app/actions/store-ops';

export function StoreLogoTools({ url, storeName, disabled, onUpload }: {
  url: string | null; storeName: string; disabled: boolean; onUpload: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(file: File) {
    setError(''); setBusy(true);
    try {
      const form = new FormData(); form.set('file', file);
      const result = await uploadStoreLogoAction(form);
      if (!result.ok) { setError(result.error); return; }
      if (result.data?.url) onUpload(result.data.url);
    } catch {
      setError('Não foi possível enviar a logo. Tente novamente.');
    } finally { setBusy(false); }
  }

  async function exportImage(format: 'png' | 'jpg') {
    if (!url) return;
    setError(''); setBusy(true);
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous'; image.src = url;
      await image.decode();
      const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      if (format === 'jpg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `logo-da-loja.${format}`;
      link.href = canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.94);
      link.click();
    } catch {
      setError('O servidor da imagem não liberou a exportação. Envie o arquivo da logo para exportar.');
    } finally { setBusy(false); }
  }

  function printPdf() {
    if (!url) return;
    setError('');
    const frame = document.createElement('iframe');
    frame.title = 'Exportar logo em PDF';
    frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.append(frame);
    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); setError('Não foi possível preparar a impressão.'); return; }
    const image = doc.createElement('img');
    image.alt = storeName;
    image.style.cssText = 'display:block;max-width:160mm;max-height:220mm;margin:12mm auto;object-fit:contain';
    doc.title = 'Logo da loja';
    doc.body.append(image);
    image.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
    image.onerror = () => { frame.remove(); setError('Não foi possível abrir a logo para impressão.'); };
    frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), { once: true });
    window.setTimeout(() => frame.remove(), 60000);
    image.src = url;
  }

  return <div className="mt-2 space-y-2">
    <label className="grid gap-1 text-xs font-medium text-ink-700">
      Enviar PNG, JPG ou WebP
      <input aria-label="Enviar arquivo de logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || busy} onChange={event => {
        const file = event.target.files?.[0];
        if (file) void upload(file);
        event.target.value = '';
      }} className="max-w-full text-xs file:mr-2 file:rounded-lg file:border file:bg-white file:px-2 file:py-2" />
    </label>
    {url && <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} className="min-h-9 rounded-lg border px-2 text-xs font-semibold" onClick={() => void exportImage('png')}>Baixar PNG</button>
      <button type="button" disabled={busy} className="min-h-9 rounded-lg border px-2 text-xs font-semibold" onClick={() => void exportImage('jpg')}>Baixar JPG</button>
      <button type="button" disabled={busy} className="min-h-9 rounded-lg border px-2 text-xs font-semibold" onClick={printPdf}>Salvar como PDF</button>
    </div>}
    {busy && <p role="status" className="text-xs text-ink-500">Preparando a imagem…</p>}
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
