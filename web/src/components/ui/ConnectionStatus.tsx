'use client';
import { useEffect, useState } from 'react';

/**
 * Tells the user when the device has no connection. Nothing is queued
 * offline: orders and payments always need the server's confirmation.
 */
export function ConnectionStatus() {
  const [state, setState] = useState<'online' | 'offline' | 'restored'>('online');
  useEffect(() => {
    let timer: number | undefined;
    const offline = () => { window.clearTimeout(timer); setState('offline'); };
    const online = () => { setState((current) => (current === 'offline' ? 'restored' : 'online')); timer = window.setTimeout(() => setState('online'), 3000); };
    if (!navigator.onLine) offline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => { window.clearTimeout(timer); window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  }, []);
  if (state === 'online') return null;
  return (
    <div className="connection-status" role="status" aria-live="polite" data-state={state === 'restored' ? 'online' : 'offline'}>
      {state === 'offline' ? 'Sem conexão com a internet. Pedidos e alterações só são enviados quando a conexão voltar e você tentar de novo.' : 'Conexão restabelecida.'}
    </div>
  );
}
