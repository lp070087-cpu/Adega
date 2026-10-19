import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutSchema, manualOrderSchema, canTransition } from '../src/lib/validations/order';

const checkout = {
  slug: 'minha-adega', customerName: 'Cliente Teste', customerPhone: '11999999999',
  deliveryType: 'PICKUP', paymentMethod: 'CASH',
  items: [{ productId: 'product-a', quantity: 1 }],
};

test('retirada não exige endereço e conserva chave de repetição', () => {
  const key = '77b09f7b-cb4d-4d6b-966e-db3f008132d3';
  const result = checkoutSchema.parse({ ...checkout, idempotencyKey: key, total: 0.01 });
  assert.equal(result.idempotencyKey, key);
  assert.equal('total' in result, false);
});

test('entrega exige endereço e quantidades inválidas são recusadas', () => {
  assert.equal(checkoutSchema.safeParse({ ...checkout, deliveryType: 'DELIVERY' }).success, false);
  for (const quantity of [0, -1, 1.5, 100, Infinity, NaN]) {
    assert.equal(checkoutSchema.safeParse({ ...checkout, items: [{ productId: 'a', quantity }] }).success, false);
  }
});

test('troco em cartão e chave adulterada são recusados', () => {
  assert.equal(checkoutSchema.safeParse({ ...checkout, paymentMethod: 'CREDIT_CARD', changeFor: 50 }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...checkout, idempotencyKey: 'qualquer' }).success, false);
});

test('pedidos terminais não reabrem e pedido novo não pula preparação', () => {
  assert.equal(canTransition('DELIVERED', 'CONFIRMED'), false);
  assert.equal(canTransition('CANCELLED', 'READY'), false);
  assert.equal(canTransition('NEW', 'DELIVERED'), false);
  assert.equal(canTransition('NEW', 'CONFIRMED'), true);
});

test('pagamento online sem integração não pode criar pedido público', () => {
  assert.equal(checkoutSchema.safeParse({ ...checkout, paymentMethod: 'ONLINE' }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...checkout, paymentMethod: 'PIX' }).success, true);
});

test('pedido manual exige cliente real e aceita apenas origens internas', () => {
  const manual = { ...checkout, source: 'COUNTER' };
  assert.equal(manualOrderSchema.safeParse(manual).success, true);
  assert.equal(manualOrderSchema.safeParse({ ...manual, source: 'IFOOD' }).success, false);
  assert.equal(manualOrderSchema.safeParse({ ...manual, customerPhone: undefined }).success, false);
  assert.equal(manualOrderSchema.safeParse({ ...manual, customerName: undefined }).success, false);
});