'use client';

import { useState, useTransition } from 'react';
import { formatBRL, formatDateTime, onlyDigits } from '@/lib/utils';
import { ORDER_STATUS_LABEL } from '@/data/business-copy';
import {
  assignDriverAction,
  unassignDriverAction,
  updateOrderStatusAction,
} from '@/app/actions/orders';
import { nextStatuses } from '@/lib/validations/order';
import { Alert, Button, Drawer, Select, Textarea } from '@/components/ui';
import {
  PaymentMethodBadge,
  PaymentStatusBadge,
  SourceBadge,
  StatusBadge,
} from '@/components/ui/StatusBadge';
import type { OrderStatus } from '@prisma/client';
import type { KanbanOrder } from './OrderKanban';

/**
 * Detalhe do pedido em gaveta lateral — mesma leitura de plataforma.html:
 * itens, valores, cliente, endereço e as ações do próximo passo.
 *
 * Todas as ações chamam server actions; nenhuma delas calcula valor. O
 * total mostrado é o que o servidor gravou no pedido.
 */

export type DrawerOrder = KanbanOrder & {
  deliveryAddress: string;
  deliveryNumber: string | null;
  deliveryDistrict: string | null;
  deliveryCity: string | null;
  deliveryZipCode: string | null;
  subtotal: number;
  discount: number;
  notes: string | null;
  /** Datas chegam como Date do servidor ou string após serialização. */
  acceptedAt: string | Date | null;
  readyAt: string | Date | null;
  dispatchedAt: string | Date | null;
  deliveredAt: string | Date | null;
  cancelledAt: string | Date | null;
};

