'use client';
import { useState } from 'react';
export function DriverInstallShare({ storeSlug }: { storeSlug?: string }) {
  const [message, setMessage] = useState('');
  async function copy(invitation = false) {
    const url = `${window.location.origin}${invitation && storeSlug ? `/entregador/convite/${encodeURIComponent(storeSlug)}` : '/entregador/instalar'}`;
    try { await navigator.clipboard.writeText(url); setMessage(invitation ? 'Link da loja copiado. Somente entregadores previamente convidados e com e-mail verificado poderão ativar o acesso.' : 'Link copiado. Envie ao entregador pelo canal de sua preferência.'); }
    catch { setMessage(`Copie este endereço: ${url}`); }
  }
  return <div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => copy()} className="min-h-11 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold">Copiar link de instalação</button>{storeSlug && <button type="button" onClick={() => copy(true)} className="min-h-11 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold">Copiar convite de entregador da loja</button>}</div>{message && <p role="status" className="mt-2 break-all text-sm text-ink-600">{message}</p>}</div>;
}
