import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCommercialAccess, type CommercialContract } from '../src/lib/commercial-policy';
import { can, permissionsOf } from '../src/lib/permissions';
const now = new Date('2026-10-19T12:00:00Z');
const contract: CommercialContract = { status: 'ACTIVE', enforceAccess: true, dueAt: new Date('2026-10-20T12:00:00Z'), trialEndsAt: null, graceDays: 2 };
test('existing stores without an opted-in contract stay accessible', () => {
  assert.equal(evaluateCommercialAccess(null, now).allowNewOrders, true);
  assert.equal(evaluateCommercialAccess({ ...contract, status: 'SUSPENDED', enforceAccess: false }, now).allowNewOrders, true);
});
test('active and valid trial contracts permit new orders', () => {
  assert.equal(evaluateCommercialAccess(contract, now).allowNewOrders, true);
  assert.equal(evaluateCommercialAccess({ ...contract, status: 'TRIAL', trialEndsAt: new Date('2026-10-21') }, now).allowNewOrders, true);
});
test('grace period warns before restricting new orders', () => {
  const grace = evaluateCommercialAccess({ ...contract, dueAt: new Date('2026-10-18T12:00:00Z') }, now);
  assert.equal(grace.allowNewOrders, true);
  assert.ok(grace.message);
  assert.equal(evaluateCommercialAccess({ ...contract, dueAt: new Date('2026-10-15T12:00:00Z') }, now).allowNewOrders, false);
});
test('suspension and cancellation restrict new orders only after explicit opt-in', () => {
  for (const status of ['SUSPENDED', 'CANCELLED']) assert.equal(evaluateCommercialAccess({ ...contract, status }, now).allowNewOrders, false);
});
test('tenant owners and administrators cannot administer platform integrations', () => {
  for (const role of ['OWNER', 'ADMIN', 'MANAGER', 'PLATFORM_ADMIN'] as const) {
    assert.equal(can(role, 'MANAGE_INTEGRATIONS'), false);
    assert.equal(permissionsOf(role).includes('MANAGE_INTEGRATIONS'), false);
  }
});
