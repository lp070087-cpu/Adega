'use client';
import { useState } from 'react';
export function DriverInstallShare() {
  const [message, setMessage] = useState('');
  async function copy() {
    const url = `${window.location.origin}/entregador/instalar`;
    try { await navigator.clipboard.writeText(url); setMessage('Link copiado. Envie ao entregador pelo canal de sua preferência.'); }
    catch { setMessage(`Copie este endereço: ${url}`); }
  }
  return <div><button type="button" onClick={copy} className="min-h-11 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold">Copiar link de instalação</button>{message && <p role="status" className="mt-2 break-all text-sm text-ink-600">{message}</p>}</div>;
}
