import test from 'node:test';
import assert from 'node:assert/strict';
import { asaasClient, authenticateAsaasWebhook, AsaasError } from '../src/lib/platform/asaas-client';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('Asaas sandbox uses official host and authoritative single monthly price', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = asaasClient({ environment: 'sandbox', apiKey: 'secret' }, (async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ id: 'sub_test' }); }) as typeof fetch);
  await client.createSubscription('cus_test', 'organization-contract', '2027-01-01', 'PIX');
  assert.equal(calls[0].url, 'https://api-sandbox.asaas.com/v3/subscriptions');
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.value, 119); assert.equal(body.cycle, 'MONTHLY'); assert.equal(body.billingType, 'PIX');
  assert.equal((calls[0].init?.headers as Record<string,string>).access_token, 'secret');
  assert.equal(calls[0].init?.redirect, 'error');
});
test('Asaas production writes are blocked before contacting provider', async () => {
  let calls = 0;
  const client = asaasClient({ environment: 'production', apiKey: 'secret' }, (async () => { calls++; return Response.json({}); }) as typeof fetch);
  await assert.rejects(client.createSubscription('cus_test', 'ref', '2027-01-01', 'BOLETO'), /não autorizadas/);
  await assert.rejects(client.setStatus('sub_test','INACTIVE'), /não autorizadas/);
  assert.equal(calls, 0);
});
test('ambiguous create response cannot trigger automatic retry or leak credentials', async () => {
  let calls = 0;
  const client = asaasClient({ environment: 'sandbox', apiKey: 'secret' }, (async () => { calls++; throw new Error('secret'); }) as typeof fetch);
  await assert.rejects(client.createCustomer({ name: 'Test', cpfCnpj: '00000000000', email: 'test@example.com', externalReference: 'org' }), (error: unknown) => error instanceof AsaasError && error.uncertain && !error.message.includes('secret'));
  assert.equal(calls, 1);
});
test('webhook token requires exact safe match and rejects absent or weak tokens', () => {
  const token = 'a'.repeat(32);
  assert.equal(authenticateAsaasWebhook(token, token), true);
  for (const supplied of [null, '', 'b'.repeat(32), `${token}x`]) assert.equal(authenticateAsaasWebhook(token, supplied), false);
  assert.equal(authenticateAsaasWebhook('short','short'), false);
});
test('provider ID cannot escape official resource path', async () => {
  let calls = 0;
  const client = asaasClient({ environment: 'sandbox', apiKey: 'secret' }, (async () => { calls++; return Response.json({}); }) as typeof fetch);
  assert.throws(() => client.payment('../customers?secret=1'));
  assert.equal(calls, 0);
});

test('sandbox webhook is idempotent and cannot write real charges or release access', async () => {
  const rows = new Map<string, any>();
  const binding = { contractId: 'contract', organizationId: 'own', customerId: 'cus_test', subscriptionId: 'sub_test', state: 'READY' };
  rows.set('asaas:credentials:sandbox', { encrypted: 'ciphertext' });
  rows.set('asaas:subscription:sandbox:sub_test', binding);
  let realWrites = 0;
  const db: any = { $queryRaw: async () => [{ready:true}], platformSetting: {
    findUnique: async ({where}: any) => rows.has(where.key) ? {value:rows.get(where.key)} : null,
    create: async ({data}: any) => { assert.ok(!rows.has(data.key)); rows.set(data.key,data.value); },
    upsert: async ({where,create,update}: any) => rows.set(where.key, rows.has(where.key) ? update.value : create.value),
  }, platformContract: { findUnique: async () => ({ id:'contract', organizationId:'own', status:'PENDING' }), update: async () => { realWrites++; } }, saaSCharge: { upsert: async () => {realWrites++;} } };
  db.$transaction = async (callback: any) => callback(db);
  const imports: Record<string,unknown> = { 'server-only': {}, '@/lib/db': { prisma: db }, '@/lib/crypto': { decryptJson: () => ({apiKey:'key'}) }, './asaas-client': { asaasClient: () => ({payment: async () => ({id:'pay_test', subscription:'sub_test',customer:'cus_test',status:'RECEIVED',value:119,dueDate:'2027-01-01',billingType:'PIX'})}) } };
  const source = ts.transpileModule(readFileSync('src/lib/platform/asaas.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{} as any};
  new Function('require','module','exports',source)((name:string) => { if (!(name in imports)) throw new Error(name); return imports[name]; },mod,mod.exports);
  const oldFlag = process.env.ASAAS_ENABLED, oldAdmin = process.env.PLATFORM_ADMIN_ENABLED;
  process.env.ASAAS_ENABLED='true'; process.env.PLATFORM_ADMIN_ENABLED='true';
  try {
    await mod.exports.reconcileAsaasPayment('sandbox','event','pay_test');
    await mod.exports.reconcileAsaasPayment('sandbox','event','pay_test');
    assert.equal(realWrites,0);
    assert.equal([...rows.keys()].filter(key => key.startsWith('asaas:event:')).length,1);
    assert.equal(rows.get('asaas:payment:sandbox:pay_test').reconciledStatus,'PAID');
    rows.set('asaas:subscription:sandbox:sub_test',{...binding,customerId:'foreign'});
    await assert.rejects(mod.exports.reconcileAsaasPayment('sandbox','other-event','pay_test'),/inválido/);
  } finally {
    if(oldFlag===undefined) delete process.env.ASAAS_ENABLED; else process.env.ASAAS_ENABLED=oldFlag;
    if(oldAdmin===undefined) delete process.env.PLATFORM_ADMIN_ENABLED; else process.env.PLATFORM_ADMIN_ENABLED=oldAdmin;
  }
});

test('Asaas actions reject nonoperators before database or provider access', async () => {
  let writes = 0;
  const imports: Record<string,unknown> = {
    zod: { z: (await import('zod')).z },
    '@/lib/db': { prisma: new Proxy({}, {get:() => {writes++; throw new Error('Unexpected database call');}}) },
    '@/lib/platform/auth': {requirePlatformRole:async () => {throw new Error('Forbidden');}},
    '@/lib/crypto': {encryptJson:() => {writes++;}},
    '@/lib/platform/asaas': {asaasReady:async () => {writes++;}, configuredAsaas:async () => {writes++;}},
    'next/cache': {revalidatePath:() => {}},
  };
  const source = ts.transpileModule(readFileSync('src/app/actions/asaas.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{} as any};
  new Function('require','module','exports',source)((name:string) => {if(!(name in imports)) throw new Error(name); return imports[name];},mod,mod.exports);
  for(const action of Object.values(mod.exports)) await assert.rejects((action as Function)(new FormData()),/Forbidden/);
  assert.equal(writes,0);
});
