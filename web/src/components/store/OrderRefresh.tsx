'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps the tracker in sync with Order.status as written by the panel,
 * dispatch and the driver app. With `statusUrl` + `version` it polls a tiny
 * JSON probe and only re-renders when the status really changed (cheap on
 * 3G); if a soft refresh does not land, the next tick reloads the page.
 * Without them it falls back to refreshing the page periodically.
 * Polls only while the tab is visible and online.
 */
export function OrderRefresh({ terminal, interval = 10000, statusUrl, version }: { terminal: boolean; interval?: number; statusUrl?: string; version?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const staleSince = useRef<number | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    staleSince.current = null;
  }, [version]);

  useEffect(() => {
    if (terminal) return;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || busy.current) return;
      if (!statusUrl || !version) {
        startTransition(() => router.refresh());
        setCheckedAt(new Date());
        return;
      }
      busy.current = true;
      try {
        const response = await fetch(statusUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { version?: string };
        setFailed(false);
        setCheckedAt(new Date());
        if (data.version && data.version !== version) {
          if (staleSince.current && Date.now() - staleSince.current > 2000) window.location.reload();
          else {
            staleSince.current ??= Date.now();
            startTransition(() => router.refresh());
            // A soft refresh can be dropped mid-flight; re-check soon instead of waiting a full interval.
            window.setTimeout(() => void refresh(), 2500);
          }
        }
      } catch {
        setFailed(true);
      } finally {
        busy.current = false;
      }
    };
    const timer = window.setInterval(refresh, interval);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
    };
  }, [router, terminal, interval, statusUrl, version]);

  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
    {!terminal && <p aria-live="polite">{failed ? 'Não foi possível atualizar agora. Tentaremos novamente em instantes.' : `Atualização automática a cada ${Math.round(interval / 1000)} segundos${checkedAt ? ` · última às ${checkedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}.`}</p>}
    <button type="button" disabled={pending} className="min-h-10 font-semibold underline" onClick={() => { startTransition(() => router.refresh()); setCheckedAt(new Date()); }}>
      {pending ? 'Atualizando…' : 'Atualizar agora'}
    </button>
  </div>;
}
