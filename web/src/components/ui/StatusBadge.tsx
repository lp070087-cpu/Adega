import { Badge, type BadgeTone } from './index';
import {
  DRIVER_STATUS_LABEL,
  ORDER_SOURCE_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  DELIVERY_STATUS_LABEL,
  STORE_STATUS_LABEL,
  type StoreStatusValue,
} from '@/data/business-copy';

/**
 * Selos de status.
 *
 * As cores seguem a leitura de operação do painel: laranja = precisa de
 * atenção, azul = em andamento, verde = concluído, cinza = parado,
 * vermelho = problema. Os rótulos vêm de business-copy para que exista
 * um só lugar traduzindo os enums.
 */

const ORDER_TONES: Record<string, BadgeTone> = {
  NEW: 'orange',
  CONFIRMED: 'blue',
  PREPARING: 'yellow',
  READY: 'teal',
  WAITING_DRIVER: 'purple',
  DISPATCHED: 'blue',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

const DRIVER_TONES: Record<string, BadgeTone> = {
  OFFLINE: 'neutral',
  ONLINE: 'green',
  BUSY: 'orange',
  RETURNING: 'blue',
};

const PAYMENT_TONES: Record<string, BadgeTone> = {
  PENDING: 'yellow',
  PAID: 'green',
  FAILED: 'red',
  REFUNDED: 'purple',
};

const DELIVERY_TONES: Record<string, BadgeTone> = {
  PENDING: 'neutral',
  ASSIGNED: 'orange',
  PICKED_UP: 'blue',
  IN_TRANSIT: 'blue',
  ARRIVED: 'teal',
  DELIVERED: 'green',
  FAILED: 'red',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={ORDER_TONES[status] ?? 'neutral'}>{ORDER_STATUS_LABEL[status] ?? status}</Badge>;
}

export function DriverStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={DRIVER_TONES[status] ?? 'neutral'}>{DRIVER_STATUS_LABEL[status] ?? status}</Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={PAYMENT_TONES[status] ?? 'neutral'}>
      {PAYMENT_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function DeliveryStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={DELIVERY_TONES[status] ?? 'neutral'}>
      {DELIVERY_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const tone: BadgeTone =
    source === 'OWN_STORE'
      ? 'orange'
      : source === 'IFOOD'
        ? 'red'
        : source === 'FOOD99'
          ? 'yellow'
          : source === 'ZE_DELIVERY'
            ? 'purple'
            : source === 'WHATSAPP'
              ? 'green'
              : 'neutral';
  return <Badge tone={tone}>{ORDER_SOURCE_LABEL[source] ?? source}</Badge>;
}

export function PaymentMethodBadge({ method }: { method: string | null }) {
  if (!method) return <span className="text-ink-400">—</span>;
  return <Badge tone="neutral">{PAYMENT_METHOD_LABEL[method] ?? method}</Badge>;
}

export function StoreStatusBadge({ status }: { status: StoreStatusValue }) {
  const tone: BadgeTone = status === 'OPEN' ? 'green' : status === 'PAUSED' ? 'yellow' : 'red';
  return <Badge tone={tone}>{STORE_STATUS_LABEL[status]}</Badge>;
}
