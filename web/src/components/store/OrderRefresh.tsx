'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Re-renders the server page so the tracker always reflects Order.status as
 * written by the panel, dispatch and the driver app. Polls only while the
 * tab is visible and online; refreshes immediately when the tab regains focus.
 */
export function OrderRefresh({ terminal, interval = 10000 }: { terminal: boolean; interval?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (terminal) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      startTransition(() => router.refresh());
      setCheckedAt(new Date());
    };
    const timer = window.setInterval(refresh, interval);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [router, terminal, interval]);
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
    {!terminal && <p>Atualização automática a cada {Math.round(interval / 1000)} segundos{checkedAt ? ` · última às ${checkedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}.</p>}
    <button type="button" disabled={pending} className="min-h-10 font-semibold underline" onClick={() => { startTransition(() => router.refresh()); setCheckedAt(new Date()); }}>
      {pending ? 'Atualizando…' : 'Atualizar agora'}
    </button>
  </div>;
}
