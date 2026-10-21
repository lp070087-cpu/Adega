import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import ts from 'typescript';
import { driverDaySummary, driverScheduleSchema, type DriverSchedule } from '../src/lib/driver-schedule';
class OperationError extends Error {}
function harness() {
  let user: any = { id: 'user', email: 'driver@example.com', active: true, mustChangePassword: true, passwordHash: null, organizations: [{ organizationId: 'own', role: 'DRIVER', active: true }] };
  let driverActive = true, central = false, suspended = false, writes = 0, revoked = 0;
  let tokens: any[] = [];
  const matches = (row: any, where: any) => (!where.token || where.token === row.token) && (!where.identifier || (typeof where.identifier === 'string' ? row.identifier === where.identifier : row.identifier.startsWith(where.identifier.startsWith))) && (!where.expires || row.expires > where.expires.gt);
  const db: any = {
    organization: { findUnique: async (q: any) => q.where.slug === 'other' ? { id: 'other', name: 'Other store', status: 'ACTIVE' } : { id: 'own', name: 'Own store', status: suspended ? 'SUSPENDED' : 'ACTIVE' } },
    user: { findUnique: async (q: any) => q.where.id === user.id || q.where.email === user.email ? user : null, update: async (q: any) => { assert.equal(q.where.id, user.id); user = { ...user, ...q.data }; writes++; } },
    driver: { findFirst: async (q: any) => driverActive && q.where.organizationId === 'own' && q.where.userId === user.id ? { id: 'driver' } : null },
    verificationToken: { findFirst: async (q: any) => tokens.find(row => matches(row, q.where)) ?? null, create: async (q: any) => { tokens.push(q.data); return q.data; }, deleteMany: async (q: any) => { const count = tokens.length; tokens = tokens.filter(row => !matches(row, q.where)); return { count: count - tokens.length }; } },
    notification: { create: async (q: any) => { assert.equal(q.data.organizationId, 'own'); } },
  };
  const imports: Record<string, unknown> = {
    'server-only': {}, 'node:crypto': crypto, '@/lib/db': { prisma: db },
    '@/lib/data/transaction': { withOrganizationTransaction: async (org: string, work: Function) => { assert.equal(org, 'own'); return work(db); } },
    './password': { hashPassword: async (value: string) => bcrypt.hash(value, 4) },
    './driver-access': { driverMailReady: () => Boolean(process.env.RESEND_API_KEY), driverTokenHash: (value: string) => crypto.createHash('sha256').update(value).digest('hex') },
    '@/lib/platform/identity': { isPlatformIdentity: async () => central },
    '@/lib/data/drivers': { revokeDriverSessions: async (_tx: any, org: string, id: string) => { assert.equal(org, 'own'); assert.equal(id, 'user'); revoked++; } },
    '@/lib/operation-error': { OperationError },
  };
  const module = { exports: {} as any };
  const output = ts.transpileModule(readFileSync('src/lib/auth/driver-invitation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', output)((key: string) => { if (!(key in imports)) throw new Error(key); return imports[key]; }, module, module.exports);
  return { data: module.exports, tokens: () => tokens, user: () => user, patch: (value: any) => { user = { ...user, ...value }; }, inactive: () => { driverActive = false; }, central: () => { central = true; }, suspend: () => { suspended = true; }, writes: () => writes, revoked: () => revoked };
}
function mail(t: any) {
  const old = { RESEND_API_KEY: process.env.RESEND_API_KEY, MAIL_FROM: process.env.MAIL_FROM, APP_PUBLIC_URL: process.env.APP_PUBLIC_URL };
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, { RESEND_API_KEY: 'test-key', MAIL_FROM: 'test@example.com', APP_PUBLIC_URL: 'https://example.com' });
  const messages: any[] = [];
  globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); messages.push(JSON.parse(String(options?.body))); return Response.json({ id: 'message' }); };
  t.after(() => { globalThis.fetch = previousFetch; for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  return messages;
}
const rawToken = (message: any) => new URLSearchParams(new URL(message.text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token')!;

test('store invitation keeps password pending as a hash, verifies email once and remains scoped', async t => {
  const sent = mail(t), h = harness();
  await h.data.requestDriverInvitation('own-store', 'DRIVER@example.com', 'SafePass123');
  assert.equal(sent.length, 1); assert.equal(h.writes(), 0); assert.equal(h.user().passwordHash, null);
  assert.ok(!h.tokens()[0].identifier.includes('SafePass123'));
  const raw = rawToken(sent[0]); assert.notEqual(h.tokens()[0].token, raw); assert.ok(h.tokens()[0].expires > new Date());
  await h.data.requestDriverInvitation('own-store', 'driver@example.com', 'Different123'); assert.equal(sent.length, 1);
  await assert.rejects(h.data.consumeDriverInvitation('other', 'user', raw), /inválido/);
  await h.data.consumeDriverInvitation('own-store', 'user', raw);
  assert.equal(h.user().mustChangePassword, false); assert.ok(h.user().emailVerified); assert.ok(bcrypt.compareSync('SafePass123', h.user().passwordHash)); assert.equal(h.revoked(), 1);
  await assert.rejects(h.data.consumeDriverInvitation('own-store', 'user', raw), /inválido/); assert.equal(h.writes(), 1);
});
test('store link does not register strangers, owners, central operators, activated users or foreign identities', async t => {
  const sent = mail(t);
  const cases = [{ email: 'stranger@example.com', mutate: (_h: any) => {} }, ...[(h: any) => h.patch({ organizations: [{ organizationId: 'own', role: 'OWNER', active: true }] }), (h: any) => h.central(), (h: any) => h.patch({ mustChangePassword: false }), (h: any) => h.patch({ organizations: [{ organizationId: 'foreign', role: 'DRIVER', active: true }] }), (h: any) => h.inactive()].map(mutate => ({ email: 'driver@example.com', mutate }))];
  for (const entry of cases) {
    const h = harness(); entry.mutate(h); await h.data.requestDriverInvitation('own-store', entry.email, 'SafePass123'); assert.equal(h.tokens().length, 0); assert.equal(h.writes(), 0);
  }
  assert.equal(sent.length, 0);
});
test('email proof fails after expiry, driver deactivation, store suspension or central promotion', async t => {
  mail(t);
  for (const mutate of [(h: any) => { h.tokens()[0].expires = new Date(0); }, (h: any) => h.inactive(), (h: any) => h.suspend(), (h: any) => h.central()]) {
    const h = harness(); let message: any;
    globalThis.fetch = async (_url, options) => { message = JSON.parse(String(options?.body)); return Response.json({ id: 'message' }); };
    await h.data.requestDriverInvitation('own-store', 'driver@example.com', 'SafePass123'); mutate(h);
    await assert.rejects(h.data.consumeDriverInvitation('own-store', 'user', rawToken(message)), /inválido/); assert.equal(h.writes(), 0);
  }
});
test('failed email leaves account unchanged and removes only its issued temporary token', async t => {
  mail(t); const h = harness(); globalThis.fetch = async () => Response.json({}, { status: 503 });
  await assert.rejects(h.data.requestDriverInvitation('own-store', 'driver@example.com', 'SafePass123'), /pendente/); assert.equal(h.tokens().length, 0); assert.equal(h.writes(), 0);
});
test('weekly accordion summaries preserve shifts, overnight work and explicit days off', () => {
  const schedule: DriverSchedule = { enabled: true, timezone: 'America/Sao_Paulo', shifts: [{ day: 1, start: '22:00', end: '02:00', breaks: [] }, { day: 2, start: '09:00', end: '12:00', breaks: [] }, { day: 2, start: '13:00', end: '18:00', breaks: [{ start: '15:00', end: '15:15' }] }] };
  assert.match(driverDaySummary(schedule, 1), /22:00–02:00 \(\+1 dia\)/); assert.match(driverDaySummary(schedule, 2), /09:00–12:00 \/ 13:00–18:00/); assert.match(driverDaySummary(schedule, 0), /Folga/);
  assert.equal(driverScheduleSchema.safeParse(schedule).success, true);
  assert.equal(driverScheduleSchema.safeParse({ ...schedule, shifts: [...schedule.shifts, { day: 2, start: '01:00', end: '03:00', breaks: [] }] }).success, false);
});
