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
export function FiscalInvoicePanel({ orderId, paid, canCancel, needsCpf, needsPayment, environment }: {
  orderId: string; paid: boolean; canCancel: boolean; needsCpf: boolean; needsPayment: boolean;
  environment: 'homologacao' | 'producao';
}) {
  const [doc, setDoc] = useState<FiscalDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cpf, setCpf] = useState('');
  const [payment, setPayment] = useState('');
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => { void getInvoiceAction({ orderId, environment }).then((r) => (r.ok ? setDoc(r.doc) : setError(r.error))); }, [orderId, environment]);
  const run = (fn: () => Promise<{ ok: true; doc: FiscalDocument | null } | { ok: false; error: string }>) => start(async () => { setError(null); const r = await fn().catch(() => ({ ok: false as const, error: 'Sem resposta do servidor. Consulte o status antes de reenviar.' })); if (r.ok) { setDoc(r.doc); setCancelling(false); } else {
    setError(r.error);
    const saved = await getInvoiceAction({ orderId, environment }).catch(() => null);
    if (saved?.ok) setDoc(saved.doc);
  } });
  const canEmit = !doc || ['erro_autorizacao', 'rejeitado'].includes(doc.status);
  const readyToEmit = paid && (!needsCpf || cpf.replace(/\D/g, '').length === 11) && (!needsPayment || Boolean(payment));
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
      {canEmit && paid && (needsCpf || needsPayment) && <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {needsCpf && <label><span className="field-label">CPF do destinatário</span><input value={cpf} onChange={(event) => setCpf(event.target.value)} maxLength={14} inputMode="numeric" autoComplete="off" className="field-input" /></label>}
        {needsPayment && <label><span className="field-label">Forma confirmada no provedor</span><select value={payment} onChange={(event) => setPayment(event.target.value)} className="field-input">
          <option value="">Selecione</option><option value="PIX">Pix</option><option value="CREDIT_CARD">Cartão de crédito</option><option value="DEBIT_CARD">Cartão de débito</option>
        </select></label>}
      </div>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {canEmit && <button type="button" disabled={pending || !readyToEmit} onClick={() => run(() => emitInvoiceAction({ orderId, cpf: cpf || undefined, payment: payment || undefined }))} className="min-h-10 rounded-lg bg-brand px-3 text-[0.78rem] font-bold text-white disabled:opacity-50" title={paid ? undefined : 'Disponível depois do pagamento confirmado'}>{pending ? 'Enviando…' : doc ? 'Reenviar NFC-e' : 'Emitir NFC-e'}</button>}
        {doc && <button type="button" disabled={pending} onClick={() => run(() => consultInvoiceAction({ orderId, environment }))} className="min-h-10 rounded-lg border border-ink-200 px-3 text-[0.78rem] font-semibold">Consultar</button>}
        {doc?.danfeUrl && <a href={doc.danfeUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-[0.78rem] font-semibold text-brand">DANFE</a>}
        {doc?.xmlUrl && <a href={doc.xmlUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-[0.78rem] font-semibold text-brand">XML</a>}
        {canCancel && doc?.status === 'autorizado' && !cancelling && <button type="button" onClick={() => setCancelling(true)} className="min-h-10 rounded-lg px-3 text-[0.78rem] font-semibold text-danger">Cancelar nota</button>}
      </div>
      {cancelling && (
        <div className="mt-2.5 space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={255} placeholder="Justificativa (mínimo de 15 caracteres)" aria-label="Justificativa do cancelamento" className="field-input text-[0.8rem]" />
          <button type="button" disabled={pending || reason.trim().length < 15} onClick={() => run(() => cancelInvoiceAction({ orderId, reason, environment }))} className="min-h-10 rounded-lg bg-danger px-3 text-[0.78rem] font-bold text-white disabled:opacity-50">Confirmar cancelamento</button>
        </div>
      )}
    </section>
  );
}
