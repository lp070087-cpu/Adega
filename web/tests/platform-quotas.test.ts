import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { OperationError } from '../src/lib/operation-error';

function isolated(file: string, imports: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', code)((name: string) => {
    if (name === '@/lib/operation-error' && !(name in imports)) return { OperationError: class OperationError extends Error {} };
    if (!(name in imports)) throw Error(`Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const { assertPlatformQuota } = isolated('src/lib/platform/quotas.ts', { 'server-only': {}, '@/lib/platform/identity': {isPlatformIdentity:async()=>false}, '@/lib/operation-error': { OperationError } });
async function enabled(run: () => Promise<void>, value = 'true') {
  const previous = process.env.PLATFORM_ADMIN_ENABLED;
  process.env.PLATFORM_ADMIN_ENABLED = value;
  try { await run(); } finally { if (previous === undefined) delete process.env.PLATFORM_ADMIN_ENABLED; else process.env.PLATFORM_ADMIN_ENABLED = previous; }
}

test('quotas do not query new tables before platform activation', async () => {
  await enabled(async () => { await assertPlatformQuota({}, 'org', 'users'); }, 'false');
});
test('tenants without a contract remain unrestricted', async () => {
  await enabled(async () => { await assertPlatformQuota({ platformContract: { findUnique: async () => null } }, 'legacy', 'drivers'); });
});
test('user quota scopes active non-driver memberships including owner to organization', async () => {
  const queries: any[] = [];
  await enabled(async () => {
    const tx = { platformContract: { findUnique: async (q: any) => { assert.equal(q.where.organizationId, 'org-a'); return { plan: { maxUsers: 2 } }; } }, organizationUser: { count: async (q: any) => { queries.push(q); return 2; } } };
    await assert.rejects(assertPlatformQuota(tx, 'org-a', 'users'), /Limite de usuários/);
    assert.deepEqual(queries[0].where, { organizationId: 'org-a', active: true, role: { not: 'DRIVER' } });
  });
});
test('driver quota counts profiles even without logins and enforces zero allowance', async () => {
  await enabled(async () => {
    const tx = { platformContract: { findUnique: async () => ({ plan: { maxDrivers: 0 } }) }, driver: { count: async (q: any) => { assert.deepEqual(q.where, { organizationId: 'org-b', active: true }); return 0; } } };
    await assert.rejects(assertPlatformQuota(tx, 'org-b', 'drivers'), /entregadores/);
  });
});
test('available plan slot permits creation', async () => {
  await enabled(async () => { await assertPlatformQuota({ platformContract: { findUnique: async () => ({ plan: { maxUsers: 3 } }) }, organizationUser: { count: async () => 2 } }, 'org', 'users'); });
});

function driverHarness(active: boolean, deny = false) {
  let checks = 0; let writes = 0; let locks = 0;
  let settings:any={preserve:true};
  const tx = { organization:{findUniqueOrThrow:async(q:any)=>{assert.equal(q.where.id,'org');return {settings};},update:async(q:any)=>{assert.equal(q.where.id,'org');settings=q.data.settings;return {settings};}},order: { count: async () => 0 }, driver: { findFirst: async () => ({ active, userId: 'driver-user' }), create: async () => { writes++; return {}; }, updateMany: async () => { writes++; return { count: 1 }; } }, organizationUser: { updateMany: async () => ({ count: 1 }) } };
  const api = isolated('src/lib/data/drivers.ts', { 'server-only': {}, '@/lib/platform/identity': {isPlatformIdentity:async()=>false}, '@/lib/data/driver-schedules': {}, '@/lib/driver-schedule': {}, '@/lib/db': { prisma: {}, toNumber: Number }, '@/lib/auth/password': { hashPassword: async () => 'hash' }, '@/lib/data/transaction': { withOrganizationTransaction: async (org: string, run: any) => { assert.equal(org, 'org'); locks++; return run(tx); } }, '@/lib/platform/quotas': { assertPlatformQuota: async (passed: unknown, org: string, kind: string) => { assert.equal(passed, tx); assert.equal(kind, 'drivers'); checks++; if (deny) throw new OperationError('quota'); } } });
  return { api, stats: () => ({ checks, writes, locks }),settings:()=>settings };
}
test('driver create and reactivation fail before writes when quota is exhausted', async () => {
  for (const create of [true, false]) {
    const h = driverHarness(false, true);
    await assert.rejects(create ? h.api.createDriver('org', { name: 'Motorista', phone: '11999999999', vehicleType: 'MOTORCYCLE', active: true }) : h.api.updateDriver('org', 'id', { active: true }), /quota/);
    assert.deepEqual(h.stats(), { checks: 1, writes: 0, locks: 1 });
  }
});
test('editing existing active driver or deactivating never consumes a new slot', async () => {
  for (const input of [{ name: 'Nome atualizado' }, { active: true }, { active: false }]) {
    const h = driverHarness(true, true); await h.api.updateDriver('org', 'id', input);
    assert.deepEqual(h.stats(), { checks: 0, writes: 1, locks: 1 });
    assert.equal(h.settings().preserve,true);
    if('active' in input&&input.active===false)assert.ok(h.settings().driverSessionsRevokedAt['driver-user']);
  }
});

function teamHarness(member: any = null, deny = false) {
  let checks = 0; let writes = 0; let locks = 0;
  const tx = { user: { findUnique: async () => ({ id: 'person' }) }, organizationUser: { findUnique: async () => member, findFirst: async () => member, create: async () => { writes++; }, update: async () => { writes++; } } };
  const schema = { safeParse: (data: any) => ({ success: true, data }) };
  const api = isolated('src/app/actions/team.ts', {
    'next/cache': { revalidatePath: () => {} }, '@/lib/db': { prisma: { organizationUser: { findFirst: async () => member } } },
    '@/lib/auth/guards': { requirePermission: async () => ({ role: 'OWNER', organizationId: 'org', user: { id: 'owner' } }), toActionError: (error: Error) => ({ error: error.message }) },
    '@/lib/auth/password': { hashPassword: async () => 'hash' }, '@/lib/permissions': { roleRank: () => 1, outranks: () => true },
    '@/lib/validations/operations': { teamMemberSchema: schema, updateTeamMemberSchema: schema }, '@/lib/operation-error': { OperationError },
    '@/lib/data/transaction': { withOrganizationTransaction: async (org: string, run: any) => { assert.equal(org, 'org'); locks++; return run(tx); } },
    '@/lib/platform/quotas': { assertPlatformQuota: async (passed: any, org: string, kind: string) => { assert.equal(passed, tx); assert.equal(kind, 'users'); checks++; if (deny) throw new OperationError('quota'); } },
  });
  return { api, stats: () => ({ checks, writes, locks }) };
}
function teamForm(role = 'ATTENDANT') { const f = new FormData(); f.set('name', 'Pessoa'); f.set('email', 'person@example.com'); f.set('role', role); return f; }
test('team creation and inactive membership reactivation cannot bypass user quotas', async () => {
  for (const member of [null, { id: 'member', role: 'ATTENDANT', active: false, userId: 'person' }]) {
    const h = teamHarness(member, true); const result = await h.api.createTeamMemberAction(teamForm());
    assert.equal(result.ok, false); assert.equal(result.error, 'quota'); assert.deepEqual(h.stats(), { checks: 1, writes: 0, locks: 1 });
  }
});
test('team rejects driver creation and requires dedicated driver registration', async () => {
  const h = teamHarness(); const result = await h.api.createTeamMemberAction(teamForm('DRIVER'));
  assert.equal(result.ok, false); assert.match(result.error, /Entregadores/); assert.deepEqual(h.stats(), { checks: 0, writes: 0, locks: 0 });
});
test('staff reactivation and driver to staff conversion check quotas inside same transaction', async () => {
  for (const member of [{ id: 'm', role: 'ATTENDANT', active: false, userId: 'person' }, { id: 'm', role: 'DRIVER', active: true, userId: 'person' }]) {
    const h = teamHarness(member, true); const result = await h.api.updateTeamMemberAction({ memberId: 'm', role: 'ATTENDANT', active: true });
    assert.equal(result.ok, false); assert.deepEqual(h.stats(), { checks: 1, writes: 0, locks: 1 });
  }
});
test('staff editing and deactivation remain available when quota is exceeded', async () => {
  for (const input of [{ memberId: 'm', shift: 'Manhã' }, { memberId: 'm', active: false }]) {
    const h = teamHarness({ id: 'm', role: 'ATTENDANT', active: true, userId: 'person' }, true);
    assert.equal((await h.api.updateTeamMemberAction(input)).ok, true); assert.deepEqual(h.stats(), { checks: 0, writes: 1, locks: 1 });
  }
});
