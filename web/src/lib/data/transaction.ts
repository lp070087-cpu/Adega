import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

/** Serialize operational writes per tenant, including composed order operations. */
export async function withOrganizationTransaction<T>(
  organizationId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  transaction?: Prisma.TransactionClient,
): Promise<T> {
  const run = async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE
    `;
    if (!rows.length) throw new Error('Estabelecimento não encontrado.');
    return work(tx);
  };
  return transaction ? run(transaction) : prisma.$transaction(run, { timeout: 15000 });
}
