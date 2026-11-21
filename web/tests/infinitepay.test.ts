import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { checkInfinitePayPayment, createInfinitePayLink, normalizeInfiniteTag, validInfiniteTag } from '../src/lib/payments/infinitepay';
import * as infinitepay from '../src/lib/payments/infinitepay';

type Call = { url: string; body: any };
function fakeFetch(responses: Array<{ status?: number; json: unknown }>, calls: Call[] = []) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    const next = responses.shift() ?? { json: {} };
    return new Response(JSON.stringify(next.json), { status: next.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

test('InfiniteTag: aceita como o lojista digita e recusa formatos perigosos', () => {
  assert.equal(normalizeInfiniteTag('  $MinhaAdega '), 'minhaadega');
  assert.ok(validInfiniteTag('minha.adega_24'));
  for (const bad of ['', 'a b', '../x', 'loja?x=1', '$loja', '-loja', 'x'.repeat(61)]) assert.equal(validInfiniteTag(bad), false, bad);
});

test('InfinitePay: link criado com handle, valor em centavos, volta e webhook da loja', async () => {
  const calls: Call[] = [];
  const url = await createInfinitePayLink({ handle: 'minhaadega', orderNsu: 'cord1', amountCents: 4790, description: 'Pedido #12 · Adega', redirectUrl: 'https://app.example/loja/a/pedido/cord1', webhookUrl: 'https://app.example/api/webhooks/pedidos/infinitepay/a', customer: { name: 'Ana', phone_number: '+5511999990000' } }, fakeFetch([{ json: { url: 'https://checkout.infinitepay.io/minhaadega?lenc=abc' } }], calls));
  assert.equal(url, 'https://checkout.infinitepay.io/minhaadega?lenc=abc');
  assert.equal(calls[0].url, 'https://api.checkout.infinitepay.io/links');
  assert.deepEqual(calls[0].body.items, [{ quantity: 1, price: 4790, description: 'Pedido #12 · Adega' }]);
  assert.equal(calls[0].body.handle, 'minhaadega');
  assert.equal(calls[0].body.order_nsu, 'cord1');
  assert.equal(calls[0].body.webhook_url, 'https://app.example/api/webhooks/pedidos/infinitepay/a');
  await assert.rejects(createInfinitePayLink({ handle: 'minhaadega', orderNsu: 'x', amountCents: 4790, description: 'x', redirectUrl: 'https://a', webhookUrl: 'https://a' }, fakeFetch([{ json: { url: 'https://evil.example/pay' } }])), /não respondeu/);
  await assert.rejects(createInfinitePayLink({ handle: 'naoexiste', orderNsu: 'x', amountCents: 4790, description: 'x', redirectUrl: 'https://a', webhookUrl: 'https://a' }, fakeFetch([{ status: 404, json: {} }])), /recusou/);
  await assert.rejects(createInfinitePayLink({ handle: 'loja', orderNsu: 'x', amountCents: 50, description: 'x', redirectUrl: 'https://a', webhookUrl: 'https://a' }, fakeFetch([])), /mínimo/);
});

test('InfinitePay: payment_check lê pago/valor e trata dados errados como não pago', async () => {
  const paid = await checkInfinitePayPayment({ handle: 'loja', orderNsu: 'o', transactionNsu: 't', slug: 's' }, fakeFetch([{ json: { success: true, paid: true, amount: 1500, paid_amount: 1510, installments: 1, capture_method: 'pix' } }]));
  assert.deepEqual(paid, { success: true, paid: true, amount: 1500, paidAmount: 1510, captureMethod: 'pix' });
  const wrong = await checkInfinitePayPayment({ handle: 'loja', orderNsu: 'o', transactionNsu: 't', slug: 's' }, fakeFetch([{ json: { success: false, paid: false } }]));
  assert.equal(wrong.paid, false);
  await assert.rejects(checkInfinitePayPayment({ handle: 'loja', orderNsu: 'o', transactionNsu: 't', slug: 's' }, fakeFetch([{ status: 503, json: {} }])), /503/);
});

function loadOrderPayments(db: any) {
  const imports: Record<string, unknown> = {
    'server-only': {}, '@/lib/db': { prisma: db }, '@/lib/crypto': { decryptJson: () => ({}), encryptJson: () => '' },
    '@/lib/platform/asaas-client': { AsaasError: Error, authenticateAsaasWebhook: () => false },
    '@/lib/payments/mercadopago': { mapStatus: () => null, verifySignature: () => false, fetchPayment: null, createCardPreference: null, createPixPayment: null },
    '@/lib/payments/infinitepay': infinitepay,
  };
  const source = ts.transpileModule(readFileSync('src/lib/order-payments.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} as any };
  new Function('require', 'module', 'exports', source)((name: string) => { if (!(name in imports)) throw new Error(name); return imports[name]; }, mod, mod.exports);
  return mod.exports;
}

test('InfinitePay: configuração da loja só com a InfiniteTag, sem sandbox', () => {
  const m = loadOrderPayments({});
  const config = m.readOnlinePayment({ onlinePayment: { enabled: true, provider: 'infinitepay', handle: 'minhaadega' } });
  assert.equal(config.provider, 'infinitepay');
  assert.equal(config.environment, 'production');
  assert.equal(m.onlinePaymentUsable(config), true);
  assert.equal(m.onlinePaymentUsable(m.readOnlinePayment({ onlinePayment: { enabled: true, provider: 'infinitepay', handle: '../x' } })), false, 'tag inválida desliga');
  assert.equal(m.onlinePaymentUsable(m.readOnlinePayment({ onlinePayment: { enabled: false, provider: 'infinitepay', handle: 'loja' } })), false);
});

test('InfinitePay: só marca pago com payment_check pago e valor certo; repetir não duplica', async () => {
  const order = { id: 'cord1', total: 47.9, paymentStatus: 'PENDING', displayId: 12, organizationId: 'org' };
  const rows = new Map<string, any>([['order-payment:cord1', { provider: 'infinitepay', environment: 'production', paymentId: '', billingType: 'PIX', invoiceUrl: 'https://checkout.infinitepay.io/x', pixPayload: null, pixImage: null, value: 47.9, createdAt: '' }]]);
  let notifications = 0;
  const db: any = {
    organization: { findUnique: async ({ where }: any) => (where.slug === 'adega' ? { id: 'org', settings: { onlinePayment: { enabled: true, provider: 'infinitepay', handle: 'minhaadega' } } } : null) },
    order: {
      findFirst: async ({ where }: any) => (where.id === order.id && where.organizationId === order.organizationId ? { ...order } : null),
      updateMany: async ({ where, data }: any) => { const ok = where.paymentStatus.in.includes(order.paymentStatus); if (ok) order.paymentStatus = data.paymentStatus; return { count: ok ? 1 : 0 }; },
    },
    platformSetting: { findUnique: async ({ where }: any) => (rows.has(where.key) ? { value: rows.get(where.key) } : null), update: async ({ where, data }: any) => rows.set(where.key, data.value) },
    notification: { create: async () => { notifications++; } },
  };
  const m = loadOrderPayments(db);
  const refs = { orderNsu: 'cord1', transactionNsu: '6f1c2a10-aaaa-bbbb-cccc-0123456789ab', invoiceSlug: 'inv123', receiptUrl: 'https://recibo.infinitepay.io/abc' };
  const checks: Call[] = [];
  assert.equal((await m.confirmInfinitePayPayment('adega', refs, fakeFetch([{ json: { success: true, paid: false } }], checks))).result, 'pendente');
  assert.equal(order.paymentStatus, 'PENDING');
  assert.equal(checks[0].body.handle, 'minhaadega', 'confere na conta da loja');
  assert.equal(checks[0].body.slug, 'inv123');
  assert.equal((await m.confirmInfinitePayPayment('adega', refs, fakeFetch([{ json: { success: true, paid: true, amount: 4700 } }]))).result, 'valor divergente');
  assert.equal(order.paymentStatus, 'PENDING');
  assert.equal((await m.confirmInfinitePayPayment('adega', refs, fakeFetch([{ json: { success: true, paid: true, amount: 4790, paid_amount: 4790, capture_method: 'pix' } }]))).result, 'pago');
  assert.equal(order.paymentStatus, 'PAID');
  assert.equal(rows.get('order-payment:cord1').paymentId, refs.transactionNsu);
  assert.equal(rows.get('order-payment:cord1').receiptUrl, refs.receiptUrl);
  assert.equal(notifications, 1);
  assert.equal((await m.confirmInfinitePayPayment('adega', refs, fakeFetch([]))).result, 'já pago', 'webhook repetido não consulta nem notifica de novo');
  assert.equal(notifications, 1);
  assert.equal((await m.confirmInfinitePayPayment('outra-loja', refs, fakeFetch([]))).result, 'loja');
  assert.equal((await m.confirmInfinitePayPayment('adega', { ...refs, orderNsu: 'cOutroPedido' }, fakeFetch([]))).result, 'sem pedido');
  assert.equal((await m.confirmInfinitePayPayment('adega', { ...refs, transactionNsu: '<script>' }, fakeFetch([]))).result, 'ignorado');
});
