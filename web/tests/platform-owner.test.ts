import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, PLATFORM_TABLES, prepareOwner } from '../scripts/platform-owner';

function harness({ users = [{ id: 'approved', email: OWNER_EMAIL, active: true }], migrated = true, existing = null as any, owners = 0 } = {}) {
  const writes: string[] = [];
  const tx = { $executeRaw: async () => 1, user: { findUnique: async () => users[0] }, platformOperator: { findUnique: async () => existing, count: async () => owners, upsert: async () => { writes.push('operator'); return { id: 'operator' }; } }, platformAudit: { create: async () => { writes.push('audit'); } } };
  return { writes, db: { user: { findMany: async () => users }, $queryRaw: async () => migrated ? PLATFORM_TABLES.map(tablename => ({ tablename })) : [], $transaction: async (fn: any) => fn(tx) } };
}
test('owner inspection defaults to read only even before migration', async () => {
  const h = harness({ migrated: false }); const result = await prepareOwner(h.db);
  assert.equal(result.mode, 'READ_ONLY'); assert.equal(result.missingTables?.length, 6); assert.deepEqual(h.writes, []);
});
test('bootstrap refuses missing, inactive or duplicate account', async () => {
  for (const users of [[], [{ id: 'approved', email: OWNER_EMAIL, active: false }], [{ id: 'one', email: OWNER_EMAIL, active: true }, { id: 'two', email: OWNER_EMAIL, active: true }]]) {
    const h = harness({ users }); await assert.rejects(prepareOwner(h.db)); assert.deepEqual(h.writes, []);
  }
});
test('bootstrap requires migration, exact user ID and approval reference', async () => {
  for (const config of [{ migrated: false }, {}]) { const h = harness(config); await assert.rejects(prepareOwner(h.db, { apply: true, userId: 'wrong', approval: 'approved by owner' })); assert.deepEqual(h.writes, []); }
});
test('approved initial owner and audit are created together; repeated invocation does not write', async () => {
  const options = { apply: true, userId: 'approved', approval: 'specific approval ticket' };
  const h = harness(); assert.equal((await prepareOwner(h.db, options)).mode, 'GRANTED'); assert.deepEqual(h.writes, ['operator', 'audit']);
  const repeated = harness({ existing: { id: 'operator', role: 'OWNER', active: true } }); assert.equal((await prepareOwner(repeated.db, options)).mode, 'UNCHANGED'); assert.deepEqual(repeated.writes, []);
  const occupied = harness({ owners: 1 }); await assert.rejects(prepareOwner(occupied.db, options), /outro proprietário/); assert.deepEqual(occupied.writes, []);
});
