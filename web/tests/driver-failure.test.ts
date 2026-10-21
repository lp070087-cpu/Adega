import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { OperationError } from '../src/lib/operation-error';

function harness(delivery: any = { id: 'delivery-a', status: 'IN_TRANSIT', notes: null }) {
  const calls: any[] = [];
  const tx = { order: { findFirst: async (q: any) => { calls.push(q); return delivery ? { id: 'order-a', displayId: 1, delivery, notes: null } : null; }, update: async (q: any) => calls.push(q), count: async () => 0 }, delivery: { update: async (q: any) => calls.push(q) }, driver: { update: async (q: any) => calls.push(q) }, notification: { create: async (q: any) => calls.push(q) } };
  const imports: Record<string, unknown> = { 'next/cache': { revalidatePath() {} }, '@/lib/operation-error': { OperationError }, '@/lib/auth/guards': { requireDriver: async () => ({ organizationId: 'org-a', driver: { id: 'driver-a', name: 'Motorista' } }), toActionError: (e: Error) => ({ error: e.message }) }, '@/lib/data/transaction': { withOrganizationTransaction: async (org: string, fn: any) => { assert.equal(org, 'org-a'); return fn(tx); } }, '@/lib/data/drivers': {}, '@/lib/data/driver-schedules': {}, '@/lib/driver-schedule': {}, '@/lib/validations/operations': {} };
  const module = { exports: {} as any };
  const code = ts.transpileModule(readFileSync('src/app/actions/drivers.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)((name: string) => { if (!(name in imports)) throw Error(name); return imports[name]; }, module, module.exports);
  return { action: module.exports.reportFailedDeliveryAction, calls };
}
test('failed driver attempt is scoped, returns to dispatch and does not settle payment or stock', async () => {
  const h = harness(); assert.equal((await h.action({ orderId: 'order-a', reason: 'Cliente ausente' })).ok, true);
  assert.deepEqual(h.calls[0].where, { id: 'order-a', organizationId: 'org-a', driverId: 'driver-a', status: 'DISPATCHED' });
  const order = h.calls.find(q => q.data?.status === 'READY'); assert.equal(order.data.driverId, null); assert.equal(order.data.dispatchedAt, null); assert.match(order.data.notes, /Cliente ausente/);
  assert.equal(h.calls.some(q => 'paymentStatus' in (q.data ?? {}) || 'stock' in (q.data ?? {})), false);
});
test('failure rejects short reasons and unassigned or already finished deliveries', async () => {
  const invalid = harness(); assert.equal((await invalid.action({ orderId: 'order-a', reason: 'x' })).ok, false); assert.equal(invalid.calls.length, 0);
  for (const delivery of [null, { id: 'delivery-a', status: 'DELIVERED' }, { id: 'delivery-a', status: 'FAILED' }]) { const h = harness(delivery); assert.equal((await h.action({ orderId: 'order-a', reason: 'Cliente ausente' })).ok, false); assert.equal(h.calls.length, 1); }
});
