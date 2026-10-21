import 'server-only';
import { prisma } from '@/lib/db';
import { decryptJson } from '@/lib/crypto';
import { asaasClient, type AsaasEnvironment } from './asaas-client';

export type AsaasCredentials = { apiKey: string; webhookToken: string };
export async function asaasReady() {
  if (process.env.ASAAS_ENABLED !== 'true' || process.env.PLATFORM_ADMIN_ENABLED !== 'true') return false;
  const rows = await prisma.$queryRaw<Array<{ ready: boolean }>>`SELECT (to_regclass('public."PlatformSetting"') IS NOT NULL AND to_regclass('public."PlatformContract"') IS NOT NULL AND to_regclass('public."SaaSCharge"') IS NOT NULL) AS ready`;
  return rows[0]?.ready === true;
}
export async function configuredAsaas(environment: AsaasEnvironment) {
  if (!await asaasReady()) throw new Error('Asaas aguardando ativação administrativa.');
  const row = await prisma.platformSetting.findUnique({ where: { key: `asaas:credentials:${environment}` } });
  const encrypted = (row?.value as { encrypted?: string } | undefined)?.encrypted;
  if (!encrypted) throw new Error('Credenciais do Asaas não configuradas.');
  const credentials = decryptJson<AsaasCredentials>(encrypted);
  return { client: asaasClient({ environment, apiKey: credentials.apiKey }), credentials };
}

export type AsaasBinding = { organizationId: string; contractId: string; customerId?: string; subscriptionId?: string; state: 'CREATING' | 'READY' | 'UNCERTAIN'; };
export const bindingKey = (environment: AsaasEnvironment, contractId: string) => `asaas:binding:${environment}:${contractId}`;

// Event payload is only a signal. Re-read the payment from the authenticated API.
export async function reconcileAsaasPayment(environment: AsaasEnvironment, eventId: string, paymentId: string) {
  const { client } = await configuredAsaas(environment);
  const payment = await client.payment(paymentId);
  if (!payment.subscription) return;
  const link = await prisma.platformSetting.findUnique({ where: { key: `asaas:subscription:${environment}:${payment.subscription}` } });
  if (!link) return;
  const binding = link.value as unknown as AsaasBinding;
  if (binding.customerId !== payment.customer || binding.subscriptionId !== payment.subscription || binding.state !== 'READY') throw new Error('Vínculo financeiro inválido.');
  if (!Number.isFinite(payment.value) || payment.value < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(payment.dueDate)) throw new Error('Cobrança inválida.');
  const dueAt = new Date(`${payment.dueDate}T12:00:00Z`);
  if (!Number.isFinite(dueAt.getTime())) throw new Error('Vencimento inválido.');
  const status = ['RECEIVED','CONFIRMED','RECEIVED_IN_CASH'].includes(payment.status) ? 'PAID' : payment.status === 'OVERDUE' ? 'OVERDUE' : ['REFUNDED','REFUND_REQUESTED','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL'].includes(payment.status) ? 'CANCELLED' : 'PENDING';
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "PlatformContract" WHERE id = ${binding.contractId} FOR UPDATE`;
    const key = `asaas:event:${environment}:${eventId}`;
    if (await tx.platformSetting.findUnique({ where: { key } })) return;
    const contract = await tx.platformContract.findUnique({ where: { id: binding.contractId } });
    if (!contract || contract.organizationId !== binding.organizationId) throw new Error('Contrato inválido.');
    if (environment === 'sandbox') {
      const safePayment = { id: payment.id, subscription: payment.subscription, customer: payment.customer, status: payment.status, value: payment.value, dueDate: payment.dueDate, billingType: payment.billingType, reconciledStatus: status };
      await tx.platformSetting.upsert({ where: { key: `asaas:payment:sandbox:${payment.id}` }, create: { key: `asaas:payment:sandbox:${payment.id}`, value: safePayment }, update: { value: safePayment } });
      await tx.platformSetting.create({ data: { key, value: { contractId: contract.id, paymentId: payment.id, status } } });
      return;
    }
    const competence = payment.dueDate.slice(0, 7);
    const previous = await tx.saaSCharge.findUnique({ where: { contractId_competence: { contractId: contract.id, competence } } });
    const reference = `asaas:${environment}:${payment.id}`;
    // Never overwrite a manual or another provider charge for the same competence.
    if (previous && previous.reference !== reference) throw new Error('Competência já possui outra cobrança. Requer conciliação administrativa.');
    await tx.saaSCharge.upsert({ where: { contractId_competence: { contractId: contract.id, competence } }, create: { contractId: contract.id, organizationId: contract.organizationId, competence, amount: payment.value, dueAt, status, paymentMethod: payment.billingType, paidAt: status === 'PAID' ? new Date() : null, reference }, update: { status, amount: payment.value, paymentMethod: payment.billingType, paidAt: status === 'PAID' ? previous?.paidAt ?? new Date() : null } });
    // Sandbox never changes real access, financial dashboards or contractual status.
    if (environment === 'production' && status === 'PAID' && !['CANCELLED','SUSPENDED'].includes(contract.status)) {
      await tx.platformContract.update({ where: { id: contract.id }, data: { status: 'ACTIVE' } });
    }
    await tx.platformSetting.create({ data: { key, value: { contractId: contract.id, paymentId: payment.id, status, processedAt: new Date().toISOString() } } });
  });
}
