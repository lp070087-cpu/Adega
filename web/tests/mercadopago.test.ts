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

test('Mercado Pago Checkout Pro: tentativa recusada não descarta a aprovada seguinte na mesma preferência', async () => {
  const ts = await import('typescript');
  const { readFileSync } = await import('node:fs');
  const rows = new Map<string, any>([['order-payment:o1', { provider: 'mercadopago', preferenceId: 'pref1', environment: 'sandbox', paymentId: '', billingType: 'CREDIT_CARD', invoiceUrl: null, pixPayload: null, pixImage: null, value: 50, createdAt: '' }]]);
  const order = { id: 'o1', total: 50, paymentStatus: 'PENDING' };
  const payments: Record<string, any> = { '111': { id: 111, status: 'rejected', external_reference: 'o1', transaction_amount: 50 }, '222': { id: 222, status: 'approved', external_reference: 'o1', transaction_amount: 50 } };
  const db: any = {
    organization: { findUnique: async () => ({ id: 'org', settings: { onlinePayment: { enabled: true, provider: 'mercadopago', encrypted: 'x' } } }) },
    order: {
      findFirst: async () => ({ ...order }),
      updateMany: async ({ where, data }: any) => { const from = where.paymentStatus; const ok = typeof from === 'string' ? order.paymentStatus === from : from.in.includes(order.paymentStatus); if (ok) order.paymentStatus = data.paymentStatus; return { count: ok ? 1 : 0 }; },
    },
    platformSetting: { findUnique: async ({ where }: any) => (rows.has(where.key) ? { value: rows.get(where.key) } : null), update: async ({ where, data }: any) => rows.set(where.key, data.value) },
    notification: { create: async () => undefined },
  };
  const imports: Record<string, unknown> = {
    'server-only': {}, '@/lib/db': { prisma: db }, '@/lib/crypto': { decryptJson: () => ({ accessToken: 'TEST-x', webhookSecret: 's' }), encryptJson: () => '' },
    '@/lib/platform/asaas-client': { AsaasError: Error, authenticateAsaasWebhook: () => false },
    '@/lib/payments/mercadopago': { mapStatus, verifySignature: () => true, fetchPayment: async (_s: unknown, id: string) => payments[id], createCardPreference: null, createPixPayment: null },
    '@/lib/payments/infinitepay': { checkInfinitePayPayment: null, createInfinitePayLink: null, infinitePayRef: null, validInfiniteTag: () => false },
  };
  const source = ts.transpileModule(readFileSync('src/lib/order-payments.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} as any };
  new Function('require', 'module', 'exports', source)((name: string) => { if (!(name in imports)) throw new Error(name); return imports[name]; }, mod, mod.exports);
  const hook = (id: string) => mod.exports.handleMercadoPagoWebhook('loja', { signature: 'x', requestId: 'r' }, id, { type: 'payment', data: { id } });
  assert.equal((await hook('111')).result, 'recusado');
  assert.equal(order.paymentStatus, 'FAILED');
  assert.equal((await hook('222')).result, 'pago');
  assert.equal(order.paymentStatus, 'PAID');
  assert.equal(rows.get('order-payment:o1').paymentId, '222', 'guarda o pagamento que quitou');
  payments['111'] = { ...payments['111'], status: 'refunded' };
  assert.equal((await hook('111')).result, 'estorno de outra tentativa');
  assert.equal(order.paymentStatus, 'PAID');
});
