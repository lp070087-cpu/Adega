import test from 'node:test';
import assert from 'node:assert/strict';
import { operationalDrivers, readDriverSelectionRule, scheduledToday } from '../src/lib/driver-selection';

// 2026-10-26 é segunda-feira (dia 1) em São Paulo.
const monday = new Date('2026-10-26T15:00:00Z');
const shift = (day: number) => ({ enabled: true, timezone: 'America/Sao_Paulo', shifts: [{ day, start: '08:00', end: '18:00', breaks: [] }] });
const settings = { driverSchedules: { ana: shift(1), bia: shift(3) } };
const team = [{ id: 'ana', activeOrders: 0, status: 'OFFLINE' }, { id: 'bia', activeOrders: 0, status: 'OFFLINE' }, { id: 'caio', activeOrders: 2, status: 'BUSY' }, { id: 'davi', activeOrders: 0, status: 'OFFLINE' }, { id: 'eva', activeOrders: 0, status: 'ONLINE' }];

test('seletor mostra programados hoje e quem está trabalhando; esconde offline fora da escala', () => {
  const result = operationalDrivers(team, settings, monday);
  assert.deepEqual(result.drivers.map((d) => d.id), ['ana', 'caio', 'eva']);
  assert.equal(result.hidden, 2); assert.equal(result.filtered, true);
});

test('regra "todos" e equipe sem escala mostram todos', () => {
  assert.equal(operationalDrivers(team, { ...settings, driverSelection: 'all' }, monday).drivers.length, 5);
  assert.equal(operationalDrivers(team, {}, monday).drivers.length, 5);
  assert.equal(readDriverSelectionRule({}), 'scheduled');
});

test('escala desligada não conta como programado', () => {
  assert.equal(scheduledToday({ driverSchedules: { ana: { ...shift(1), enabled: false } } }, 'ana', monday), false);
  assert.equal(scheduledToday(settings, 'bia', monday), false);
});
