'use client';

import { useMemo, useState } from 'react';
import { cn, formatBRL, timeAgo } from '@/lib/utils';
import { ORDER_STATUS_LABEL } from '@/data/business-copy';
import { SourceBadge } from '@/components/ui/StatusBadge';
import { nextStatuses } from '@/lib/validations/order';
import type { OrderStatus } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * KANBAN DA CENTRAL DE PEDIDOS
 * -----------------------------------------------------------------------
 * Mesmas colunas e mesmos cartões de plataforma.html.
 *
 * O arrastar-e-soltar do arquivo original vira botões de avanço aqui.
 * Motivo: drag-and-drop não funciona em teclado nem em leitor de tela, e
 * a ação "avançar pedido" é a operação mais repetida da loja — ela
 * precisa funcionar com um toque no celular do balcão.
 *
 * A coluna de destino é sempre validada pelo servidor
 * (canTransition): mostrar o botão não autoriza a transição.
 * ═══════════════════════════════════════════════════════════════════════
 */

const COLUMNS: Array<{ status: OrderStatus; accent: string; dot: string }> = [
  { status: 'NEW', accent: 'border-t-brand', dot: 'bg-brand' },
  { status: 'CONFIRMED', accent: 'border-t-info', dot: 'bg-info' },
  { status: 'PREPARING', accent: 'border-t-warn', dot: 'bg-warn' },
  { status: 'READY', accent: 'border-t-teal', dot: 'bg-teal' },
  { status: 'WAITING_DRIVER', accent: 'border-t-accent', dot: 'bg-accent' },
  { status: 'DISPATCHED', accent: 'border-t-info', dot: 'bg-info' },
  { status: 'DELIVERED', accent: 'border-t-success', dot: 'bg-success' },
];

/** Rótulo curto do botão que leva ao próximo status. */
const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Aceitar',
  PREPARING: 'Preparar',
  READY: 'Pronto',
  WAITING_DRIVER: 'Aguardar entregador',
  DISPATCHED: 'Despachar',
  DELIVERED: 'Entregar',
};

