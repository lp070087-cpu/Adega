import assert from 'node:assert/strict';
import test from 'node:test';
import { onboardingNumber } from '../src/lib/onboarding-number';
import { can, outranks } from '../src/lib/permissions';
import { moneyInputSchema } from '../src/lib/validations/common';

test('onboarding preserves decimal and Brazilian currency amounts', () => {
  for (const [input, expected] of [['29.90', 29.9], ['29,90', 29.9], ['1.299,90', 1299.9], ['8', 8]] as const) {
    assert.equal(onboardingNumber(input, 0), expected);
  }
  assert.equal(onboardingNumber(null, 8), 8);
  assert.equal(onboardingNumber('', 8), 8);
  assert.ok(Number.isNaN(onboardingNumber('invalid', 8)));
  assert.ok(Number.isNaN(onboardingNumber('Infinity', 8)));
});

test('operational roles cannot administer team or tenant settings', () => {
  for (const role of ['DRIVER', 'KITCHEN', 'ATTENDANT', 'DISPATCHER', 'MANAGER'] as const) {
    assert.equal(can(role, 'MANAGE_TEAM'), false);
    assert.equal(can(role, 'MANAGE_SETTINGS'), false);
  }
  assert.equal(can('DRIVER', 'MANAGE_ORDERS'), false);
  assert.equal(can('PLATFORM_ADMIN', 'MANAGE_TEAM'), false);
  assert.equal(outranks('ADMIN', 'OWNER'), false);
  assert.equal(can(undefined, 'MANAGE_PRODUCTS'), false);
});

test('money input preserves decimal amounts and rejects malformed values', () => {
  for (const input of ['29.90', '29,90', 'R$ 29,90', 29.9]) {
    assert.equal(moneyInputSchema.parse(input), 29.9);
  }
  assert.equal(moneyInputSchema.parse('1.299,90'), 1299.9);
  for (const input of ['', 'abc29', '29.9.0', '-1', 'Infinity']) {
    assert.equal(moneyInputSchema.safeParse(input).success, false);
  }
});
