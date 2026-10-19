import assert from 'node:assert/strict';
import test from 'node:test';
import { nextDriverStep } from '../src/lib/validations/driver-flow';

test('delivery starts with arrival at the store, then pickup', () => {
  assert.equal(nextDriverStep({ status: 'ASSIGNED' }), 'ARRIVED_STORE');
  assert.equal(nextDriverStep({ status: 'ASSIGNED', arrivedAt: new Date() }), 'PICKED_UP');
});

test('delivery follows pickup, route, customer arrival and confirmation', () => {
  assert.equal(nextDriverStep({ status: 'PICKED_UP' }), 'STARTED');
  assert.equal(nextDriverStep({ status: 'IN_TRANSIT' }), 'ARRIVED_CUSTOMER');
  assert.equal(nextDriverStep({ status: 'ARRIVED' }), 'DELIVERED');
});

test('finished, failed, missing or unknown deliveries cannot progress', () => {
  assert.equal(nextDriverStep(null), null);
  for (const status of ['DELIVERED', 'FAILED', 'UNKNOWN']) {
    assert.equal(nextDriverStep({ status }), null);
  }
});
