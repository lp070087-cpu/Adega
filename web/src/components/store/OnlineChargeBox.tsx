'use client';

/** Cobrança online do pedido: QR/copia e cola do Pix ou link da página segura. */
export function OnlineChargeBox({ charge, copied, onCopy }: { charge: { invoiceUrl: string | null; pixPayload: string | null; pixImage: string | null; billingType: string }; copied?: boolean; onCopy?: () => void }) {
  return (
    <div className="rounded border-2 border-brand/30 bg-brand-soft px-4 py-3 text-[0.84rem] text-ink-800" data-testid="online-charge">
      <p className="font-bold">{charge.billingType === 'PIX' ? 'Pague com Pix para confirmar' : 'Pague com cartão para confirmar'}</p>
      <p className="mt-1 text-[0.78rem] text-ink-600">O pedido muda para pago assim que o provedor confirmar.</p>
      {charge.pixImage && <img src={`data:image/png;base64,${charge.pixImage}`} alt="QR Code Pix" className="mx-auto mt-3 h-44 w-44 bg-white p-1" />}
      {charge.pixPayload && (
        <div className="mt-3">
          <textarea readOnly value={charge.pixPayload} rows={3} className="w-full break-all rounded border border-ink-200 bg-white p-2 font-mono text-[0.7rem]" data-testid="pix-payload" />
          {onCopy && <button type="button" onClick={onCopy} className="mt-2 w-full rounded bg-brand px-3 py-2 font-semibold text-white">{copied ? 'Código copiado' : 'Copiar código Pix'}</button>}
        </div>
      )}
      {charge.invoiceUrl && <a href={charge.invoiceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-center font-semibold text-brand underline" data-testid="invoice-link">{charge.billingType === 'PIX' ? 'Abrir página da cobrança' : 'Pagar com cartão na página segura'}</a>}
    </div>
  );
}
