/**
 * Operational state of a driver, always derived from real data: active link,
 * access ready, work schedule and deliveries in progress. There is no manual
 * "available" switch — a driver inside the schedule with no delivery in
 * progress can receive an order.
 */
export type DriverAvailability = 'AVAILABLE' | 'BUSY' | 'OFF_SHIFT' | 'INACTIVE' | 'PENDING_ACCESS';
export type AvailabilityInput = { active: boolean; activeOrders: number; onShift?: boolean | null; accessPending?: boolean };

export function driverAvailability(driver: AvailabilityInput): DriverAvailability {
  if (!driver.active) return 'INACTIVE';
  if (driver.accessPending) return 'PENDING_ACCESS';
  if (driver.activeOrders > 0) return 'BUSY';
  if (driver.onShift === false) return 'OFF_SHIFT';
  return 'AVAILABLE';
}
export const canReceiveOrder = (driver: AvailabilityInput) => driverAvailability(driver) === 'AVAILABLE';
export const DRIVER_AVAILABILITY_LABEL: Record<DriverAvailability, string> = {
  AVAILABLE: 'Disponível',
  BUSY: 'Em entrega',
  OFF_SHIFT: 'Fora da escala',
  INACTIVE: 'Inativo',
  PENDING_ACCESS: 'Aguardando primeiro acesso',
};
