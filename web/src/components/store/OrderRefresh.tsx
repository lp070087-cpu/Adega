'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function OrderRefresh({ terminal }: { terminal: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (terminal) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) router.refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [router, terminal]);
  return <div className="space-y-2 text-sm text-ink-500">
    {!terminal && <p>O status é consultado a cada 15 segundos enquanto esta página está aberta.</p>}
    <button disabled={pending} className="font-semibold underline" onClick={() => startTransition(() => router.refresh())}>
      {pending ? 'Atualizando…' : 'Atualizar status'}
    </button>
  </div>;
}