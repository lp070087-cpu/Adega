import 'server-only';
import { prisma } from '@/lib/db';
import { evaluateCommercialAccess, type CommercialAccess } from '@/lib/commercial-policy';

/** Off by default: deploying additive code must never suspend existing stores. */
export async function getCommercialAccess(organizationId: string): Promise<CommercialAccess> {
  if (process.env.PLATFORM_BILLING_ENFORCEMENT_ENABLED !== 'true') {
    return { allowNewOrders: true, message: null };
  }
  try {
    const contract = await prisma.platformContract.findUnique({
      where: { organizationId },
      select: { status: true, enforceAccess: true, dueAt: true, trialEndsAt: true, graceDays: true },
    });
    return evaluateCommercialAccess(contract);
  } catch {
    return { allowNewOrders: false, message: 'Não foi possível verificar a situação comercial. Tente novamente ou fale com a administração. Pedidos em andamento continuam disponíveis.' };
  }
}
