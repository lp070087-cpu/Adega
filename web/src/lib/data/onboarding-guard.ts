import 'server-only';
import type { Prisma } from '@prisma/client';
import { OperationError } from '@/lib/operation-error';

/** Serialize submissions by account so double clicks cannot create two stores. */
export async function lockOnboardingAccount(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!user?.active) throw new OperationError('Conta indisponível. Entre novamente.');
  const membership = await tx.organizationUser.findFirst({
    where: { userId, OR:[{active:true},{role:'DRIVER'}] },
    select: { id: true },
  });
  if (membership) throw new OperationError('Sua conta já possui um estabelecimento. Acesse o painel.');
  if(process.env.DRIVER_APPLICATIONS_ENABLED==='true'&&await (await import('./driver-applications')).driverApplicationsReady()&&await tx.driverApplication.findFirst({where:{userId},select:{id:true}}))throw new OperationError('Esta conta é de entregador. Acompanhe sua solicitação no aplicativo.');
}
