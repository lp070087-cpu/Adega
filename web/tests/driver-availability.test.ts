import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function harness(ongoing = 0, onShift = true) {
  let writes = 0; let checks = 0;
  const tx = { driver: { findFirst: async () => ({ id: 'driver', active: true, userId: 'driver-user' }), update: async () => { writes++; }, updateMany: async () => { writes++; return { count: 1 }; } }, order: { count: async (q: any) => { assert.equal(q.where.organizationId, 'org'); assert.equal(q.where.driverId, 'driver'); return ongoing; } }, organizationUser: { updateMany: async () => { writes++; } } };
  const imports: Record<string, unknown> = { 'server-only': {}, '@/lib/db': {}, '@/lib/auth/password': {}, '@/lib/data/transaction': { withOrganizationTransaction: async (org: string, fn: any) => { assert.equal(org, 'org'); return fn(tx); } }, '@/lib/platform/quotas': {}, '@/lib/driver-schedule': {}, '@/lib/data/driver-schedules': { assertDriverOnShift: async () => { checks++; if (!onShift) throw Error('Fora da escala'); } } };
  const module = { exports: {} as any }; const source = ts.transpileModule(readFileSync('src/lib/data/drivers.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', source)((name: string) => { if (!(name in imports)) throw Error(name); return imports[name]; }, module, module.exports);
  return { api: module.exports, writes: () => writes, checks: () => checks };
}
test('driver with ongoing orders cannot be manually made available or deactivated through either path', async () => {
  for (const method of ['status', 'deactivate', 'edit']) {
    const h = harness(1);
    await assert.rejects(method === 'status' ? h.api.setDriverStatus('org', 'driver', 'ONLINE') : method === 'deactivate' ? h.api.deactivateDriver('org', 'driver') : h.api.updateDriver('org', 'driver', { active: false }), /atribui/);
    assert.equal(h.writes(), 0);
  }
});
test('busy is derived from assignment; becoming available requires on-shift; going offline remains allowed', async () => {
  const busy = harness(); await assert.rejects(busy.api.setDriverStatus('org', 'driver', 'BUSY'), /atribuição/); assert.equal(busy.writes(), 0);
  const off = harness(0, false); await assert.rejects(off.api.setDriverStatus('org', 'driver', 'ONLINE'), /Fora da escala/); assert.equal(off.writes(), 0);
  await off.api.setDriverStatus('org', 'driver', 'OFFLINE'); assert.equal(off.writes(), 1); assert.equal(off.checks(), 1);
});
