import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { OperationError } from '../src/lib/operation-error';
import { z } from 'zod';
import { stockDefaults } from '../src/lib/stock-policy';
function harness({ authorized = true, stock = 0, history = 0, trackStock = true, foreign = false } = {}) {
  const writes: any[] = [];
  const tx = { product: { findMany: async ({ where }: any) => { assert.equal(where.organizationId, 'own'); return foreign ? [] : [{ id: 'p', name: 'Produto', stock, trackStock }]; }, updateMany: async (data: any) => writes.push(data) }, inventoryMovement: { findMany: async ({ where }: any) => { assert.equal(where.organizationId, 'own'); return history ? [{ productId: 'p' }] : []; }, createMany: async (data: any) => writes.push(data) } };
  const module = { exports: {} as any };
  const imports: Record<string, any> = { '@/lib/operation-error': { OperationError }, zod: { z }, 'next/cache': { revalidatePath() {} }, '@/lib/stock-policy': { stockDefaults }, '@/lib/auth/guards': { requirePermission: async () => { if (!authorized) throw new Error('Forbidden'); return { organizationId: 'own', user: { id: 'actor' } }; }, toActionError: (e: Error) => ({ error: e.message }) }, '@/lib/data/transaction': { withOrganizationTransaction: async (id: string, fn: any) => { assert.equal(id, 'own'); return fn(tx); } } };
  const code = ts.transpileModule(readFileSync('src/app/actions/stock-initialization.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)((id: string) => { if (!(id in imports)) throw new Error(id); return imports[id]; }, module, module.exports);
  return { action: module.exports.initializeStockAction, writes };
}
const input = { ids: ['p'], initialStock: 25, minimumStock: 5, reason: 'Contagem física conferida', confirm: false };
test('stock defaults preserve configured zero and reject malformed limits', () => {
  assert.deepEqual(stockDefaults(null), { initialStock: 25, minimumStock: 5 });
  assert.deepEqual(stockDefaults({ inventoryDefaults: { initialStock: 0, minimumStock: -2 } }), { initialStock: 0, minimumStock: 5 });
});
test('stock initialization preview never writes and confirmation records actor and balance', async () => {
  const h = harness(); assert.equal((await h.action(input)).ok, true); assert.equal(h.writes.length, 0);
  assert.equal((await h.action({ ...input, confirm: true })).ok, true);
  assert.equal(h.writes[1].data[0].userId, 'actor'); assert.equal(h.writes[1].data[0].previousStock, 0); assert.equal(h.writes[1].data[0].newStock, 25);
});
test('existing balance, movement history or disabled stock control are preserved on confirmation', async () => {
  for (const config of [{ stock: 3 }, { history: 1 }, { trackStock: false }]) {
    const h = harness(config); assert.equal((await h.action({ ...input, confirm: true })).ok, false); assert.deepEqual(h.writes, []);
  }
});
test('stock initialization denies foreign resources, unauthorized actors and fractional quantities', async () => {
  for (const config of [{ foreign: true }, { authorized: false }]) { const h = harness(config); assert.equal((await h.action({ ...input, confirm: true })).ok, false); assert.deepEqual(h.writes, []); }
  const h = harness(); assert.equal((await h.action({ ...input, initialStock: 1.5, confirm: true })).ok, false); assert.deepEqual(h.writes, []);
});
