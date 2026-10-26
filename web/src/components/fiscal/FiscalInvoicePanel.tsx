'use client';

import { useEffect, useState, useTransition } from 'react';
import { cancelInvoiceAction, consultInvoiceAction, emitInvoiceAction, getInvoiceAction } from '@/app/actions/fiscal';
import type { FiscalDocument } from '@/lib/fiscal-provider';

const STATUS: Record<FiscalDocument['status'], [string, string]> = {
  autorizado: ['Autorizada', 'bg-success-bg text-success'],
  processando: ['Processando na SEFAZ', 'bg-info-bg text-info'],
  erro_autorizacao: ['Rejeitada pela SEFAZ', 'bg-danger-bg text-danger'],
  rejeitado: ['Recusada', 'bg-danger-bg text-danger'],
  cancelado: ['Cancelada', 'bg-ink-100 text-ink-600'],
};

/** NFC-e do pedido: emitir pelo provedor, consultar, cancelar; mostra chave, protocolo, XML e DANFE devolvidos. */
export function FiscalInvoicePanel({ orderId, paid, environment }: { orderId: string; paid: boolean; environment: 'homologacao' | 'producao' }) {
  const [doc, setDoc] = useState<FiscalDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => { void getInvoiceAction({ orderId }).then((r) => (r.ok ? setDoc(r.doc) : setError(r.error))); }, [orderId]);
  const run = (fn: () => Promise<{ ok: true; doc: FiscalDocument | null } | { ok: false; error: string }>) => start(async () => { setError(null); const r = await fn(); if (r.ok) { setDoc(r.doc); setCancelling(false); } else setError(r.error); });
  const [label, tone] = doc ? STATUS[doc.status] : ['Não emitida', 'bg-ink-100 text-ink-600'];
  return (
    <section className="mb-5 rounded-xl border border-ink-100 p-3" data-testid="fiscal-invoice">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">NFC-e {environment === 'homologacao' && <span className="normal-case text-warn">· homologação (sem valor fiscal)</span>}</h3>
        <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-bold ${tone}`} data-testid="fiscal-invoice-status">{label}</span>
      </div>
      {doc?.chave && <p className="mt-2 break-all font-mono text-[0.7rem] text-ink-700">Chave: {doc.chave}{doc.protocolo ? ` · Protocolo ${doc.protocolo}` : ''}</p>}
      {doc?.message && doc.status !== 'autorizado' && <p className="mt-2 text-[0.76rem] text-ink-600">SEFAZ: {doc.message}</p>}
      {error && <p className="mt-2 text-[0.76rem] text-danger" role="alert">{error}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {(!doc || ['erro_autorizacao', 'rejeitado'].includes(doc.status)) && <button type="button" disabled={pending || !paid} onClick={() => run(() => emitInvoiceAction({ orderId }))} className="min-h-10 rounded-lg bg-brand px-3 text-[0.78rem] font-bold text-white disabled:opacity-50" title={paid ? undefined : 'Disponível depois do pagamento confirmado'}>{pending ? 'Enviando…' : doc ? 'Reenviar NFC-e' : 'Emitir NFC-e'}</button>}
        {doc && <button type="button" disabled={pending} onClick={() => run(() => consultInvoiceAction({ orderId }))} className="min-h-10 rounded-lg border border-ink-200 px-3 text-[0.78rem] font-semibold">Consultar</button>}
        {doc?.danfeUrl && <a href={doc.danfeUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-[0.78rem] font-semibold text-brand">DANFE</a>}
        {doc?.xmlUrl && <a href={doc.xmlUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-[0.78rem] font-semibold text-brand">XML</a>}
        {doc?.status === 'autorizado' && !cancelling && <button type="button" onClick={() => setCancelling(true)} className="min-h-10 rounded-lg px-3 text-[0.78rem] font-semibold text-danger">Cancelar nota</button>}
      </div>
      {cancelling && (
        <div className="mt-2.5 space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={255} placeholder="Justificativa (mínimo de 15 caracteres)" aria-label="Justificativa do cancelamento" className="field-input text-[0.8rem]" />
          <button type="button" disabled={pending || reason.trim().length < 15} onClick={() => run(() => cancelInvoiceAction({ orderId, reason }))} className="min-h-10 rounded-lg bg-danger px-3 text-[0.78rem] font-bold text-white disabled:opacity-50">Confirmar cancelamento</button>
        </div>
      )}
    </section>
  );
}
