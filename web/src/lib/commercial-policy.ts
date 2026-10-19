export type CommercialContract = {
  status: string;
  enforceAccess: boolean;
  dueAt: Date;
  trialEndsAt: Date | null;
  graceDays: number;
};
export type CommercialAccess = { allowNewOrders: boolean; message: string | null };

/** Restricts new business only; existing orders, deliveries and reads remain available. */
export function evaluateCommercialAccess(contract: CommercialContract | null, now = new Date()): CommercialAccess {
  const open = { allowNewOrders: true, message: null };
  if (!contract?.enforceAccess) return open;
  if (['SUSPENDED', 'CANCELLED'].includes(contract.status)) {
    return { allowNewOrders: false, message: 'Novos pedidos estão temporariamente indisponíveis. Entre em contato com o responsável pela loja.' };
  }
  const deadline = contract.status === 'TRIAL' ? (contract.trialEndsAt ?? contract.dueAt) : contract.dueAt;
  const graceEnd = deadline.getTime() + Math.max(0, contract.graceDays) * 86400000;
  if (!Number.isFinite(graceEnd) || now.getTime() > graceEnd) {
    return { allowNewOrders: false, message: 'O período comercial desta loja precisa ser regularizado para receber novos pedidos. Pedidos em andamento continuam disponíveis.' };
  }
  if (now.getTime() > deadline.getTime()) {
    return { allowNewOrders: true, message: 'A assinatura está no período de regularização. Entre em contato com a administração da plataforma.' };
  }
  return open;
}
