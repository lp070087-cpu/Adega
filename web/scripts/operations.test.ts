import test from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { summarizeShift, registerOrderInCash } from '../src/lib/data/cash';
import { deductOrderStock, restoreOrderStock } from '../src/lib/data/inventory';
import { updateOrderStatus, updatePaymentStatus } from '../src/lib/data/orders';
import { dayKey, startOfDay, endOfDay } from '../src/lib/utils';

test('caixa separa vendas eletrônicas do dinheiro da gaveta', () => {
  const totals = summarizeShift(100, [
    { type: 'SALE', paymentMethod: 'CASH', amount: 25.90 },
    { type: 'SALE', paymentMethod: 'PIX', amount: 40 },
    { type: 'SALE', paymentMethod: 'CREDIT_CARD', amount: 60 },
    { type: 'SUPPLY', paymentMethod: 'CASH', amount: 10 },
    { type: 'WITHDRAWAL', paymentMethod: 'CASH', amount: 20 },
    { type: 'REFUND', paymentMethod: 'CASH', amount: 5 },
  ]);
  assert.equal(totals.expectedCash, 110.90);
  assert.equal(totals.totalSales, 125.90);
});

test('período financeiro respeita a virada do dia em São Paulo', () => {
  const now = new Date('2026-10-20T01:30:00Z');
  assert.equal(dayKey(now), '2026-10-19');
  assert.equal(startOfDay(now).toISOString(), '2026-10-19T03:00:00.000Z');
  assert.equal(endOfDay(now).toISOString(), '2026-10-20T02:59:59.999Z');
});

function transaction(order: Record<string, unknown> | null, stock = 2) {
  const writes: string[] = [];
  const tx = {
    $queryRaw: async () => [{ id: 'tenant-a' }],
    order: { findFirst: async (args: any) => { assert.equal(args.where.organizationId, 'tenant-a'); return order; }, update: async () => { writes.push('order'); } },
    product: { findFirst: async (args: any) => { assert.equal(args.where.organizationId, 'tenant-a'); return { id: 'p', name: 'Produto', stock, trackStock: true }; }, update: async () => { writes.push('stock'); } },
    combo: { findFirst: async () => null },
    inventoryMovement: { create: async () => { writes.push('movement'); } },
    cashShift: { findFirst: async () => ({ id: 'shift' }) },
    cashTransaction: { findFirst: async () => ({ id: 'existing-sale' }), create: async () => { writes.push('sale'); } },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, writes };
}

test('estoque insuficiente rejeita baixa sem gravar saldo ou movimento', async () => {
  const { tx, writes } = transaction({ id: 'o', displayId: 1, stockDeducted: false, items: [{ productId: 'p', quantity: 3 }] });
  await assert.rejects(deductOrderStock('tenant-a', 'o', undefined, tx), /Estoque insuficiente/);
  assert.deepEqual(writes, []);
});

test('baixa repetida não duplica movimento', async () => {
  const { tx, writes } = transaction({ id: 'o', stockDeducted: true, items: [] });
  assert.equal((await deductOrderStock('tenant-a', 'o', undefined, tx)).alreadyDeducted, true);
  assert.deepEqual(writes, []);
});

test('pedido de outro tenant não pode gerar baixa', async () => {
  const { tx, writes } = transaction(null);
  await assert.rejects(deductOrderStock('tenant-a', 'foreign', undefined, tx), /Pedido não encontrado/);
  assert.deepEqual(writes, []);
});

test('venda já registrada não é lançada novamente em outro turno', async () => {
  const { tx, writes } = transaction({ id: 'o' });
  assert.equal((await registerOrderInCash('tenant-a', 'o', 'CASH', 20, tx)).registered, false);
  assert.deepEqual(writes, []);
});

test('pedido cancelado não pode voltar ao preparo', async () => {
  const { tx, writes } = transaction({ id: 'o', status: 'CANCELLED', deliveryType: 'DELIVERY' });
  await assert.rejects(updateOrderStatus('tenant-a', 'o', 'PREPARING', { transaction: tx }), /Transição/);
  assert.deepEqual(writes, []);
});

