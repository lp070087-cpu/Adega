export type DriverStep = 'ARRIVED_STORE' | 'PICKED_UP' | 'STARTED' | 'ARRIVED_CUSTOMER' | 'DELIVERED';

/** One source of truth for both the app and server transition validation. */
export function nextDriverStep(delivery: { status: string; arrivedAt?: unknown } | null): DriverStep | null {
  if (!delivery || ['DELIVERED', 'FAILED'].includes(delivery.status)) return null;
  switch (delivery.status) {
    case 'PENDING':
    case 'ASSIGNED': return 'PICKED_UP';
    case 'PICKED_UP': return 'STARTED';
    case 'IN_TRANSIT': return 'ARRIVED_CUSTOMER';
    case 'ARRIVED': return 'DELIVERED';
    default: return null;
  }
}
