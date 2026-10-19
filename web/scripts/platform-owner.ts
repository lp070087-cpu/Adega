import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

class OwnerPreparationError extends Error {}

export const OWNER_EMAIL = 'lp070087@gmail.com';
export const PLATFORM_TABLES = ['PlatformOperator', 'PlatformContract', 'SaaSCharge', 'PlatformAudit', 'PlatformSetting', 'PlatformSupportCase'];

export async function prepareOwner(db: any, options: { apply?: boolean; userId?: string; approval?: string } = {}) {
  // Inspect identity before accessing tables that may not have been approved yet.
  const users = await db.user.findMany({ where: { email: { equals: OWNER_EMAIL, mode: 'insensitive' } }, select: { id: true, email: true, active: true } });
  if (users.length !== 1 || users[0].email.toLowerCase() !== OWNER_EMAIL || !users[0].active) throw new OwnerPreparationError('A conta indicada deve existir uma única vez e estar ativa. Nenhuma conta foi criada.');
  const user = users[0];
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`;
  const names = new Set(tables.map((row: { tablename: string }) => row.tablename));
  const present = PLATFORM_TABLES.filter(name => names.has(name));
  if (!options.apply) return { mode: 'READ_ONLY', userId: user.id, email: user.email, active: user.active, platformTables: present, missingTables: PLATFORM_TABLES.filter(name => !names.has(name)) };
  if (present.length !== PLATFORM_TABLES.length) throw new OwnerPreparationError('Migração incompleta ou ausente. Aplicação bloqueada.');
  if (options.userId !== user.id || !options.approval || options.approval.trim().length < 10) throw new OwnerPreparationError('Informe o User.id conferido e a referência da aprovação específica.');
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(719191007)`;
    const verified = await tx.user.findUnique({ where: { id: user.id }, select: { email: true, active: true } });
    if (!verified?.active || verified.email?.toLowerCase() !== OWNER_EMAIL) throw new OwnerPreparationError('Identidade alterada. Concessão bloqueada.');
    const existing = await tx.platformOperator.findUnique({ where: { userId: user.id } });
    if (existing?.role === 'OWNER' && existing.active) return { mode: 'UNCHANGED', userId: user.id, operatorId: existing.id };
    const otherOwner = await tx.platformOperator.count({ where: { role: 'OWNER', active: true, user: { active: true }, userId: { not: user.id } } });
    if (otherOwner) throw new OwnerPreparationError('Já existe outro proprietário ativo. Use a gestão autenticada de operadores.');
    const operator = await tx.platformOperator.upsert({ where: { userId: user.id }, create: { id: randomUUID(), userId: user.id, role: 'OWNER', active: true }, update: { role: 'OWNER', active: true } });
    await tx.platformAudit.create({ data: { id: randomUUID(), operatorId: operator.id, action: 'BOOTSTRAP_OPERATOR', resourceType: 'PlatformOperator', resourceId: operator.id, reason: options.approval!.trim(), details: { approvedUserId: user.id, previousRole: existing?.role ?? null, previousActive: existing?.active ?? null, role: 'OWNER', active: true } } });
    return { mode: 'GRANTED', userId: user.id, operatorId: operator.id };
  }, { isolationLevel: 'Serializable' });
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const allowed = new Set(['--apply-approved', '--user-id', '--approval']);
  for (let index = 0; index < args.length; index++) {
    if (!allowed.has(args[index])) throw new OwnerPreparationError('Argumento não reconhecido.');
    if (args[index] !== '--apply-approved') index++;
  }
  const db = new PrismaClient();
  try { console.log(JSON.stringify(await prepareOwner(db, { apply: args.includes('--apply-approved'), userId: value('--user-id'), approval: value('--approval') }), null, 2)); }
  finally { await db.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => { console.error(error instanceof OwnerPreparationError ? error.message : 'Verificação/concessão não concluída. Confira conexão e migração; nenhum segredo foi impresso.'); process.exitCode = 1; });
}
