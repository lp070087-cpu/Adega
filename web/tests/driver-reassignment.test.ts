import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { OperationError } from '../src/lib/operation-error';
import * as crypto from 'node:crypto';
function harness({ nextAvailable = true, pickedUp = false, foreign = false, pendingAccess=false } = {}) {
  let state: any = { order: { id: 'order', displayId: 8, status: 'WAITING_DRIVER', driverId: 'old', deliveryType: 'DELIVERY', total: 40, paymentStatus: 'PENDING', stockDeducted: true }, delivery: { driverId: 'old', status: pickedUp ? 'PICKED_UP' : 'ASSIGNED', notes: 'Observação anterior' }, drivers: { old: { id: 'old', name: 'Antigo', status: 'BUSY', userId: 'old-user' }, next: { id: 'next', name: 'Novo', status: nextAvailable ? 'ONLINE' : 'OFFLINE', userId: 'next-user' } }, notifications: [] };
  let outerTransactions = 0; let nested = 0;
  if(pendingAccess)state.drivers.next.user={active:true,mustChangePassword:true,organizations:[{id:'own-membership'}]};
  const tx: any = { order: {
    findFirst: async (q: any) => { assert.equal(q.where.organizationId, 'org'); return foreign ? null : { ...state.order, delivery: { ...state.delivery } }; },
    update: async (q: any) => { Object.assign(state.order, q.data); },
    count: async (q: any) => { assert.equal(q.where.organizationId, 'org'); if (!nextAvailable && q.where.driverId === 'next') return 0; return state.order.driverId === q.where.driverId && ['WAITING_DRIVER', 'DISPATCHED'].includes(state.order.status) ? 1 : 0; },
  }, driver: { findFirst: async (q: any) => { assert.equal(q.where.organizationId, 'org'); return { ...state.drivers[q.where.id] }; }, findUnique: async (q: any) => ({ ...state.drivers[q.where.id] }), update: async (q: any) => { Object.assign(state.drivers[q.where.id], q.data); } }, delivery: { updateMany: async (q: any) => { assert.equal(q.where.organizationId, 'org'); Object.assign(state.delivery, q.data); }, upsert: async (q: any) => { Object.assign(state.delivery, q.update); }, findUnique: async () => ({ ...state.delivery }), update: async (q: any) => { Object.assign(state.delivery, q.data); } }, notification: { create: async (q: any) => state.notifications.push(q.data) } };
  const imports: Record<string, unknown> = { 'server-only': {}, '@/lib/data/driver-earnings': { recordDriverEarning: async () => undefined }, 'node:crypto': crypto, '@/lib/operation-error': { OperationError }, '@/lib/db': {}, '@/lib/utils': {}, '@/lib/schedule': {}, '@/lib/data/inventory': {}, '@/lib/data/cash': {}, '@/lib/customer-portal/mail': { portalVerifiedFilter: () => ({}) }, '@/lib/validations/order': {}, '@/lib/platform/access': {}, '@/lib/data/growth': {}, '@/lib/data/delivery-fee': {}, '@/lib/order-flow': { readAutoAccept: () => false }, '@/lib/data/transaction': { withOrganizationTransaction: async (org: string, fn: any, passed?: unknown) => {
    assert.equal(org, 'org'); if (passed) { assert.equal(passed, tx); nested++; return fn(tx); }
    outerTransactions++; const backup = structuredClone(state); try { return await fn(tx); } catch (error) { state = backup; throw error; }
  } } };
  const module = { exports: {} as any }; const code = ts.transpileModule(readFileSync('src/lib/data/orders.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)((name: string) => { if (!(name in imports)) throw Error(name); return imports[name]; }, module, module.exports);
  return { api: module.exports, state: () => state, transactions: () => ({ outerTransactions, nested }) };
}
test('driver reassignment composes remove/assign in one transaction and preserves order accounting and delivery notes', async () => {
  const h = harness(); await h.api.reassignDriver('org', 'order', 'next', 'operator-user', 'Troca de turno');
  assert.deepEqual(h.transactions(), { outerTransactions: 1, nested: 2 });
  assert.equal(h.state().order.driverId, 'next'); assert.equal(h.state().drivers.old.status, 'ONLINE'); assert.equal(h.state().drivers.next.status, 'BUSY');
  assert.equal(h.state().order.total, 40); assert.equal(h.state().order.paymentStatus, 'PENDING'); assert.equal(h.state().order.stockDeducted, true);
  assert.match(h.state().delivery.notes, /Observação anterior/); assert.match(h.state().delivery.notes, /operator-user.*old.*next.*Troca de turno/);
});
test('reassignment rejects foreign/picked-up orders and invalid reason; pending-access replacement rolls back old assignment', async () => {
  // Offline não bloqueia mais: a escala organiza e o app abre disponível.
  const offline = harness({ nextAvailable: false }); await offline.api.reassignDriver('org', 'order', 'next', 'operator-user', 'Troca de turno'); assert.equal(offline.state().order.driverId, 'next');
  for (const options of [{ pickedUp: true }, { foreign: true },{pendingAccess:true}]) {
    const h = harness(options); const initial = structuredClone(h.state()); await assert.rejects(h.api.reassignDriver('org', 'order', 'next', 'operator-user', 'Troca de turno')); assert.deepEqual(h.state(), initial);
  }
  const h = harness(); await assert.rejects(h.api.reassignDriver('org', 'order', 'next', 'operator-user', 'x')); assert.equal(h.transactions().outerTransactions, 0);
});
