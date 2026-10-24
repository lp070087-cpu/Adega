import type { OrderStatus } from '@prisma/client';

/**
 * Próxima ação principal de cada pedido — a mesma regra na tela e no
 * servidor. O cartão mostra um único botão; o servidor recalcula a ação a
 * partir do status gravado e recusa se o pedido já mudou.
 *
 * Entrega:  Novo → Aceitar → Aceito → Iniciar separação → Separando →
 *           (atribuir entregador) → Saiu para entrega → (entregador conclui)
 * Retirada: Novo → Aceitar → Aceito → Iniciar separação → Separando →
 *           Pronto para retirada → Finalizar
 */
export type OrderAction =
  | { kind: 'advance'; to: OrderStatus; label: string }
  | { kind: 'assign'; label: string }
  | { kind: 'tracking'; label: string }
  | null;

export function primaryOrderAction(order: { status: string; deliveryType?: string | null; driverId?: string | null }): OrderAction {
  const pickup = order.deliveryType === 'PICKUP';
  switch (order.status) {
    case 'NEW': return { kind: 'advance', to: 'CONFIRMED', label: 'Aceitar' };
    case 'CONFIRMED': return { kind: 'advance', to: 'PREPARING', label: 'Iniciar separação' };
    case 'PREPARING':
      if (pickup) return { kind: 'advance', to: 'READY', label: 'Pronto para retirada' };
      return order.driverId ? { kind: 'advance', to: 'DISPATCHED', label: 'Saiu para entrega' } : { kind: 'assign', label: 'Atribuir entregador' };
    case 'READY':
      if (pickup) return { kind: 'advance', to: 'DELIVERED', label: 'Finalizar' };
      return order.driverId ? { kind: 'advance', to: 'DISPATCHED', label: 'Saiu para entrega' } : { kind: 'assign', label: 'Atribuir entregador' };
    case 'WAITING_DRIVER': return { kind: 'advance', to: 'DISPATCHED', label: 'Saiu para entrega' };
    case 'DISPATCHED': return { kind: 'tracking', label: 'Em rota de entrega' };
    default: return null;
  }
}

export const isActiveOrder = (status: string) => !['DELIVERED', 'CANCELLED'].includes(status);

/** Ordem de exibição: mais urgente primeiro (novos), depois o mais antigo. */
const RANK: Record<string, number> = { NEW: 0, CONFIRMED: 1, PREPARING: 2, READY: 3, WAITING_DRIVER: 3, DISPATCHED: 4, DELIVERED: 5, CANCELLED: 6 };
export const orderRank = (status: string) => RANK[status] ?? 9;

export function readAutoAccept(settings: unknown): boolean {
  return Boolean(settings && typeof settings === 'object' && !Array.isArray(settings) && (settings as Record<string, unknown>).orderAutoAccept === true);
}
