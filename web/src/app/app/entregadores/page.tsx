import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getDrivers, getDriverSummary } from '@/lib/data/drivers';
import { DriversManager } from '@/components/drivers/DriversManager';
import type { DriverRow } from '@/components/drivers/DriversManager';
import { DriverScheduleManager } from '@/components/drivers/DriverScheduleManager';
import { getDriverSchedules } from '@/lib/data/driver-schedules';
import { readDriverSchedule } from '@/lib/driver-schedule';
import { getOrganizationById } from '@/lib/data/organization';
import { driverStorePath, publicOrigin } from '@/lib/data/driver-link';

export const metadata = { title: 'Entregadores' };
export const dynamic = 'force-dynamic';

/**
 * Entregadores: colaboradores logísticos vinculados à loja (não equipe interna).
 * Um único link permanente por loja; cadastro por e-mail, vínculos e escalas aqui.
 */
export default async function DriversPage() {
  const ctx = await requireOrgPage('MANAGE_DRIVERS');
  const [organization, origin] = await Promise.all([getOrganizationById(ctx.organizationId), publicOrigin()]);
  const linkUrl = organization && origin ? `${origin}${driverStorePath(organization.slug)}` : null;

  const [driversRaw, summary, settings] = await Promise.all([
    getDrivers(ctx.organizationId),
    getDriverSummary(ctx.organizationId),
    getDriverSchedules(ctx.organizationId),
  ]);

  const drivers: DriverRow[] = driversRaw.map((driver) => ({
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    vehicleType: driver.vehicleType,
    vehiclePlate: driver.vehiclePlate,
    status: driver.status,
    active: driver.active,
    hasLogin: driver.hasLogin,
    accessPending:driver.accessPending,
    canIssueTemp:driver.canIssueTemp,
    email: driver.email,
    username: driver.username,
    activeOrders: driver.activeOrders,
    onShift: driver.onShift,
    shiftLabel: driver.shiftLabel,
    deliveredTotal: driver.deliveredTotal,
    deliveredToday: driver.deliveredToday,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Entregadores</h2>
        <p className="text-[0.8rem] text-ink-500">Equipe de entrega, escala semanal e acesso ao aplicativo do entregador.</p>
      </div>
      <DriversManager
        drivers={drivers}
        summary={{
          total: summary.total,
          active: summary.active,
          online: summary.online,
          busy: summary.busy,
          dispatchesToday: summary.dispatchesToday,
        }}
        canManage={can(ctx.role, 'MANAGE_DRIVERS')}
        linkUrl={linkUrl}
        scheduleSlot={<DriverScheduleManager drivers={drivers} schedules={Object.fromEntries(drivers.map(driver => [driver.id, readDriverSchedule(settings, driver.id)]))} />}
      />
    </div>
  );
}
