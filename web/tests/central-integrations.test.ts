import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { OperationError } from '../src/lib/operation-error';
function load(file: string, imports: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', code)((name: string) => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
function harness(authorized = true, encrypted = true) {
  const writes: any[] = [];
  const tx = {
    $queryRaw: async () => [],
    integration: {
      findUnique: async () => ({ id: 'connection', status: 'PENDING' }),
      upsert: async (args: any) => { writes.push(['connection', args]); return { id: 'connection' }; },
      update: async (args: any) => { writes.push(['status', args]); },
    },
    integrationCredential: { create: async (args: any) => { writes.push(['credential', args]); } },
    platformAudit: { create: async (args: any) => { writes.push(['audit', args]); } },
  };
  const actions = load('src/app/actions/integrations.ts', {
    zod: { z }, 'next/cache': { revalidatePath() {} },
    '@/lib/platform/auth': { requirePlatformRole: async () => { if (!authorized) throw new Error('Forbidden'); return { operatorId: 'op' }; } },
    '@/lib/db': { prisma: { organization: { findUnique: async () => ({ id: 'org' }) }, $transaction: async (work: any) => work(tx) } },
    '@/lib/crypto': { isEncryptionConfigured: () => encrypted, encryptJson: () => 'ciphertext' },
    '@/lib/auth/guards': { toActionError: (error: Error) => ({ error: error instanceof OperationError ? error.message : 'Indisponível' }) },
    '@/lib/operation-error': { OperationError },
  });
  return { actions, writes };
}
const request = { organizationId: 'org', provider: 'IFOOD', status: 'PENDING', reason: 'Revisão administrativa', confirmation: 'CONFIRMAR' };
test('tenant session cannot mutate centrally managed integrations', async () => {
  const { actions, writes } = harness(false);
  assert.equal((await actions.setIntegrationStatusAction(request)).ok, false);
  assert.deepEqual(writes, []);
});
test('operator cannot claim active provider without an implemented verification', async () => {
  const { actions, writes } = harness();
  assert.equal((await actions.setIntegrationStatusAction({ ...request, status: 'ACTIVE' })).ok, false);
  assert.deepEqual(writes, []);
});
test('disconnect preserves encrypted credentials and writes audit in same transaction', async () => {
  const { actions, writes } = harness();
  assert.equal((await actions.disconnectIntegrationAction('IFOOD', 'org', request.reason, request.confirmation)).ok, true);
  assert.deepEqual(writes.map(([kind]) => kind), ['status', 'audit']);
  assert.equal(writes[0][1].data.status, 'DISCONNECTED');
});
test('saving new credentials stores only ciphertext and no secret in audit or result', async () => {
  const { actions, writes } = harness();
  const form = new FormData();
  for (const [key, value] of Object.entries(request)) form.set(key, value);
  form.set('payload', JSON.stringify({ token: 'fake-test-credential' }));
  const result = await actions.saveIntegrationCredentialAction(form);
  assert.equal(result.ok, true);
  assert.equal(writes.find(([kind]) => kind === 'credential')[1].data.encryptedPayload, 'ciphertext');
  assert.equal(JSON.stringify({ writes, result }).includes('fake-test-credential'), false);
});
test('missing encryption configuration prevents credential writes', async () => {
  const { actions, writes } = harness(true, false);
  const form = new FormData();
  for (const [key, value] of Object.entries(request)) form.set(key, value);
  form.set('payload', '{}');
  assert.equal((await actions.saveIntegrationCredentialAction(form)).ok, false);
  assert.deepEqual(writes, []);
});
test('store banners read only the requested tenant, with explicit platform fallback', async () => {
  const calls: any[] = [];
  const banners = load('src/lib/data/global-catalog.ts', {
    'server-only': {}, '@/lib/utils': { slugify: (value: string) => value },
    '@/lib/db': { toNumber: Number, prisma: { storeBanner: { findMany: async (query: any) => { calls.push(query); return []; } } } },
  });
  await banners.getBannersForStore('tenant-a', 'BEVERAGE', 'hero');
  assert.equal(calls[0].where.organizationId, 'tenant-a');
  assert.equal(calls[1].where.organizationId, null);
  assert.equal(calls[0].where.active, true);
  assert.deepEqual(calls[1].where.OR[1], { businessTypes: { has: 'BEVERAGE' } });
});

test('own banners take precedence and never query another tenant or platform defaults', async () => {
  const calls: any[] = [];
  const own = [{ id: 'banner-a', organizationId: 'tenant-a', imagePath: '/catalog/banners/banner-01.png' }];
  const data = load('src/lib/data/global-catalog.ts', {
    'server-only': {}, '@/lib/utils': { slugify: (value: string) => value },
    '@/lib/db': { toNumber: Number, prisma: { storeBanner: { findMany: async (query: any) => { calls.push(query); return own; } } } },
  });
  assert.deepEqual(await data.getBannersForStore('tenant-a', 'BEVERAGE'), own);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where, { organizationId: 'tenant-a', active: true, placement: 'hero' });
  assert.deepEqual(calls[0].orderBy, { position: 'asc' });
});
test('plan requests always use session tenant and never create contracts or charges', async () => {
  const previous = process.env.PLATFORM_ADMIN_ENABLED;
  process.env.PLATFORM_ADMIN_ENABLED = 'true';
  const writes: any[] = [];
  const tx = { plan: { findFirst: async () => ({ id: 'plan', name: 'Plano configurado' }) }, platformSupportCase: {
    findFirst: async (query: any) => { assert.equal(query.where.organizationId, 'tenant-a'); return null; },
    create: async (args: any) => writes.push(args),
  } };
  const actions = load('src/app/actions/subscription-request.ts', {
    zod: { z }, 'next/cache': { revalidatePath() {} }, '@/lib/db': { prisma: {} },
    '@/lib/operation-error': { OperationError },
    '@/lib/auth/guards': { requirePermission: async () => ({ organizationId: 'tenant-a', user: { id: 'user' } }), toActionError: () => ({ error: 'Indisponível' }) },
    '@/lib/data/transaction': { withOrganizationTransaction: async (organizationId: string, work: any) => { assert.equal(organizationId, 'tenant-a'); return work(tx); } },
  });
  try {
    const result = await actions.requestSubscriptionPlanAction({ planId: 'plan', organizationId: 'tenant-b', confirmed: true });
    assert.equal(result.ok, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.organizationId, 'tenant-a');
  } finally { if (previous === undefined) delete process.env.PLATFORM_ADMIN_ENABLED; else process.env.PLATFORM_ADMIN_ENABLED = previous; }
});
