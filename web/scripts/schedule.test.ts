import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpenNow, storeOpenState, STORE_OPEN_STATE_LABEL, type WeekdaySchedule } from '../src/lib/schedule';

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

test('estado efetivo distingue habilitação manual de abertura pela agenda sem alterar os horários', () => {
  const days: WeekdaySchedule[] = [{ weekday: 1, closed: false, periods: [{ open: '18:00', close: '23:00' }] }];
  const before = JSON.stringify(days);
  const closedTime = new Date('2026-10-19T19:00:00Z');
  assert.equal(storeOpenState('OPEN', days, closedTime), 'CLOSED_BY_SCHEDULE');
  assert.equal(STORE_OPEN_STATE_LABEL[storeOpenState('OPEN', days, closedTime)], 'Fechada agora');
  assert.equal(storeOpenState('OPEN', days, new Date('2026-10-19T22:00:00Z')), 'OPEN');
  assert.equal(storeOpenState('CLOSED', days, new Date('2026-10-19T22:00:00Z')), 'CLOSED');
  assert.equal(storeOpenState('PAUSED', days, new Date('2026-10-19T22:00:00Z')), 'PAUSED');
  assert.equal(storeOpenState('OPEN', [], closedTime), 'OPEN');
  assert.equal(JSON.stringify(days), before);
});
