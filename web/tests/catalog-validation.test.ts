import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { productPriceSchema } from '../src/lib/validations/catalog';

test('inline price edit accepts a product without promotion (null) and still rejects bad values', () => {
  assert.equal(productPriceSchema.safeParse({ productId: 'p1', price: 13.5, promotionalPrice: null }).success, true);
  assert.equal(productPriceSchema.safeParse({ productId: 'p1', price: 13.5 }).success, true);
  assert.equal(productPriceSchema.safeParse({ productId: 'p1', price: 13.5, promotionalPrice: 9.9 }).success, true);
  assert.equal(productPriceSchema.safeParse({ productId: 'p1', price: 'abc' }).success, false);
});

test('generic validation messages reach the user in Portuguese, not English', () => {
  const result = z.object({ value: z.union([z.number(), z.string()]), name: z.string() }).safeParse({ value: true });
  assert.equal(result.success, false);
  const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
  assert.ok(messages.every((message) => !/invalid|required|expected/i.test(message)), messages.join(' | '));
});
