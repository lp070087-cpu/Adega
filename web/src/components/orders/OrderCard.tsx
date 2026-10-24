'use client';

import { useState } from 'react';
import { cn, formatBRL, timeAgo } from '@/lib/utils';
import { SourceBadge, StatusBadge } from '@/components/ui/StatusBadge';
import { primaryOrderAction } from '@/lib/order-flow';
import { driverOptionLabel, isDriverOnline } from '@/lib/driver-availability';

/**
 * Cartão único do pedido: fica sempre no mesmo lugar e o botão principal
 * muda conforme o status (Aceitar → Iniciar separação → Saiu para entrega…).
 * A próxima etapa é recalculada pelo servidor, que recusa transições
 * inválidas ou um pedido que já mudou.
 */

export type KanbanOrder = {
  id: string;
  displayId: number;
  source: string;
  status: string;
  customerName: string;
  customerPhone: string;
  total: number;
  deliveryFee: number;
  deliveryType?: string;
  paymentMethod: string | null;
  paymentStatus: string;
  deliveryAddress: string;
  deliveryNumber: string | null;
  deliveryDistrict: string | null;
  createdAt: string | Date;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  notes: string | null;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    variationName: string | null;
    notes: string | null;
    total: number;
    options: Array<{ id: string; name: string; price: number; quantity: number }>;
  }>;
  driver: { id: string; name: string; status: string } | null;
};

export type CardDriver = { id: string; name: string; status: string; activeOrders?: number; accessPending?: boolean };

const availability = (d: CardDriver) => ({ name: d.name, active: true, status: d.status, activeOrders: d.activeOrders ?? 0, accessPending: d.accessPending });
const clock = (value?: string | null) => (value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

export function OrderCard({
  order,
  drivers,
  pending,
  canManageOrders,
  canManageDrivers,
  onOpen,
  onAdvance,
  onAssign,
}: {
  order: KanbanOrder;
  drivers: CardDriver[];
  pending: boolean;
  canManageOrders: boolean;
  canManageDrivers: boolean;
  onOpen: () => void;
  onAdvance: (order: KanbanOrder) => void;
  onAssign: (order: KanbanOrder, driverId: string) => void;
}) {
  const action = primaryOrderAction({ status: order.status, deliveryType: order.deliveryType, driverId: order.driver?.id ?? null });
  const [driverId, setDriverId] = useState('');
  const sorted = [...drivers].sort((a, b) => Number(isDriverOnline(availability(b))) - Number(isDriverOnline(availability(a))) || a.name.localeCompare(b.name));
  const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const ageMinutes = Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const late = ageMinutes > 30 && !['DELIVERED', 'CANCELLED'].includes(order.status);
  const pickup = order.deliveryType === 'PICKUP';

  return (
    <article
      data-testid="order-card"
      data-order={order.displayId}
      data-status={order.status}
      className={cn('flex flex-col rounded-2xl border bg-white p-3.5 shadow-[0_1px_2px_rgba(11,31,58,.04),0_6px_18px_rgba(11,31,58,.05)] transition-[opacity,box-shadow] hover:shadow-[0_2px_4px_rgba(11,31,58,.06),0_12px_28px_rgba(11,31,58,.08)]', late ? 'border-danger/40' : 'border-ink-100', pending && 'opacity-60')}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Abrir detalhes do pedido #${order.displayId}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[0.9rem] font-extrabold text-ink-900">#{order.displayId}</span>
            <StatusBadge status={order.status} deliveryType={order.deliveryType} />
          </div>
          <span className="shrink-0 text-[0.9rem] font-extrabold text-brand">{formatBRL(order.total)}</span>
        </div>
        <p className="mt-1.5 truncate text-[0.82rem] font-semibold text-ink-800">{order.customerName}</p>
        <p className="mt-0.5 line-clamp-2 text-[0.72rem] leading-snug text-ink-500">
          {order.items.slice(0, 3).map((i) => `${i.quantity}× ${i.productName}`).join(' · ')}
          {order.items.length > 3 && ` +${order.items.length - 3}`}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-ink-100 px-2 py-1 text-[0.68rem] font-semibold text-ink-700">{pickup ? 'Retirada' : `Entrega${order.deliveryDistrict ? ` · ${order.deliveryDistrict}` : ''}`}</span>
          <SourceBadge source={order.source} />
          {order.paymentStatus === 'PENDING' && order.paymentMethod === 'CASH' && <span className="rounded-full bg-warn-bg px-2 py-1 text-[0.68rem] font-bold text-warn">Cobrar na entrega</span>}
          {order.driver && <span className="rounded-full bg-ink-100 px-2 py-1 text-[0.68rem] font-semibold text-ink-700">🛵 {order.driver.name.split(' ')[0]}</span>}
        </div>
        <p className={cn('mt-2 text-[0.7rem]', late ? 'font-bold text-danger' : 'text-ink-400')}>
          {order.status === 'DELIVERED' ? `Finalizado ${clock(order.deliveredAt)}` : order.status === 'CANCELLED' ? `Cancelado ${clock(order.cancelledAt)}` : timeAgo(order.createdAt)} · {itemCount} {itemCount === 1 ? 'item' : 'itens'}
        </p>
      </button>

      {action && (
        <div className="mt-3 border-t border-ink-100 pt-3">
          {action.kind === 'advance' && (canManageOrders ? (
            <button type="button" disabled={pending} onClick={() => onAdvance(order)} className="min-h-11 w-full rounded-xl bg-brand px-3 text-[0.82rem] font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-55">
              {pending ? 'Atualizando…' : action.label}
            </button>
          ) : <p className="text-[0.76rem] text-ink-500">Próxima etapa: {action.label}</p>)}

          {action.kind === 'assign' && (canManageDrivers ? (
            <div className="flex gap-2">
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)} aria-label={`Entregador do pedido #${order.displayId}`} className="field-input min-h-11 min-w-0 flex-1 text-[0.8rem]">
                <option value="">Escolha o entregador</option>
                {sorted.map((d) => <option key={d.id} value={d.id} disabled={!isDriverOnline(availability(d))}>{driverOptionLabel(availability(d))}</option>)}
              </select>
              <button type="button" disabled={pending || !driverId} onClick={() => onAssign(order, driverId)} className="min-h-11 shrink-0 rounded-xl bg-brand px-3 text-[0.8rem] font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-55">
                Atribuir
              </button>
            </div>
          ) : <p className="text-[0.76rem] text-ink-500">Aguardando atribuição de entregador.</p>)}

          {action.kind === 'tracking' && (
            <button type="button" onClick={onOpen} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-info/30 bg-info-bg px-3 text-[0.8rem] font-semibold text-info">
              🛵 {order.driver ? `Em rota com ${order.driver.name.split(' ')[0]}` : action.label} · acompanhar
            </button>
          )}
        </div>
      )}
    </article>
  );
}
