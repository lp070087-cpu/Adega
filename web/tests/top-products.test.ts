import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTopProducts, zonedMidnight, zonedStart } from '../src/lib/top-products';

test('agrupa por produto, ordena por valor e junta o resto em Outros', () => {
  const lines = [
    { productId: 'a', productName: 'Heineken', quantity: 2, total: 13.98 },
    { productId: 'a', productName: 'Heineken', quantity: 1, total: 6.99 },
    ...['b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ productId: id, productName: `P${id}`, quantity: 1, total: 10 - i })),
  ];
  const r = groupTopProducts(lines, 5);
  assert.equal(r.slices[0].label, 'Heineken'); assert.equal(r.slices[0].quantity, 3); assert.equal(r.slices[0].total, 20.97);
  assert.equal(r.slices.length, 6); assert.match(r.slices[5].label, /^Outros \(2\)$/);
  assert.equal(r.total, 20.97 + 10 + 9 + 8 + 7 + 6 + 5);
  assert.ok(Math.abs(r.slices.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
});

test('com até 6 produtos não cria "Outros" para um item só', () => {
  const r = groupTopProducts(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ productId: id, productName: id, quantity: 1, total: 1 })), 5);
  assert.equal(r.slices.length, 6); assert.ok(!r.slices.some((s) => s.key === 'outros'));
});

test('início do dia e do mês no fuso de São Paulo', () => {
  assert.equal(zonedMidnight('2026-10-25', 'America/Sao_Paulo').toISOString(), '2026-10-25T03:00:00.000Z');
  assert.equal(zonedStart(new Date('2026-10-25T02:00:00Z'), 'America/Sao_Paulo', 'day').toISOString(), '2026-10-24T03:00:00.000Z');
  assert.equal(zonedStart(new Date('2026-10-25T15:00:00Z'), 'America/Sao_Paulo', 'month').toISOString(), '2026-10-01T03:00:00.000Z');
});
