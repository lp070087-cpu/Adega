import 'server-only';
import { auth } from '@/lib/auth/index';
import { prisma } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';

export type PlatformRole = 'OWNER' | 'ADMIN' | 'SUPPORT' | 'FINANCE';
export type PlatformContext = { userId: string; operatorId: string; role: PlatformRole };
export class PlatformAccessError extends Error {}
export async function requirePlatformOperator(): Promise<PlatformContext> {
  if (process.env.PLATFORM_ADMIN_ENABLED !== 'true') throw new PlatformAccessError('Acesso indisponível.');
  const session = await auth();
  if (!session?.user?.id) throw new PlatformAccessError('Acesso restrito.');
  // Readiness check before touching any new Prisma model. Never grants fallback access.
  try {
    const ready = await prisma.$queryRaw<Array<{ ready: boolean }>>`SELECT (to_regclass('public."PlatformOperator"') IS NOT NULL AND to_regclass('public."PlatformContract"') IS NOT NULL AND to_regclass('public."SaaSCharge"') IS NOT NULL AND to_regclass('public."PlatformAudit"') IS NOT NULL AND to_regclass('public."PlatformSetting"') IS NOT NULL AND to_regclass('public."PlatformSupportCase"') IS NOT NULL) AS ready`;
    if (!ready[0]?.ready) throw new PlatformAccessError('Administração ainda não ativada.');
    const account = await prisma.user.findUnique({ where: { id: session.user.id }, select: { active: true } });
    const operator = await prisma.platformOperator.findUnique({ where: { userId: session.user.id }, select: { id: true, role: true, active: true } });
    if (!account?.active || !operator?.active || !['OWNER','ADMIN','SUPPORT','FINANCE'].includes(operator.role)) throw new PlatformAccessError('Acesso restrito.');
    return { userId: session.user.id, operatorId: operator.id, role: operator.role as PlatformRole };
  } catch (error) {
    if (error instanceof PlatformAccessError) throw error;
    throw new PlatformAccessError('Administração indisponível.');
  }
}
export async function requirePlatformRole(roles: PlatformRole[]) {
  const context = await requirePlatformOperator();
  if (!roles.includes(context.role)) throw new PlatformAccessError('Seu perfil não permite esta ação.');
  return context;
}
export async function requirePlatformPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/admin/login');
  try { return await requirePlatformOperator(); } catch { notFound(); }
}
