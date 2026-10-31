import test from 'node:test';
import assert from 'node:assert/strict';
import { driverPayCents, earningsPeriodStart, parseMoneyCents, readDriverPayRule, type DriverPayRule } from '../src/lib/driver-earnings';

const base = { amountCents: 0, percent: 0, updatedAt: '2026-10-30T12:00:00.000Z', updatedBy: 'user-a' };
const fixed: DriverPayRule = { ...base, mode: 'FIXED', amountCents: 800 };
const percent: DriverPayRule = { ...base, mode: 'FEE_PERCENT', percent: 75 };

test('ganho vem da regra da loja, nunca do total do pedido', () => {
  assert.equal(driverPayCents(fixed, 1200), 800);
  assert.equal(driverPayCents(percent, 800), 600);
  assert.equal(driverPayCents({ ...percent, percent: 100 }, 800), 800);
  assert.equal(driverPayCents.length, 2);
});

test('regra inválida ou ausente não gera valor estimado', () => {
  assert.equal(readDriverPayRule(null), null);
  assert.equal(readDriverPayRule({}), null);
  assert.equal(readDriverPayRule({ driverPayRule: { ...base, mode: 'FIXED', amountCents: -1 } }), null);
  assert.equal(readDriverPayRule({ driverPayRule: { ...base, mode: 'FEE_PERCENT', percent: 101 } }), null);
  assert.equal(readDriverPayRule({ driverPayRule: fixed })?.amountCents, 800);
});

test('períodos seguem o fuso da loja e a semana começa na segunda', () => {
  // 30/10/2026 é sexta. 01:00 UTC ainda é dia 29 em São Paulo.
  const now = new Date('2026-10-31T01:00:00.000Z');
  assert.equal(earningsPeriodStart('today', now).toISOString(), '2026-10-30T03:00:00.000Z');
  const late = new Date('2026-10-30T02:00:00.000Z');
  assert.equal(earningsPeriodStart('today', late).toISOString(), '2026-10-29T03:00:00.000Z');
  assert.equal(earningsPeriodStart('week', late).toISOString(), '2026-10-26T03:00:00.000Z');
  assert.equal(earningsPeriodStart('month', late).toISOString(), '2026-10-01T03:00:00.000Z');
  // Domingo pertence à semana iniciada na segunda anterior.
  assert.equal(earningsPeriodStart('week', new Date('2026-11-01T15:00:00.000Z')).toISOString(), '2026-10-26T03:00:00.000Z');
});

test('valor em reais digitado pela loja vira centavos sem erro de arredondamento', () => {
  assert.equal(parseMoneyCents('8'), 800);
  assert.equal(parseMoneyCents('8,5'), 850);
  assert.equal(parseMoneyCents('1.234,56'), 123456);
  assert.equal(parseMoneyCents('abc'), null);
  assert.equal(parseMoneyCents('-1'), null);
});
