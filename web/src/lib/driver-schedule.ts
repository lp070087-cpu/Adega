import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const DRIVER_DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export type DriverShift = { day: number; start: string; end: string; breaks: { start: string; end: string }[] };
export type DriverSchedule = { enabled: boolean; timezone: string; shifts: DriverShift[] };
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
function span(shift: DriverShift) { const start = minutes(shift.start); let end = minutes(shift.end); if (end < start) end += 1440; return { start, end }; }
function pauseSpan(pause: { start: string; end: string }, start: number) { let a = minutes(pause.start); if (a < start) a += 1440; let b = minutes(pause.end); if (b < start || b < a) b += 1440; return { start: a, end: b }; }
export const driverScheduleSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; } }, 'Fuso horário inválido.'),
  shifts: z.array(z.object({ day: z.number().int().min(0).max(6), start: time, end: time, breaks: z.array(z.object({ start: time, end: time })).max(4) })).max(28),
}).superRefine((value, ctx) => {
  const ranges: { start: number; end: number }[] = [];
  value.shifts.forEach((shift, index) => {
    const range = span(shift); const path = ['shifts', index];
    if (range.start === range.end) ctx.addIssue({ code: 'custom', path, message: 'Início e fim do turno devem ser diferentes.' });
    const pauses = shift.breaks.map(pause => pauseSpan(pause, range.start)).sort((a, b) => a.start - b.start);
    if (pauses.some((pause, i) => pause.start < range.start || pause.end > range.end || pause.start >= pause.end || (i > 0 && pause.start < pauses[i - 1].end))) ctx.addIssue({ code: 'custom', path, message: 'Intervalos devem estar dentro do turno e não podem se sobrepor.' });
    ranges.push({ start: shift.day * 1440 + range.start, end: shift.day * 1440 + range.end });
  });
  const normalized = [...ranges, ...ranges.map(range => ({ start: range.start + 10080, end: range.end + 10080 }))].sort((a, b) => a.start - b.start);
  if (normalized.some((range, i) => i > 0 && range.start < normalized[i - 1].end)) ctx.addIssue({ code: 'custom', path: ['shifts'], message: 'Os turnos não podem se sobrepor, inclusive na virada do dia.' });
});

export const EMPTY_DRIVER_SCHEDULE: DriverSchedule = { enabled: false, timezone: 'America/Sao_Paulo', shifts: [] };
export function readDriverSchedule(settings: unknown, driverId: string): DriverSchedule {
  const root = settings && typeof settings === 'object' ? settings as Record<string, any> : {};
  const source = root.driverSchedules?.[driverId];
  const parsed = driverScheduleSchema.safeParse(source);
  // Missing configuration preserves legacy access. Invalid enabled config fails closed.
  return parsed.success ? parsed.data : source?.enabled ? { ...EMPTY_DRIVER_SCHEDULE, enabled: true } : EMPTY_DRIVER_SCHEDULE;
}
export function driverLocalDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  return { date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), minute: Number(part('hour')) * 60 + Number(part('minute')) };
}
export function driverShiftAvailability(schedule: DriverSchedule, now = new Date()): { allowed: boolean; label: string } {
  if (!schedule.enabled) return { allowed: true, label: 'Sem restrição de escala' };
  const local = driverLocalDate(now, schedule.timezone); const point = local.weekday * 1440 + local.minute;
  for (const shift of schedule.shifts) {
    const range = span(shift); const start = shift.day * 1440 + range.start; const end = shift.day * 1440 + range.end;
    for (const check of [point, point + 10080]) {
      if (check >= start && check < end) {
        const paused = shift.breaks.some(pause => { const p = pauseSpan(pause, range.start); return check >= shift.day * 1440 + p.start && check < shift.day * 1440 + p.end; });
        return { allowed: !paused, label: paused ? 'Em intervalo' : `Em escala até ${shift.end}` };
      }
    }
  }
  return { allowed: false, label: 'Fora da escala' };
}
export function tomorrowDriverShifts(schedule: DriverSchedule, now = new Date()) {
  const local = driverLocalDate(now, schedule.timezone); const tomorrow = new Date(`${local.date}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return { date: tomorrow.toISOString().slice(0, 10), shifts: schedule.enabled ? schedule.shifts.filter(s => s.day === tomorrow.getUTCDay()) : [] };
}
