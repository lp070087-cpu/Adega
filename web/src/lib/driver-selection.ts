import { driverLocalDate, readDriverSchedule } from '@/lib/driver-schedule';

/**
 * Quem aparece no seletor operacional de entregador (cartão do pedido).
 *
 * A escala NÃO controla se o entregador pode trabalhar: ela só organiza a
 * lista da loja. Regra padrão "programados hoje": mostra quem tem turno na
 * escala do dia e quem está trabalhando agora (online ou em entrega); some
 * só quem está offline e fora da escala do dia. Se ninguém da
 * equipe tem escala ativa, mostra todos — senão a loja ficaria sem opções.
 * A regra "todos" ignora a escala. Os demais seguem visíveis em Entregadores.
 */
export type DriverSelectionRule = 'scheduled' | 'all';

export function readDriverSelectionRule(settings: unknown): DriverSelectionRule {
  const root = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  return root.driverSelection === 'all' ? 'all' : 'scheduled';
}

export function scheduledToday(settings: unknown, driverId: string, now = new Date()) {
  const schedule = readDriverSchedule(settings, driverId);
  if (!schedule.enabled) return false;
  const { weekday } = driverLocalDate(now, schedule.timezone);
  return schedule.shifts.some((shift) => shift.day === weekday);
}

export function operationalDrivers<T extends { id: string; activeOrders?: number; status?: string }>(drivers: T[], settings: unknown, now = new Date()) {
  const rule = readDriverSelectionRule(settings);
  const anySchedule = drivers.some((d) => readDriverSchedule(settings, d.id).enabled);
  if (rule === 'all' || !anySchedule) return { drivers, hidden: 0, rule, filtered: false };
  const visible = drivers.filter((d) => scheduledToday(settings, d.id, now) || (d.activeOrders ?? 0) > 0 || (d.status !== undefined && d.status !== 'OFFLINE'));
  return { drivers: visible, hidden: drivers.length - visible.length, rule, filtered: true };
}