test('pagamento de pedido encerrado não pode divergir do caixa já lançado', async () => {
  const { tx, writes } = transaction({ id: 'o', status: 'DELIVERED' });
  await assert.rejects(updatePaymentStatus('tenant-a', 'o', 'PENDING', 'CASH', tx), /Pedido encerrado/);
  assert.deepEqual(writes, []);
});

test('retirada não pode ser despachada para entregador', async () => {
  const { tx, writes } = transaction({ id: 'o', status: 'READY', deliveryType: 'PICKUP' });
  await assert.rejects(updateOrderStatus('tenant-a', 'o', 'DISPATCHED', { transaction: tx }), /retirada/);
  assert.deepEqual(writes, []);
});

test('entrega não pode ser despachada sem entregador', async () => {
  const { tx, writes } = transaction({ id: 'o', status: 'READY', deliveryType: 'DELIVERY', driverId: null });
  await assert.rejects(updateOrderStatus('tenant-a', 'o', 'DISPATCHED', { transaction: tx }), /entregador/);
  assert.deepEqual(writes, []);
});

test('pedido confirmado baixa estoque uma vez e cancelamento restaura movimentos reais', async () => {
  const order = { id: 'o', displayId: 1, status: 'NEW', stockDeducted: false, notes: null,
    deliveryType: 'PICKUP', driverId: null, total: 40, paymentMethod: 'CASH',
    items: [{ productId: 'combo', quantity: 2 }] };
  const stock = new Map([['component', 10]]);
  const ledger: any[] = [];
  const tx: any = {
    $queryRaw: async () => [{ id: 'tenant-a' }],
    order: { findFirst: async () => order, update: async ({ data }: any) => Object.assign(order, data) },
    combo: { findFirst: async () => ({ items: [{ productId: 'component', quantity: 3 }] }) },
    product: {
      findFirst: async ({ where }: any) => ({ id: where.id, name: where.id, stock: stock.get(where.id) ?? 0, trackStock: where.id !== 'combo' }),
      update: async ({ where, data }: any) => stock.set(where.id, data.stock),
    },
    inventoryMovement: {
      create: async ({ data }: any) => ledger.push(data),
      count: async () => ledger.filter((m) => m.type === 'CANCELLATION').length,
      findMany: async () => ledger.filter((m) => m.type === 'SALE'),
    },
    delivery: { updateMany: async () => ({ count: 0 }) },
  };
  await updateOrderStatus('tenant-a', 'o', 'CONFIRMED', { transaction: tx });
  await updateOrderStatus('tenant-a', 'o', 'CONFIRMED', { transaction: tx });
  assert.equal(stock.get('component'), 4);
  assert.equal(ledger.length, 1);
  await updateOrderStatus('tenant-a', 'o', 'CANCELLED', { transaction: tx });
  await restoreOrderStock('tenant-a', 'o', undefined, tx);
  assert.equal(stock.get('component'), 10);
  assert.equal(ledger.length, 2);
});

test('retirada percorre preparo e conclusão com venda no mesmo contexto transacional', async () => {
  const order = { id: 'o', status: 'CONFIRMED', stockDeducted: true, deliveryType: 'PICKUP', driverId: null, paymentMethod: 'PIX', total: 29.90 };
  const sales: any[] = [];
  const tx: any = {
    $queryRaw: async () => [{ id: 'tenant-a' }],
    order: { findFirst: async () => order, update: async ({ data }: any) => Object.assign(order, data) },
    delivery: { updateMany: async () => ({ count: 0 }) },
    cashShift: { findFirst: async () => ({ id: 'shift' }) },
    cashTransaction: { findFirst: async () => sales[0] ?? null, create: async ({ data }: any) => sales.push(data) },
  };
  for (const status of ['PREPARING', 'READY', 'DELIVERED', 'DELIVERED'] as const) {
    await updateOrderStatus('tenant-a', 'o', status, { transaction: tx });
  }
  assert.equal(order.status, 'DELIVERED');
  assert.equal(sales.length, 1);
  assert.equal(sales[0].amount, 29.90);
});
