import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getDrivers, getDriverSummary } from '@/lib/data/drivers';
import { DriversManager } from '@/components/drivers/DriversManager';
import type { DriverRow } from '@/components/drivers/DriversManager';
import { DriverInstall } from '@/components/driver/DriverInstall';
import { DriverInstallShare } from '@/components/driver/DriverInstallShare';
import { DriverScheduleManager } from '@/components/drivers/DriverScheduleManager';
import { getDriverSchedules } from '@/lib/data/driver-schedules';
import { readDriverSchedule } from '@/lib/driver-schedule';
import {driverMailReady} from '@/lib/auth/driver-access';
import { prisma } from '@/lib/db';

export const metadata = { title: 'Entregadores' };
export const dynamic = 'force-dynamic';

/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * ENTREGADORES
 * -----------------------------------------------------------------------
 * A frota da organizaÃ§Ã£o da sessÃ£o. As contagens (entregas de hoje,
 * total entregue, pedidos na rua) vÃªm de agregaÃ§Ã£o sobre Order â€” nÃ£o de
 * contador gravado no cadastro do entregador.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */
export default async function DriversPage() {
  const ctx = await requireOrgPage('MANAGE_DRIVERS');
  const invitationStore = await prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { slug: true } });

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
    email: driver.email,
    username: driver.username,
    activeOrders: driver.activeOrders,
    onShift: driver.onShift,
    shiftLabel: driver.shiftLabel,
    deliveredTotal: driver.deliveredTotal,
    deliveredToday: driver.deliveredToday,
    lastLocation: driver.lastLocation
      ? {
          latitude: driver.lastLocation.latitude,
          longitude: driver.lastLocation.longitude,
          createdAt: driver.lastLocation.createdAt.toISOString(),
        }
      : null,
  }));

  return (
    <div className="space-y-4">
      {!driverMailReady()&&<p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Novos acessos ficam pendentes até a plataforma configurar o envio de e-mail de ativação. Acessos existentes continuam disponíveis.</p>}
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Entregadores</h2>
        <p className="text-[0.8rem] text-ink-500">
          Frota, disponibilidade e acesso ao app do entregador.
        </p>
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
      />
      <DriverScheduleManager drivers={drivers} schedules={Object.fromEntries(drivers.map(driver => [driver.id, readDriverSchedule(settings, driver.id)]))} />
      <DriverInstall compact />
      <DriverInstallShare storeSlug={invitationStore?.slug} />
    </div>
  );
}
