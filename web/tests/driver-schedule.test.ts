import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { OperationError } from '../src/lib/operation-error';
import * as schedules from '../src/lib/driver-schedule';

const schedule: schedules.DriverSchedule = { enabled: true, timezone: 'America/Sao_Paulo', shifts: [
  { day: 1, start: '09:00', end: '14:00', breaks: [{ start: '12:00', end: '12:30' }] },
  { day: 1, start: '18:00', end: '02:00', breaks: [{ start: '23:30', end: '00:15' }] },
  { day: 6, start: '23:00', end: '02:00', breaks: [] },
] };
test('weekly shift supports multiple shifts, breaks and overnight including Saturday into Sunday', () => {
  assert.equal(schedules.driverScheduleSchema.safeParse(schedule).success, true);
  for (const [instant, expected] of [['2026-10-19T12:00Z', true], ['2026-10-19T15:15Z', false], ['2026-10-19T17:00Z', false], ['2026-10-20T04:00Z', true], ['2026-10-20T03:00Z', false], ['2026-10-20T05:00Z', false], ['2026-10-25T04:00Z', true]] as const) assert.equal(schedules.driverShiftAvailability(schedule, new Date(instant)).allowed, expected, instant);
});
test('shift validation rejects overlaps across midnight and invalid/outside/overlapping breaks', () => {
  const base = { ...schedule, shifts: [schedule.shifts[1]] };
  for (const shifts of [
    [...base.shifts, { day: 2, start: '01:00', end: '04:00', breaks: [] }],
    [{ day: 1, start: '09:00', end: '09:00', breaks: [] }],
    [{ day: 1, start: '09:00', end: '17:00', breaks: [{ start: '08:00', end: '10:00' }] }],
    [{ day: 1, start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }, { start: '12:30', end: '14:00' }] }],
    [{ day: 6, start: '23:00', end: '03:00', breaks: [] }, { day: 0, start: '02:00', end: '04:00', breaks: [] }],
  ]) assert.equal(schedules.driverScheduleSchema.safeParse({ ...schedule, shifts }).success, false);
});
test('missing schedules preserve legacy availability; enabled empty or corrupted schedules fail closed', () => {
  assert.equal(schedules.driverShiftAvailability(schedules.readDriverSchedule({}, 'a')).allowed, true);
  assert.equal(schedules.driverShiftAvailability(schedules.readDriverSchedule({ driverSchedules: { a: { enabled: true, invalid: true } } }, 'a')).allowed, false);
  assert.equal(schedules.driverShiftAvailability({ ...schedule, shifts: [] }).allowed, false);
  assert.equal(schedules.driverShiftAvailability(schedules.readDriverSchedule({ driverSchedules: { a: schedule } }, 'b')).allowed, true);
});
test('tomorrow is computed in schedule timezone across month/year boundaries', () => {
  const value = schedules.tomorrowDriverShifts(schedule, new Date('2027-01-01T02:00:00Z'));
  assert.equal(value.date, '2027-01-01');
});

function harness({ foreign = false } = {}) {
  let settings: any = { preserve: { brand: 'original' }, driverSchedules: { other: { ...schedule, enabled: false } } };
  const notifications = new Map<string, any>(); const writes: any[] = []; let n = 0;
  const driver = { id: 'driver-a', name: 'Motorista', userId: 'driver-user', active: true };
  const tx: any = { organization: { findUnique: async () => ({ settings }), update: async (q: any) => { settings = q.data.settings; writes.push(q); } }, driver: { findFirst: async (q: any) => { assert.equal(q.where.organizationId, 'org-a'); return foreign ? null : driver; }, findMany: async (q: any) => { assert.equal(q.where.organizationId, 'org-a'); return [driver]; } }, notification: { findUnique: async (q: any) => notifications.get(q.where.id) ?? null, create: async (q: any) => { const data = { ...q.data, id: q.data.id ?? `audit-${++n}` }; notifications.set(data.id, data); writes.push(q); }, update: async (q: any) => { notifications.set(q.where.id, { ...notifications.get(q.where.id), ...q.data }); writes.push(q); }, delete: async (q: any) => { notifications.delete(q.where.id); writes.push(q); } } };
  const imports: Record<string, unknown> = { 'server-only': {}, '@/lib/db': { prisma: {} }, '@/lib/operation-error': { OperationError }, './transaction': { withOrganizationTransaction: async (org: string, work: any) => { assert.equal(org, 'org-a'); return work(tx); } }, '@/lib/driver-schedule': schedules };
  const module = { exports: {} as any }; const code = ts.transpileModule(readFileSync('src/lib/data/driver-schedules.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)((name: string) => { if (!(name in imports)) throw Error(name); return imports[name]; }, module, module.exports);
  return { api: module.exports, tx, notifications, writes, settings: () => settings };
}
test('saving own driver schedule preserves unrelated settings and records operator history; foreign driver is rejected', async () => {
  const h = harness(); await h.api.saveDriverSchedule('org-a', 'operator-a', 'driver-a', schedule);
  assert.deepEqual(h.settings().preserve, { brand: 'original' }); assert.equal(h.settings().driverSchedules.other.enabled, false); assert.deepEqual(h.settings().driverSchedules['driver-a'], schedule);
  assert.equal([...h.notifications.values()].some(n => n.message.includes('operator-a')), true);
  const foreign = harness({ foreign: true }); await assert.rejects(foreign.api.saveDriverSchedule('org-a', 'operator-a', 'foreign', schedule), /não encontrado/); assert.equal(foreign.writes.length, 0);
});
test('tomorrow reminder is idempotent, updated when shift changes and removed when day becomes off', async () => {
  const h = harness(); const now = new Date('2026-10-18T15:00:00Z');
  await h.api.saveDriverSchedule('org-a', 'operator-a', 'driver-a', schedule);
  await h.api.generateTomorrowDriverReminders('org-a', now); const initialWrites = h.writes.length;
  await h.api.generateTomorrowDriverReminders('org-a', now); assert.equal(h.writes.length, initialWrites);
  const reminder = [...h.notifications.values()].find(n => n.id === 'driver-shift:org-a:driver-a:2026-10-19'); assert.equal(reminder.userId, 'driver-user'); assert.match(reminder.message, /09:00/);
  h.settings().driverSchedules['driver-a'].shifts[0].start = '10:00'; await h.api.generateTomorrowDriverReminders('org-a', now); assert.match(h.notifications.get(reminder.id).message, /10:00/);
  h.settings().driverSchedules['driver-a'].enabled = false; await h.api.generateTomorrowDriverReminders('org-a', now); assert.equal(h.notifications.has(reminder.id), false);
});
