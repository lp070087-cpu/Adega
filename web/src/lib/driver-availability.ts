/**
 * Operational state of a driver — one definition for every screen (driver
 * list, order assignment, dispatch, driver app).
 *
 * Online/offline reflects whether the driver has the app open (set
 * automatically when the app opens and on logout — there is no manual
 * switch). The store may assign to any active driver; offline only means
 * the driver will see the order when opening the app. The weekly schedule
 * organizes the list and never blocks. Suspension and pending first access
 * still block. A driver may carry several deliveries.
 */
export type DriverAvailability = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'INACTIVE' | 'PENDING_ACCESS';
export type AvailabilityInput = { active: boolean; activeOrders: number; status?: string | null; accessPending?: boolean };

export function driverAvailability(driver: AvailabilityInput): DriverAvailability {
  if (!driver.active) return 'INACTIVE';
  if (driver.accessPending) return 'PENDING_ACCESS';
  if (driver.activeOrders > 0) return 'BUSY';
  if (!driver.status || driver.status === 'OFFLINE') return 'OFFLINE';
  return 'AVAILABLE';
}
/** Online = can receive orders (free, or already on a route). */
export const isDriverOnline = (driver: AvailabilityInput) => ['AVAILABLE', 'BUSY'].includes(driverAvailability(driver));
export const canReceiveOrder = (driver: AvailabilityInput) => !['INACTIVE', 'PENDING_ACCESS'].includes(driverAvailability(driver));
export const DRIVER_AVAILABILITY_LABEL: Record<DriverAvailability, string> = {
  AVAILABLE: 'Online',
  BUSY: 'Em entrega',
  OFFLINE: 'Offline',
  INACTIVE: 'Suspenso',
  PENDING_ACCESS: 'Aguardando primeiro acesso',
};
/** Text used inside the order assignment select: just name and online/offline. */
export const driverOptionLabel = (driver: { name: string } & AvailabilityInput) => `${driver.name} — ${isDriverOnline(driver) ? 'Online' : 'Offline'}`;
