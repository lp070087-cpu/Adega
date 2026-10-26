/**
 * Customer-facing progress derived only from the persisted order/delivery
 * state. There is no separate tracking status: the panel, dispatch and the
 * driver app keep writing Order.status and the timestamps, and this reads them.
 */
export type TrackingStepKey = 'CONFIRMED' | 'PREPARING' | 'DISPATCHED' | 'READY' | 'DELIVERED';
export type TrackingStepState = 'done' | 'current' | 'pending';
export type TrackingPhase = 'waiting' | 'progress' | 'done' | 'cancelled';

export type TrackingInput = {
  status: string;
  deliveryType?: string | null;
  deliveryStatus?: string | null;
  createdAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  preparingAt?: Date | string | null;
  readyAt?: Date | string | null;
  dispatchedAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  cancelledAt?: Date | string | null;
};

export type TrackingStep = { key: TrackingStepKey; label: string; state: TrackingStepState; at: Date | null };
export type TrackingView = {
  phase: TrackingPhase;
  pickup: boolean;
  steps: TrackingStep[];
  /** Short headline for the current situation. */
  headline: string;
  /** Extra explanation (waiting, cancellation, failed attempt). */
  notice: string | null;
  noticeTone: 'info' | 'warning' | 'danger' | 'success' | null;
  terminal: boolean;
};

const toDate = (value?: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function trackingSteps(pickup: boolean): Array<{ key: TrackingStepKey; label: string }> {
  return pickup
    ? [
        { key: 'CONFIRMED', label: 'Aceito' },
        { key: 'PREPARING', label: 'Separando' },
        { key: 'READY', label: 'Pronto para retirada' },
        { key: 'DELIVERED', label: 'Finalizado' },
      ]
    : [
        { key: 'CONFIRMED', label: 'Aceito' },
        { key: 'PREPARING', label: 'Separando' },
        { key: 'DISPATCHED', label: 'Saiu para entrega' },
        { key: 'DELIVERED', label: 'Finalizado' },
      ];
}

/** Index of the step the order is currently in; -1 before acceptance. */
function reachedIndex(status: string, pickup: boolean): number {
  switch (status) {
    case 'CONFIRMED': return 0;
    case 'PREPARING': return 1;
    // Delivery orders keep READY/WAITING_DRIVER inside "Separando" until the driver leaves.
    case 'READY':
    case 'WAITING_DRIVER': return pickup ? 2 : 1;
    case 'DISPATCHED': return 2;
    case 'DELIVERED': return 3;
    default: return -1;
  }
}

/** For cancelled orders, how far the order really got before cancellation. */
function cancelledIndex(input: TrackingInput, pickup: boolean): number {
  if (!pickup && toDate(input.dispatchedAt)) return 2;
  if (pickup && toDate(input.readyAt)) return 2;
  if (toDate(input.preparingAt)) return 1;
  if (toDate(input.acceptedAt)) return 0;
  return -1;
}

export function orderTracking(input: TrackingInput): TrackingView {
  const pickup = input.deliveryType === 'PICKUP';
  const base = trackingSteps(pickup);
  const stamps: Record<TrackingStepKey, Date | null> = {
    CONFIRMED: toDate(input.acceptedAt),
    PREPARING: toDate(input.preparingAt),
    READY: toDate(input.readyAt),
    DISPATCHED: toDate(input.dispatchedAt),
    DELIVERED: toDate(input.deliveredAt),
  };

  if (input.status === 'CANCELLED') {
    const reached = cancelledIndex(input, pickup);
    return {
      phase: 'cancelled', pickup, terminal: true,
      steps: base.map((step, index) => ({ ...step, state: index <= reached ? 'done' : 'pending', at: index <= reached ? stamps[step.key] : null })),
      headline: 'Pedido cancelado',
      notice: 'Este pedido foi cancelado e não será entregue. Em caso de dúvida sobre pagamento ou reembolso, fale com a loja.',
      noticeTone: 'danger',
    };
  }

  const reached = reachedIndex(input.status, pickup);
  const delivered = input.status === 'DELIVERED';
  const steps: TrackingStep[] = base.map((step, index) => {
    const state: TrackingStepState = delivered || index < reached ? 'done' : index === reached ? 'current' : 'pending';
    return { ...step, state, at: state === 'pending' ? null : stamps[step.key] };
  });

  if (reached < 0) {
    return {
      phase: 'waiting', pickup, steps, terminal: false,
      headline: 'Aguardando confirmação da loja',
      notice: 'Seu pedido foi recebido e está aguardando a confirmação do estabelecimento.',
      noticeTone: 'info',
    };
  }
  if (delivered) {
    return {
      phase: 'done', pickup, steps, terminal: true,
      headline: pickup ? 'Pedido retirado' : 'Pedido entregue',
      notice: pickup ? 'A retirada foi confirmada pela loja.' : 'A entrega foi concluída e confirmada.',
      noticeTone: 'success',
    };
  }
  const failedAttempt = !pickup && input.deliveryStatus === 'FAILED' && reached === 1;
  // Entrega: pronto e liberado → aguardando o entregador; retirado → a caminho em instantes.
  const handoff = !pickup && input.status === 'WAITING_DRIVER'
    ? (input.deliveryStatus === 'PICKED_UP' ? 'Retirado pelo entregador' : 'Pronto, aguardando o entregador')
    : null;
  return {
    phase: 'progress', pickup, steps, terminal: false,
    headline: handoff ?? steps[reached]?.label ?? 'Em andamento',
    notice: failedAttempt
      ? 'A última tentativa de entrega não foi concluída. A loja está reorganizando o envio do seu pedido.'
      : pickup && reached === 2 ? 'Seu pedido está pronto. Retire no estabelecimento.' : null,
    noticeTone: failedAttempt ? 'warning' : pickup && reached === 2 ? 'success' : null,
  };
}
