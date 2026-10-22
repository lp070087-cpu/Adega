import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getDrivers, getDriverSummary } from '@/lib/data/drivers';
import { DriversManager } from '@/components/drivers/DriversManager';
import type { DriverRow } from '@/components/drivers/DriversManager';
import { DriverScheduleManager } from '@/components/drivers/DriverScheduleManager';
import { getDriverSchedules } from '@/lib/data/driver-schedules';
import { readDriverSchedule } from '@/lib/driver-schedule';
import { headers } from 'next/headers';
import { createRegistrationLink,driverApplicationsReady,getRegistrationLink,listDriverApplications,pendingDriverApplicationCount,registrationPath } from '@/lib/data/driver-applications';
import { DriverApplicationsManager,DriverLinkCard } from '@/components/drivers/DriverApplicationsManager';

export const metadata = { title: 'Entregadores' };
export const dynamic = 'force-dynamic';

/**
 * Entregadores: colaboradores logísticos vinculados à loja (não equipe interna).
 * Um único link permanente por loja; solicitações, vínculos e escalas aqui.
 */
export default async function DriversPage() {
  const ctx = await requireOrgPage('MANAGE_DRIVERS');
  const applicationsEnabled=await driverApplicationsReady();
  const [existingLink,applications,pendingCount]=await Promise.all([getRegistrationLink(ctx.organizationId),listDriverApplications(ctx.organizationId),pendingDriverApplicationCount(ctx.organizationId)]);
  // The permanent link is created on first visit; a suspended/cancelled store simply shows none.
  const registrationLink=existingLink??(applicationsEnabled?await createRegistrationLink(ctx.organizationId).catch(()=>null):null);
  const head=await headers();const host=head.get('x-forwarded-host')??head.get('host');
  const origin=process.env.APP_PUBLIC_URL?.replace(/\/+$/,'')||(host?`${head.get('x-forwarded-proto')??'https'}://${host}`:null);
  const linkUrl=registrationLink&&origin?`${origin}${registrationPath(registrationLink)}`:null;

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
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Entregadores</h2>
        <p className="text-[0.8rem] text-ink-500">Colaboradores logísticos vinculados à loja, com acesso próprio ao app do entregador.</p>
      </div>
      <DriverLinkCard url={linkUrl} enabled={applicationsEnabled} pendingCount={pendingCount} />
      {pendingCount>200&&<p className="text-sm text-ink-500">Mostrando as 200 solicitações pendentes mais antigas de {pendingCount}. Ao decidir, as próximas serão carregadas.</p>}
      <DriverApplicationsManager enabled={applicationsEnabled} applications={applications.map(a=>({...a,createdAt:a.createdAt.toISOString(),user:{...a.user,emailVerified:a.user.emailVerified?.toISOString()??null},events:a.events.map(e=>({...e,createdAt:e.createdAt.toISOString()}))}))} approved={<DriversManager
        drivers={drivers}
        summary={{
          total: summary.total,
          active: summary.active,
          online: summary.online,
          busy: summary.busy,
          dispatchesToday: summary.dispatchesToday,
        }}
        canManage={can(ctx.role, 'MANAGE_DRIVERS')}
      />} scales={<DriverScheduleManager drivers={drivers} schedules={Object.fromEntries(drivers.map(driver => [driver.id, readDriverSchedule(settings, driver.id)]))} />} />
    </div>
  );
}
