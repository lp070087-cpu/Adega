import 'server-only';
import { OperationError } from '@/lib/operation-error';
import type { Prisma } from '@prisma/client';

/** Call inside the same organization-locked transaction as the activation. */
export async function assertPlatformQuota(
  tx: Prisma.TransactionClient,
  organizationId: string,
  kind: 'users' | 'drivers',
) {
  if (process.env.PLATFORM_ADMIN_ENABLED !== 'true') return;
  const contract = await tx.platformContract.findUnique({
    where: { organizationId },
    select: { plan: { select: { maxUsers: true, maxDrivers: true } } },
  });
  // Existing tenants without a commercial contract retain their access.
  if (!contract) return;
  const limit = kind === 'users' ? contract.plan.maxUsers : contract.plan.maxDrivers;
  const count = kind === 'users'
    ? await tx.organizationUser.count({ where: { organizationId, active: true, role: { not: 'DRIVER' } } })
    : await tx.driver.count({ where: { organizationId, active: true } });
  if (count >= limit) {
    throw new OperationError(`Limite de ${kind === 'users' ? 'usuários' : 'entregadores'} ativos do plano atingido (${limit}). Desative um cadastro ou solicite a alteração do plano.`);
  }
}
