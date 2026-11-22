'use client';

import { useActionState } from 'react';
import { saveSaasPaymentAction } from '@/app/actions/saas-payments';
import { Button } from '@/components/ui';

export function SaasPaymentSetup({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(saveSaasPaymentAction, null);
  return <form action={action} className="space-y-3">
    <label className="block">API Key do Checkout Integrado
      <input name="apiKey" type="password" autoComplete="new-password" maxLength={256} required className="field-input" placeholder={configured ? 'Informe outra chave para substituir' : 'inchk_…'} />
    </label>
    <Button type="submit" loading={pending}>Validar e salvar chave</Button>
    {state && <p role="status">{state.message}</p>}
  </form>;
}
