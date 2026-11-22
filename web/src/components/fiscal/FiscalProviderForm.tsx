'use client';

import { useActionState, useState, useTransition } from 'react';
import { saveFiscalProviderAction, testFiscalProviderAction } from '@/app/actions/fiscal';
import type { FiscalEnvironment } from '@/lib/fiscal-provider';

export function FiscalProviderForm({ initialEnvironment, configured, canActivate, secureStorage }: {
  initialEnvironment: FiscalEnvironment;
  configured: Record<FiscalEnvironment, boolean>;
  canActivate: boolean;
  secureStorage: boolean;
}) {
  const [environment, setEnvironment] = useState(initialEnvironment);
  const [state, action, pending] = useActionState(saveFiscalProviderAction, null);
  const [testing, startTest] = useTransition();
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const busy = pending || testing;
  function runTest() {
    setTest(null);
    startTest(async () => {
      const result = await testFiscalProviderAction(environment).catch(() => ({ ok: false, message: 'Sem resposta do servidor. Tente novamente.' }));
      setTest(result);
    });
  }
  return (
    <form action={action} onSubmit={() => setTest(null)} className="grid gap-3 sm:grid-cols-2" data-testid="fiscal-provider-form">
      <label><span className="field-label">Provedor</span><input value="Focus NFe" readOnly className="field-input bg-ink-50" /></label>
      <label><span className="field-label">Ambiente</span>
        <select name="environment" value={environment} onChange={(event) => {
          setEnvironment(event.target.value === 'producao' ? 'producao' : 'homologacao');
          setTest(null);
        }} disabled={busy} className="field-input">
          <option value="homologacao">Homologação · sem valor fiscal</option>
          <option value="producao">Produção · emissão oficial</option>
        </select>
      </label>
      <label className="sm:col-span-2"><span className="field-label">Token da API deste ambiente</span>
        <input key={environment} name="token" type="password" maxLength={256} autoComplete="new-password"
          placeholder={configured[environment] ? 'Deixe em branco para manter o token salvo' : 'Copie o token da Focus NFe'} className="field-input" />
      </label>
      <p className="text-sm text-ink-600 sm:col-span-2">Cadastre o certificado A1, o CSC e a série no painel da Focus NFe. Cada ambiente tem sua própria configuração.</p>
      {!secureStorage && <p className="text-sm text-danger sm:col-span-2">O servidor precisa da chave de criptografia para salvar tokens.</p>}
      {environment === 'producao' && (
        <label className="flex gap-2 text-sm text-ink-700 sm:col-span-2">
          <input type="checkbox" name="activate" disabled={!canActivate || busy} />
          Ativar emissão oficial neste estabelecimento, já credenciado em produção
        </label>
      )}
      {environment === 'producao' && !canActivate && <p className="text-sm text-ink-600 sm:col-span-2">A ativação depende de uma NFC-e autorizada em homologação e da liberação do Del Flash.</p>}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy || !secureStorage} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:opacity-60">{pending ? 'Salvando…' : 'Salvar provedor fiscal'}</button>
        <button type="button" onClick={runTest} disabled={busy || !configured[environment]} className="min-h-11 rounded-xl border border-ink-200 px-5 text-sm font-bold text-ink-800 disabled:opacity-60">{testing ? 'Testando…' : 'Testar conexão'}</button>
        {state && <p role="status" className={state.ok ? 'text-sm text-success' : 'text-sm text-danger'}>{state.message}</p>}
        {test && <p role="status" data-testid="fiscal-provider-test" className={test.ok ? 'text-sm text-success' : 'text-sm text-danger'}>{test.message}</p>}
      </div>
    </form>
  );
}
