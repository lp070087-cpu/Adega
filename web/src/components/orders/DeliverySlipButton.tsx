'use client';

import { useState, useTransition } from 'react';
import { Printer } from 'lucide-react';
import { issueDeliverySlip } from '@/app/actions/delivery-pickup';
import { Alert, Button, Modal } from '@/components/ui';
import { PAYMENT_METHOD_LABEL } from '@/data/business-copy';
import { formatBRL } from '@/lib/utils';

type Slip = Extract<Awaited<ReturnType<typeof issueDeliverySlip>>, { ok: true }>['slip'];

export function DeliverySlipButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<{ data: Slip; image: string } | null>(null);
  const [error, setError] = useState('');

  function prepare() {
    setOpen(true);
    setError('');
    setSheet(null);
    start(async () => {
      try {
        const result = await issueDeliverySlip(orderId);
        if (!result.ok) { setError(result.error); return; }
        const { toDataURL } = await import('qrcode');
        setSheet({ data: result.slip, image: await toDataURL(result.slip.qr, { width: 208, margin: 4 }) });
      } catch {
        setError('Não foi possível preparar a ficha. Tente novamente.');
      }
    });
  }

  const slip = sheet?.data;
  const collect = slip?.paymentStatus === 'PENDING' && slip.paymentMethod !== 'ONLINE';
  return <>
    <Button size="sm" variant="secondary" onClick={prepare} disabled={pending}><Printer size={16} aria-hidden /> Imprimir entrega</Button>
    <Modal open={open} title="Ficha de entrega" onClose={() => setOpen(false)}
      footer={<Button disabled={!sheet || pending} onClick={() => window.print()}><Printer size={16} aria-hidden /> Imprimir ficha</Button>}>
      {pending && <p role="status">Preparando código de coleta…</p>}
      {error && <Alert tone="danger">{error}</Alert>}
      {sheet && slip && <>
        <style>{`@media print {
          body:has([data-delivery-slip]) { background: white !important; overflow: visible !important; }
          body:has([data-delivery-slip]) > :not(:has([data-delivery-slip])),
          body :has([data-delivery-slip]) > :not([data-delivery-slip]):not(:has([data-delivery-slip])) { display: none !important; }
          body :has([data-delivery-slip]) { position: static !important; display: block !important; max-height: none !important; max-width: none !important; overflow: visible !important; transform: none !important; padding: 0 !important; box-shadow: none !important; background: white !important; }
          [data-delivery-slip] { width: 100%; padding: 5mm; background: white; color: black !important; }
          [data-delivery-slip] img { break-inside: avoid; }
        }`}</style>
        <div data-delivery-slip className="space-y-3 text-sm text-ink-900">
          <p className="text-center font-bold">{slip.store} · Ficha de entrega</p>
          <p className="text-center">Pedido #{slip.displayId} · {slip.driver}</p>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sheet.image} width={176} height={176} alt="QR Code de coleta" className="mx-auto" />
            <p>Código de coleta</p>
            <strong className="font-mono text-2xl tracking-widest">{slip.code}</strong>
          </div>
          <p className="font-semibold">{slip.customerName}</p>
          <p>{[slip.deliveryAddress, slip.deliveryNumber, slip.deliveryDistrict, slip.deliveryCity, slip.deliveryZipCode].filter(Boolean).join(', ')}</p>
          <ul>{slip.items.map((item, index) => <li key={index}>{item.quantity}× {item.productName}{item.variationName ? ` · ${item.variationName}` : ''}</li>)}</ul>
          {slip.notes && <p>{slip.notes}</p>}
          <p><strong>{collect ? 'Total a cobrar' : 'Total do pedido'}</strong> {formatBRL(slip.total)}{slip.paymentStatus === 'PAID' ? ' · Pago' : ''}</p>
          <p>Pagamento: {PAYMENT_METHOD_LABEL[slip.paymentMethod] ?? slip.paymentMethod}</p>
          {collect && slip.changeFor != null && <p>Troco para {formatBRL(slip.changeFor)} · Entregar {formatBRL(Math.max(0, slip.changeFor - slip.total))} de troco</p>}
          <p className="text-xs text-ink-500">Ficha operacional de coleta e entrega</p>
        </div>
      </>}
    </Modal>
  </>;
}