export function OrderDrawer({
  order,
  open,
  onClose,
  drivers,
  canManageOrders,
  canManageDrivers,
  onChanged,
}: {
  order: DrawerOrder | null;
  open: boolean;
  onClose: () => void;
  drivers: Array<{ id: string; name: string; status: string }>;
  canManageOrders: boolean;
  canManageDrivers: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');

  if (!order) return null;

  function advance(status: OrderStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderStatusAction({ orderId: order!.id, status });
      if (!result.ok) setError(result.error);
      else {
        onChanged();
        onClose();
      }
    });
  }

  function cancel() {
    if (cancelReason.trim().length < 3) {
      setError('Informe o motivo do cancelamento — ele fica registrado no pedido.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orderId: order!.id,
        status: 'CANCELLED',
        reason: cancelReason.trim(),
      });
      if (!result.ok) setError(result.error);
      else {
        onChanged();
        onClose();
      }
    });
  }

  function assign() {
    if (!selectedDriver) {
      setError('Escolha um entregador.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await assignDriverAction({ orderId: order!.id, driverId: selectedDriver });
      if (!result.ok) setError(result.error);
      else {
        onChanged();
        onClose();
      }
    });
  }

  function unassign() {
    setError(null);
    startTransition(async () => {
      const result = await unassignDriverAction(order!.id);
      if (!result.ok) setError(result.error);
      else {
        onChanged();
        onClose();
      }
    });
  }

  const options = nextStatuses(order.status as OrderStatus).filter((s) => s !== 'CANCELLED');
  const isOpen = !['DELIVERED', 'CANCELLED'].includes(order.status);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Pedido #${order.displayId}`}
      subtitle={formatDateTime(order.createdAt)}
      footer={
        canManageOrders && isOpen ? (
          <>
            <Button variant="ghost" onClick={() => setShowCancel((v) => !v)} disabled={pending}>
              Cancelar pedido
            </Button>
            {options.map((status) => (
              <Button key={status} onClick={() => advance(status)} loading={pending}>
                {ORDER_STATUS_LABEL[status]}
              </Button>
            ))}
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        )
      }
    >
      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {showCancel && (
        <div className="mb-4 rounded border-2 border-danger/25 bg-danger-bg p-3.5">
          <p className="mb-2 text-[0.78rem] font-bold text-danger">
            Cancelar o pedido #{order.displayId}
          </p>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={2}
            placeholder="Motivo (fica registrado no pedido)"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowCancel(false)}>
              Voltar
            </Button>
            <Button size="sm" variant="danger" onClick={cancel} loading={pending}>
              Confirmar cancelamento
            </Button>
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <SourceBadge source={order.source} />
        <PaymentMethodBadge method={order.paymentMethod} />
        <PaymentStatusBadge status={order.paymentStatus} />
      </div>

      {/* ── Itens ─────────────────────────────────────────────────── */}
      <section className="mb-5">
        <h3 className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
          Itens
        </h3>

        <ul className="divide-y divide-ink-100 rounded border border-ink-100">
          {order.items.map((item) => (
            <li key={item.id} className="px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.84rem] font-semibold text-ink-800">
                    <span className="text-brand">{item.quantity}×</span> {item.productName}
                  </p>
                  {item.variationName && (
                    <p className="text-[0.72rem] text-ink-500">{item.variationName}</p>
                  )}
                  {item.options.length > 0 && (
                    <p className="text-[0.72rem] text-ink-500">
                      {item.options.map((o) => o.name).join(', ')}
                    </p>
                  )}
                  {item.notes && (
                    <p className="mt-0.5 text-[0.72rem] italic text-warn">obs: {item.notes}</p>
                  )}
                </div>
                <p className="flex-shrink-0 text-[0.84rem] font-bold text-ink-700">
                  {formatBRL(item.total)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Valores ───────────────────────────────────────────────── */}
      <section className="mb-5">
        <h3 className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
          Valores
        </h3>
        <dl className="space-y-1.5 rounded border border-ink-100 bg-ink-50 px-3.5 py-3 text-[0.82rem]">
          <Row label="Subtotal" value={formatBRL(order.subtotal)} />
          {order.discount > 0 && (
            <Row label="Desconto" value={`− ${formatBRL(order.discount)}`} />
          )}
          <Row label="Taxa de entrega" value={formatBRL(order.deliveryFee)} />
          <div className="flex justify-between border-t border-ink-200 pt-1.5 text-[0.92rem] font-extrabold text-ink-900">
            <dt>Total</dt>
            <dd className="text-brand">{formatBRL(order.total)}</dd>
          </div>
        </dl>
        <p className="mt-1.5 text-[0.68rem] text-ink-400">
          Valores calculados no servidor a partir do catálogo da loja.
        </p>
      </section>

      {/* ── Cliente e entrega ─────────────────────────────────────── */}
      <section className="mb-5">
        <h3 className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
          Cliente e entrega
        </h3>
        <div className="rounded border border-ink-100 px-3.5 py-3 text-[0.82rem] text-ink-700">
          <p className="font-semibold text-ink-900">{order.customerName}</p>
          <p>{order.customerPhone}</p>
          <p className="mt-2 leading-relaxed">
            {order.deliveryAddress}
            {order.deliveryNumber ? `, ${order.deliveryNumber}` : ''}
            {order.deliveryDistrict ? ` — ${order.deliveryDistrict}` : ''}
            {order.deliveryCity ? `, ${order.deliveryCity}` : ''}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/55${onlyDigits(order.customerPhone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm bg-success px-3 py-1.5 text-[0.74rem] font-bold text-white transition-all hover:brightness-95"
            >
              WhatsApp
            </a>
            {/* Mapa: nesta fase aponta para busca pública; integração real
                com Google Maps fica para quando houver chave configurada. */}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${order.deliveryAddress} ${order.deliveryNumber ?? ''} ${order.deliveryDistrict ?? ''}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm border-2 border-ink-200 px-3 py-1.5 text-[0.74rem] font-semibold text-ink-600 transition-all hover:border-brand hover:text-brand"
            >
              Ver no mapa
            </a>
          </div>
        </div>
      </section>

      {/* ── Entregador ────────────────────────────────────────────── */}
      {canManageDrivers && isOpen && (
        <section className="mb-5">
          <h3 className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
            Entregador
          </h3>

          {order.driver ? (
            <div className="flex items-center justify-between gap-3 rounded border border-ink-100 px-3.5 py-3">
              <div>
                <p className="text-[0.84rem] font-semibold text-ink-800">{order.driver.name}</p>
                <p className="text-[0.72rem] text-ink-500">{order.driver.status}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={unassign} disabled={pending}>
                Remover
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                className="flex-1"
              >
                <option value="">Selecione um entregador...</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} — {driver.status}
                  </option>
                ))}
              </Select>
              <Button onClick={assign} loading={pending}>
                Atribuir
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ── Histórico ─────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
          Linha do tempo
        </h3>
        <ol className="space-y-2 border-l-2 border-ink-100 pl-3.5 text-[0.76rem]">
          <Timeline label="Pedido criado" at={order.createdAt} />
          {order.acceptedAt && <Timeline label="Aceito" at={order.acceptedAt} />}
          {order.readyAt && <Timeline label="Pronto" at={order.readyAt} />}
          {order.dispatchedAt && <Timeline label="Saiu para entrega" at={order.dispatchedAt} />}
          {order.deliveredAt && <Timeline label="Entregue" at={order.deliveredAt} />}
          {order.cancelledAt && <Timeline label="Cancelado" at={order.cancelledAt} />}
        </ol>

        {order.notes && (
          <p className="mt-3 whitespace-pre-line rounded border border-ink-100 bg-ink-50 px-3 py-2 text-[0.76rem] text-ink-600">
            {order.notes}
          </p>
        )}
      </section>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-600">
      <dt>{label}</dt>
      <dd className="font-semibold text-ink-800">{value}</dd>
    </div>
  );
}

function Timeline({ label, at }: { label: string; at: string | Date }) {
  return (
    <li className="relative text-ink-600">
      <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-brand" />
      <span className="font-semibold text-ink-800">{label}</span> — {formatDateTime(at)}
    </li>
  );
}
