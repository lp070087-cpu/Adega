'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLoyaltyEnabledAction, type GrowthActionState } from '@/app/actions/growth';
import { Button } from '@/components/ui';

export function LoyaltyToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<GrowthActionState | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 pb-4">
      <span className="text-sm font-medium">{enabled ? 'Programa ativo' : 'Programa desativado'}</span>
      <Button variant={enabled ? 'secondary' : 'primary'} loading={pending} onClick={() => {
        start(async () => {
          const next = await setLoyaltyEnabledAction(!enabled).catch(() => ({ ok: false, message: 'Não foi possível alterar o programa. Tente novamente.' }));
          setResult(next);
          if (next.ok) router.refresh();
        });
      }}>{enabled ? 'Desativar programa de pontos' : 'Ativar programa de pontos'}</Button>
      {result && <p role="status" className={result.ok ? 'text-sm text-success' : 'text-sm text-danger'}>{result.message}</p>}
    </div>
  );
}
