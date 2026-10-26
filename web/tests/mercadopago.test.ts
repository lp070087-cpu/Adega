import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mapStatus, verifySignature } from '../src/lib/payments/mercadopago';

const secret = 'segredoDeTesteDoWebhook123';
const sign = (id: string, requestId: string, ts: number) => `ts=${ts},v1=${createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex')}`;

test('Mercado Pago: assinatura x-signature válida, adulterada, de outro segredo ou antiga', () => {
  const ts = Math.floor(Date.now() / 1000);
  assert.equal(verifySignature(secret, sign('123456', 'req-1', ts), 'req-1', '123456'), true);
  assert.equal(verifySignature(secret, sign('123456', 'req-1', ts), 'req-2', '123456'), false, 'request-id diferente');
  assert.equal(verifySignature(secret, sign('123456', 'req-1', ts), 'req-1', '999999'), false, 'outro pagamento');
  assert.equal(verifySignature('outroSegredo123456', sign('123456', 'req-1', ts), 'req-1', '123456'), false);
  assert.equal(verifySignature(secret, sign('123456', 'req-1', ts - 3600), 'req-1', '123456'), false, 'evento antigo');
  assert.equal(verifySignature(secret, null, 'req-1', '123456'), false);
  assert.equal(verifySignature(secret, 'ts=1,v1=zz', 'req-1', '123456'), false);
});

test('Mercado Pago: status do pagamento vira um único efeito no pedido', () => {
  assert.equal(mapStatus('approved'), 'PAID');
  assert.equal(mapStatus('rejected'), 'FAILED');
  assert.equal(mapStatus('cancelled'), 'FAILED');
  assert.equal(mapStatus('refunded'), 'REFUNDED');
  assert.equal(mapStatus('charged_back'), 'REFUNDED');
  assert.equal(mapStatus('pending'), null);
  assert.equal(mapStatus('in_process'), null);
});