export type KanbanOrder = {
  id: string;
  displayId: number;
  source: string;
  status: string;
  customerName: string;
  customerPhone: string;
  total: number;
  deliveryFee: number;
  paymentMethod: string | null;
  paymentStatus: string;
  deliveryAddress: string;
  deliveryNumber: string | null;
  deliveryDistrict: string | null;
  createdAt: string | Date;
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

export function OrderKanban({
  orders,
  onOpen,
  onAdvance,
  pendingId,
  canAdvance = true,
}: {
  orders: KanbanOrder[];
  onOpen: (order: KanbanOrder) => void;
  onAdvance: (order: KanbanOrder, status: OrderStatus) => void;
  pendingId?: string | null;
  canAdvance?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, KanbanOrder[]>();
    for (const column of COLUMNS) map.set(column.status, []);
    for (const order of orders) {
      map.get(order.status)?.push(order);
    }
    return map;
  }, [orders]);

  function toggle(status: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <div className="kanban-scroll -mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {COLUMNS.map((column) => {
        const items = grouped.get(column.status) ?? [];
        const isCollapsed = collapsed.has(column.status);
        const sum = items.reduce((acc, o) => acc + o.total, 0);

        return (
          <section
            key={column.status}
            className={cn(
              'flex flex-shrink-0 flex-col rounded-lg border border-ink-100 border-t-[3px] bg-ink-50',
              column.accent,
              isCollapsed ? 'w-[68px]' : 'w-[300px]',
            )}
          >
            <header className="flex items-center gap-2 px-3 py-3">
              <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', column.dot)} />
              {!isCollapsed && (
                <>
                  <h2 className="min-w-0 flex-1 truncate text-[0.8rem] font-bold text-ink-800">
                    {ORDER_STATUS_LABEL[column.status]}
                  </h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-bold text-ink-600">
                    {items.length}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => toggle(column.status)}
                aria-label={isCollapsed ? 'Expandir coluna' : 'Recolher coluna'}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm text-ink-400 transition-all hover:bg-white hover:text-ink-700"
              >
                {isCollapsed ? '›' : '‹'}
              </button>
            </header>

            {!isCollapsed && (
              <>
                {sum > 0 && (
                  <p className="px-3 pb-2 text-[0.7rem] font-semibold text-ink-500">
                    {formatBRL(sum)} na coluna
                  </p>
                )}

                <div className="flex max-h-[calc(100vh-320px)] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[0.74rem] text-ink-400">
                      Nenhum pedido
                    </p>
                  ) : (
                    items.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onOpen={() => onOpen(order)}
                        onAdvance={onAdvance}
                        pending={pendingId === order.id}
                        canAdvance={canAdvance}
                      />
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function OrderCard({
  order,
  onOpen,
  onAdvance,
  pending,
  canAdvance,
}: {
  order: KanbanOrder;
  onOpen: () => void;
  onAdvance: (order: KanbanOrder, status: OrderStatus) => void;
  pending: boolean;
  canAdvance: boolean;
}) {
  /**
   * Transições permitidas, sem CANCELLED.
   *
   * Cancelar não é "avançar": é uma ação à parte, com motivo, e vive no
   * detalhe do pedido. Por isso todo botão gerado aqui tem o mesmo estilo
   * (avanço em destaque) â€” a variante de contorno cinza que existia antes
   * era código morto que só o compilador conseguia ver.
   */
  const options = nextStatuses(order.status as OrderStatus).filter((s) => s !== 'CANCELLED');
  const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);

  // Pedido novo há muito tempo: sinaliza atraso sem precisar de relatório.
  const ageMinutes = Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const late = ageMinutes > 30 && !['DELIVERED', 'CANCELLED'].includes(order.status);

  return (
    <article
      className={cn(
        'rounded border bg-white p-3 shadow-xs transition-all',
        late ? 'border-danger/40' : 'border-ink-100',
        pending && 'opacity-60',
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[0.82rem] font-extrabold text-ink-900">
            #{order.displayId}
          </span>
          <span className="text-[0.82rem] font-extrabold text-brand">
            {formatBRL(order.total)}
          </span>
        </div>

        <p className="mt-1 truncate text-[0.78rem] font-semibold text-ink-700">
          {order.customerName}
        </p>

        <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-snug text-ink-500">
          {order.items
            .slice(0, 3)
            .map((i) => `${i.quantity}× ${i.productName}`)
            .join(' · ')}
          {order.items.length > 3 && ` +${order.items.length - 3}`}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <SourceBadge source={order.source} />
          {order.paymentStatus === 'PENDING' && order.paymentMethod === 'CASH' && (
            <span className="rounded-full bg-warn-bg px-2 py-1 text-[0.68rem] font-bold text-warn">
              Cobrar na entrega
            </span>
          )}
          {order.driver && (
            <span className="rounded-full bg-ink-100 px-2 py-1 text-[0.68rem] font-semibold text-ink-600">
              🛵 {order.driver.name.split(' ')[0]}
            </span>
          )}
        </div>

        <p className={cn('mt-2 text-[0.68rem]', late ? 'font-bold text-danger' : 'text-ink-400')}>
          {timeAgo(order.createdAt)} · {itemCount} {itemCount === 1 ? 'item' : 'itens'}
        </p>
      </button>

      {canAdvance && options.length > 0 && (
        <div className="mt-2.5 flex gap-1.5 border-t border-ink-100 pt-2.5">
          {options.map((status) => (
            <button
              key={status}
              type="button"
              disabled={pending}
              onClick={() => onAdvance(order, status)}
              className={cn(
                'flex-1 rounded-sm px-2 py-1.5 text-[0.7rem] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-55',
                'bg-brand text-white hover:bg-brand-dark',
              )}
            >
              {ADVANCE_LABEL[status] ?? ORDER_STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

