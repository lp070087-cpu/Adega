import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getDrivers, getDriverSummary } from '@/lib/data/drivers';
import { DriversManager } from '@/components/drivers/DriversManager';
import type { DriverRow } from '@/components/drivers/DriversManager';

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

  const [driversRaw, summary] = await Promise.all([
    getDrivers(ctx.organizationId),
    getDriverSummary(ctx.organizationId),
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
    email: driver.email,
    username: driver.username,
    activeOrders: driver.activeOrders,
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
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Entregadores</h2>
        <p className="text-[0.8rem] text-ink-500">
          Frota, status em tempo real e o acesso de cada um ao app.
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
    </div>
  );
}
