'use client';
import { useState, useTransition } from 'react';
import type { IntegrationProvider } from '@prisma/client';
import { saveIntegrationCredentialAction, setIntegrationStatusAction } from '@/app/actions/integrations';
export function IntegrationControls({ organizationId, provider }: { organizationId: string; provider: IntegrationProvider }) {
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  return <details className="mt-4 border-t border-slate-200 pt-4 text-sm">
    <summary className="cursor-pointer font-medium text-slate-700">Configurações administrativas</summary>
    <form className="mt-4 grid gap-3" action={(form) => startTransition(async () => {
      const result = await setIntegrationStatusAction({ organizationId, provider, status: String(form.get('status')) as 'PENDING', reason: String(form.get('reason') ?? ''), confirmation: String(form.get('confirmation') ?? '') });
      setMessage(result.ok ? 'Configuração atualizada e registrada na auditoria.' : result.error);
    })}>
      <label>Situação<select name="status" className={field}><option value="PENDING">Pendente de autorização</option><option value="ERROR">Requer atenção</option><option value="DISCONNECTED">Desconectada</option></select></label>
      <label>Motivo<input name="reason" required minLength={5} maxLength={300} className={field} /></label>
      <label className="flex gap-2"><input type="checkbox" name="confirmation" value="CONFIRMAR" required />Confirmo a alteração deste estabelecimento.</label>
      <button className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50" disabled={pending}>Salvar situação</button>
    </form>
    <details className="mt-4"><summary className="cursor-pointer text-slate-500">Adicionar credencial protegida</summary>
      <p className="mt-3 text-xs leading-5 text-slate-500">Disponível somente quando o armazenamento seguro está configurado. Credenciais existentes não são exibidas. Salvar uma credencial não comprova conexão ao provedor.</p>
      <form className="mt-3 grid gap-3" action={(form) => startTransition(async () => {
        form.set('organizationId', organizationId); form.set('provider', provider);
        const result = await saveIntegrationCredentialAction(form);
        setMessage(result.ok ? 'Credencial protegida salva. A autorização do provedor permanece pendente.' : result.error);
      })}>
        <label>Campos da credencial (JSON)<textarea name="payload" required maxLength={40000} autoComplete="off" spellCheck={false} className={field} /></label>
        <label>Motivo<input name="reason" required minLength={5} maxLength={300} className={field} /></label>
        <label className="flex gap-2"><input type="checkbox" name="confirmation" value="CONFIRMAR" required />Confirmo o armazenamento protegido para este estabelecimento.</label>
        <button disabled={pending} className="rounded-lg border border-slate-300 px-4 py-2 font-medium disabled:opacity-50">Salvar credencial</button>
      </form>
    </details>
    {message && <p role="status" className="mt-3 leading-6 text-slate-600">{message}</p>}
  </details>;
}
