'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Atualização automática: consulta uma versão leve a cada `intervalMs` e só
 * recarrega os dados da tela quando ela muda. Também confere ao voltar para
 * a aba, ao reconectar e ao focar a janela. Uma consulta por vez; nada roda
 * com a aba escondida ou sem internet.
 */
export function useLiveRefresh(url: string, intervalMs = 5000) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [lastSync, setLastSync] = useState<number | null>(null);
  const version = useRef<string | null>(null);
  const inFlight = useRef(false);
  const refreshingRef = useRef(false);
  refreshingRef.current = refreshing;

  useEffect(() => {
    let disposed = false;
    const check = async () => {
      if (disposed || inFlight.current || refreshingRef.current || document.visibilityState !== 'visible' || !navigator.onLine) return;
      inFlight.current = true;
      try {
        const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const { v } = (await response.json()) as { v?: string };
        if (disposed || typeof v !== 'string') return;
        if (version.current !== null && version.current !== v) startTransition(() => router.refresh());
        version.current = v;
        setLastSync(Date.now());
      } catch { /* sem conexão: tenta de novo no próximo ciclo */ } finally { inFlight.current = false; }
    };
    void check();
    const timer = window.setInterval(check, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); window.removeEventListener('online', onVisible); };
  }, [url, intervalMs, router]);

  return { refreshing, lastSync };
}

export function LiveRefresh({ url, intervalMs }: { url: string; intervalMs?: number }) {
  const { refreshing } = useLiveRefresh(url, intervalMs);
  return <p className="text-xs text-ink-500" role="status">{refreshing ? 'Atualizando pedidos…' : 'Atualização automática ativa: novos pedidos e mudanças aparecem sozinhos.'}</p>;
}
