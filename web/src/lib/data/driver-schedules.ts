import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { OperationError } from '@/lib/operation-error';
import { withOrganizationTransaction } from './transaction';
import { driverScheduleSchema, readDriverSchedule, driverShiftAvailability, tomorrowDriverShifts, type DriverSchedule } from '@/lib/driver-schedule';

export async function assertDriverOnShift(tx: Prisma.TransactionClient, organizationId: string, driverId: string, now = new Date()) {
  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const state = driverShiftAvailability(readDriverSchedule(organization?.settings, driverId), now);
  if (!state.allowed) throw new OperationError(`Entregador indisponível: ${state.label.toLowerCase()}.`);
}
export async function getDriverSchedules(organizationId: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  return organization?.settings ?? {};
}
function reminderId(organizationId: string, driverId: string, date: string) { return `driver-shift:${organizationId}:${driverId}:${date}`; }
async function syncReminder(tx: Prisma.TransactionClient, organizationId: string, driver: { id: string; name: string; userId: string | null; active: boolean }, schedule: DriverSchedule, now: Date) {
  const tomorrow = tomorrowDriverShifts(schedule, now); const id = reminderId(organizationId, driver.id, tomorrow.date);
  const current = await tx.notification.findUnique({ where: { id }, select: { message: true, userId: true } });
  if (!driver.active || !tomorrow.shifts.length) {
    if (current) await tx.notification.delete({ where: { id } });
    return 0;
  }
  const times = tomorrow.shifts.map(s => `${s.start}–${s.end}${s.breaks.length ? ` (intervalos: ${s.breaks.map(b => `${b.start}–${b.end}`).join(', ')})` : ''}`).join('; ');
  const message = `${driver.name}: ${tomorrow.date}, ${times}. Horário ${schedule.timezone}.`;
  const recipient = driver.userId;
  if (!current) await tx.notification.create({ data: { id, organizationId, userId: recipient, type: 'DELIVERY', title: 'Escala de amanhã', message, href: recipient ? '/entregador' : '/app/entregadores' } });
  else if (current.message !== message || current.userId !== recipient) await tx.notification.update({ where: { id }, data: { message, userId: recipient, read: false, href: recipient ? '/entregador' : '/app/entregadores' } });
  return 1;
}
export async function saveDriverSchedule(organizationId: string, userId: string, driverId: string, input: unknown) {
  const parsed = driverScheduleSchema.safeParse(input);
  if (!parsed.success) throw new OperationError(parsed.error.issues[0]?.message ?? 'Escala inválida.');
  return withOrganizationTransaction(organizationId, async tx => {
    const driver = await tx.driver.findFirst({ where: { id: driverId, organizationId }, select: { id: true, name: true, userId: true, active: true } });
    if (!driver) throw new OperationError('Entregador não encontrado.');
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    const settings = (organization?.settings && typeof organization.settings === 'object' && !Array.isArray(organization.settings) ? organization.settings : {}) as Record<string, Prisma.InputJsonValue>;
    const previous = readDriverSchedule(settings, driverId);
    const schedules = (settings.driverSchedules && typeof settings.driverSchedules === 'object' && !Array.isArray(settings.driverSchedules) ? settings.driverSchedules : {}) as Record<string, Prisma.InputJsonValue>;
    await tx.organization.update({ where: { id: organizationId }, data: { settings: { ...settings, driverSchedules: { ...schedules, [driverId]: parsed.data } } } });
    await syncReminder(tx, organizationId, driver, parsed.data, new Date());
    await tx.notification.create({ data: { organizationId, type: 'SYSTEM', title: 'Escala de entregador atualizada', message: `Operador ${userId} alterou a escala de ${driver.name}. Antes: ${JSON.stringify(previous)}. Depois: ${JSON.stringify(parsed.data)}.`, href: '/app/entregadores' } });
    return { ok: true as const };
  });
}
export async function generateTomorrowDriverReminders(organizationId: string, now = new Date(), driverId?: string) {
  return withOrganizationTransaction(organizationId, async tx => {
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    const drivers = await tx.driver.findMany({ where: { organizationId, ...(driverId ? { id: driverId } : {}) }, select: { id: true, name: true, userId: true, active: true } });
    let count = 0;
    for (const driver of drivers) count += await syncReminder(tx, organizationId, driver, readDriverSchedule(organization?.settings, driver.id), now);
    return count;
  });
}
