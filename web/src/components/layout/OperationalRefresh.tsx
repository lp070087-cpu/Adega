'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** Controlled refresh: no background queries while hidden or disconnected. */
export function OperationalRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => {
      if (!pending && document.visibilityState === 'visible' && navigator.onLine) {
        startTransition(() => router.refresh());
      }
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('online', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('online', refresh); };
  }, [router, pending]);
  return <p className="text-xs text-ink-500">{pending ? 'Atualizando dados…' : 'Consulta automática a cada 30 segundos com esta tela aberta.'}</p>;
}
