'use client';

import { useActionState } from 'react';
import { startSaasCheckoutAction } from '@/app/actions/saas-payments';
import { Button } from '@/components/ui';

export function SaasCheckoutButton({ planId }: { planId: string }) {
  const [state, action, pending] = useActionState(startSaasCheckoutAction, null);
  return <form action={action} className="mt-4 space-y-2">
    <input type="hidden" name="planId" value={planId} />
    <Button type="submit" loading={pending}>Pagar com Pix ou crédito</Button>
    {state && <p role="alert" className="text-sm text-danger">{state.message}</p>}
  </form>;
}
