import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function paymentModeFixture() {
  const settings = {
    appearance: { theme: 'dark' },
    onlinePayment: { enabled: true, provider: 'mercadopago', environment: 'production', encrypted: 'ciphertext' },
  };
  const writes: Array<{ data: { settings: typeof settings } }> = [];
  const tx = {
    organization: {
      findUniqueOrThrow: async () => ({ settings }),
      update: async (input: typeof writes[number]) => { writes.push(input); },
    },
  };
  const imports: Record<string, unknown> = {
    'next/cache': {},
    'zod': {},
    '@/lib/auth/guards': { requirePermission: async (permission: string) => {
      assert.equal(permission, 'MANAGE_SETTINGS');
      return { organizationId: 'loja' };
    } },
    '@/lib/data/transaction': { withOrganizationTransaction: (organizationId: string, run: (client: typeof tx) => unknown) => {
      assert.equal(organizationId, 'loja');
      return run(tx);
    } },
    '@/lib/fiscal': {},
    '@/lib/order-payments': {
      readOnlinePayment: () => ({ provider: 'mercadopago', environment: 'production', encrypted: 'ciphertext' }),
    },
    '@/lib/crypto': {},
  };
  const source = ts.transpileModule(readFileSync('src/app/actions/fiscal.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as typeof import('../src/app/actions/fiscal') };
  new Function('require', 'module', 'exports', source)((name: string) => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports);
  return { action: module.exports.saveOnlinePaymentAction, writes, settings };
}

test('pay-at-fulfilment saves independently from the provider and preserves encrypted credentials', async () => {
  const { action, writes, settings } = paymentModeFixture();
  const form = new FormData();
  form.set('enabled', 'off');
  assert.equal((await action(null, form)).ok, true);
  assert.deepEqual(writes[0].data.settings, {
    ...settings,
    onlinePayment: { ...settings.onlinePayment, enabled: false },
  });
});

test('the combined payment mode needs credentials for the selected environment', async () => {
  const { action, writes } = paymentModeFixture();
  const form = new FormData();
  form.set('enabled', 'on');
  form.set('environment', 'sandbox');
  form.set('provider', 'mercadopago');
  const result = await action(null, form);
  assert.equal(result.ok, false);
  assert.match(result.message, /Access Token/);
  assert.equal(writes.length, 0);
});
