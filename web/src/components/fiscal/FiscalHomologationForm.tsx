'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runFiscalTestAction } from '@/app/actions/fiscal';
import type { FiscalDocument } from '@/lib/fiscal-provider';

const statuses: Record<FiscalDocument['status'], string> = {
  processando: 'Em processamento', autorizado: 'Autorizada em homologação',
  erro_autorizacao: 'Rejeitada pela SEFAZ', rejeitado: 'Recusada', cancelado: 'Cancelada',
};

export function FiscalHomologationForm({ products, lastTest, ready }: {
  products: Array<{ id: string; name: string }>;
  lastTest: FiscalDocument | null;
  ready: boolean;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(command: 'emit' | 'consult' | 'cancel') {
    setError(null);
    start(async () => {
      const result = await runFiscalTestAction({ command, productId, reason }).catch(() => null);
      if (!result?.ok) setError(result?.error ?? 'Sem resposta do servidor. Consulte a nota antes de reenviar.');
      if (result?.ok && command === 'cancel') setReason('');
      router.refresh();
    });
  }

  const button = 'min-h-11 rounded-xl border border-ink-200 px-4 text-sm font-semibold text-ink-800 disabled:opacity-60';
  return (
    <div className="space-y-3">
      <label className="block"><span className="field-label">Produto para o teste</span>
        <select value={productId} onChange={(event) => setProductId(event.target.value)} disabled={pending || !products.length} className="field-input">
          <option value="">{products.length ? 'Selecione um produto' : 'Salve a tributação de um produto ativo primeiro'}</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => run('emit')} disabled={!ready || !productId || pending || lastTest?.status === 'processando'} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-60">Emitir NFC-e de teste</button>
        {lastTest && <button type="button" onClick={() => run('consult')} disabled={pending} className={button}>Consultar teste</button>}
      </div>
      {pending && <p role="status" className="text-sm text-ink-600">Aguardando a resposta da Focus NFe…</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {lastTest && (
        <div className="space-y-2 rounded-xl bg-ink-50 p-3 text-sm">
          <p className="font-semibold text-ink-900">{statuses[lastTest.status]}</p>
          {lastTest.message && <p className="text-ink-700">{lastTest.message}</p>}
          {lastTest.chave && <p className="break-all text-ink-700">Chave {lastTest.chave}</p>}
          {lastTest.protocolo && <p className="break-all text-ink-700">Protocolo {lastTest.protocolo}</p>}
          <div className="flex flex-wrap gap-3">
            {lastTest.xmlUrl && <a className="text-brand underline" href={lastTest.xmlUrl} target="_blank" rel="noreferrer">XML de teste</a>}
            {lastTest.danfeUrl && <a className="text-brand underline" href={lastTest.danfeUrl} target="_blank" rel="noreferrer">DANFE de teste</a>}
          </div>
          {lastTest.status === 'autorizado' && (
            <details>
              <summary className="cursor-pointer font-semibold">Testar cancelamento</summary>
              <div className="mt-2 space-y-2">
                <label className="block"><span className="field-label">Justificativa</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} rows={2} className="field-input" /></label>
                <button type="button" onClick={() => run('cancel')} disabled={pending || reason.trim().length < 15} className={button}>Cancelar NFC-e de teste</button>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
