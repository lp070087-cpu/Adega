'use client';
import { useState, useTransition } from 'react';
import { requestSubscriptionPlanAction } from '@/app/actions/subscription-request';
import { Button } from '@/components/ui';
export function PlanRequest({ planId }: { planId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  return <div className="mt-5 space-y-3 text-sm">
    <label className="flex items-start gap-2 text-ink-600"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />Solicitar contato para contratar ou alterar este plano.</label>
    <Button disabled={!confirmed || pending} onClick={() => startTransition(async () => {
      const result = await requestSubscriptionPlanAction({ planId, confirmed });
      setMessage(result.ok ? 'Solicitação enviada. A administração confirmará as condições antes da contratação.' : result.error ?? 'Não foi possível enviar.');
    })}>Solicitar plano</Button>
    {message && <p role="status" className="leading-6">{message}</p>}
  </div>;
}
