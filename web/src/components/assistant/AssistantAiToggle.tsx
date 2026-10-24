'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assistantSettings } from '@/app/actions/assistant';
import { Alert, Button } from '@/components/ui';

/** Liga/desliga a IA desta loja. Só liga com conexão oficial e serviço de IA verificados. */
export function AssistantAiToggle({ enabled, canEnable }: { enabled: boolean; canEnable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button disabled={pending || (!enabled && !canEnable)} onClick={() => start(async () => { const result = await assistantSettings({ enabled: !enabled }); setMessage(result.ok ? (enabled ? 'IA desativada.' : 'IA ativada.') : 'error' in result ? result.error ?? null : null); router.refresh(); })} className="min-h-11">
        {enabled ? 'Desativar IA' : 'Ativar IA'}
      </Button>
      {!enabled && !canEnable && <p className="text-[0.76rem] text-ink-500">Disponível depois que o número oficial e o serviço de IA estiverem conectados e verificados.</p>}
      {message && <Alert tone="info">{message}</Alert>}
    </div>
  );
}
