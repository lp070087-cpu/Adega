'use client';

import { startTransition, useActionState } from 'react';
import { saveFiscalProviderAction } from '@/app/actions/fiscal';

export function FiscalProviderForm({ configured, environment }: { configured: boolean; environment: 'homologacao' | 'producao' }) {
  const [state, action, pending] = useActionState(saveFiscalProviderAction, null);
  return (
    <form action={action} onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); startTransition(() => action(d)); }} className="grid gap-3 sm:grid-cols-2" data-testid="fiscal-provider-form">
      <label><span className="field-label">Provedor</span><input value="Focus NFe" readOnly className="field-input bg-ink-50" /></label>
      <label><span className="field-label">Ambiente</span>
        <select name="environment" defaultValue={environment} className="field-input">
          <option value="homologacao">Homologação (teste, sem valor fiscal)</option>
          <option value="producao">Produção (exige liberação)</option>
        </select>
      </label>
      <label className="sm:col-span-2"><span className="field-label">Token da API do provedor</span><input name="token" type="password" autoComplete="off" placeholder={configured ? '•••••••• (mantido)' : 'Token do painel do provedor'} className="field-input" /></label>
      <p className="text-[0.76rem] text-ink-500 sm:col-span-2">O certificado digital A1, o CSC e a série da NFC-e são cadastrados no painel do provedor, que fala com a SEFAZ. O Del Flash nunca recebe o certificado.</p>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60">{pending ? 'Salvando…' : 'Salvar provedor fiscal'}</button>
        {state && <p role="status" className={`text-[0.8rem] ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</p>}
      </div>
    </form>
  );
}
