import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpenNow, type WeekdaySchedule } from '../src/lib/schedule';

test('horário comercial usa São Paulo independentemente do fuso do servidor', () => {
  const days: WeekdaySchedule[] = [{ weekday: 1, closed: false, periods: [{ open: '18:00', close: '23:00' }] }];
  assert.equal(isOpenNow(days, new Date('2026-10-19T22:00:00Z')), true);
  assert.equal(isOpenNow(days, new Date('2026-10-19T19:00:00Z')), false);
});
test('agenda explicitamente fechada não aceita pedidos', () => {
  assert.equal(isOpenNow([{ weekday: 1, closed: true, periods: [{ open: '00:00', close: '23:59' }] }], new Date('2026-10-19T22:00:00Z')), false);
  assert.equal(isOpenNow([]), null);
});
test('madrugada pertence ao período aberto no dia anterior', () => {
  const days: WeekdaySchedule[] = [{ weekday: 1, closed: false, periods: [{ open: '22:00', close: '02:00' }] }];
  assert.equal(isOpenNow(days, new Date('2026-10-20T04:00:00Z')), true);
  assert.equal(isOpenNow(days, new Date('2026-10-20T05:00:00Z')), false);
});
