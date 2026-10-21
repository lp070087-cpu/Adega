'use server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePlatformRole } from '@/lib/platform/auth';
import { encryptJson } from '@/lib/crypto';
import { asaasReady, configuredAsaas, bindingKey, type AsaasBinding } from '@/lib/platform/asaas';
import { revalidatePath } from 'next/cache';

export async function saveAsaasCredentials(form: FormData): Promise<void> {
  const operator = await requirePlatformRole(['OWNER','ADMIN']);
  if (!await asaasReady()) throw new Error('Ativação do Asaas pendente.');
  const input = z.object({ environment: z.enum(['sandbox','production']), apiKey: z.string().trim().min(20).max(1000), webhookToken: z.string().regex(/^\S{32,255}$/), reason: z.string().trim().min(10).max(500) }).parse(Object.fromEntries(form));
  const encrypted = encryptJson({ apiKey: input.apiKey, webhookToken: input.webhookToken });
  await prisma.$transaction(async tx => {
    await tx.platformSetting.upsert({ where: { key: `asaas:credentials:${input.environment}` }, create: { key: `asaas:credentials:${input.environment}`, value: { encrypted } }, update: { value: { encrypted } } });
    await tx.platformAudit.create({ data: { operatorId: operator.operatorId, action: 'ASAAS_CREDENTIALS', resourceType: 'Asaas', resourceId: input.environment, reason: input.reason } });
  });
  revalidatePath('/admin/asaas');
}

export async function createAsaasSandboxSubscription(form: FormData): Promise<void> {
  const operator = await requirePlatformRole(['OWNER','ADMIN','FINANCE']);
  const input = z.object({ contractId: z.string().min(1).max(100), name: z.string().trim().min(3).max(200), email: z.string().email(), cpfCnpj: z.string().regex(/^(\d{11}|\d{14})$/), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), billingType: z.enum(['PIX','BOLETO']), confirmation: z.literal('CRIAR NO SANDBOX') }).parse(Object.fromEntries(form));
  const day = new Date(`${input.dueDate}T12:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== input.dueDate || input.dueDate < new Date().toISOString().slice(0,10)) throw new Error('Vencimento inválido.');
  const { client } = await configuredAsaas('sandbox');
  const key = bindingKey('sandbox', input.contractId);
  const binding = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "PlatformContract" WHERE id = ${input.contractId} FOR UPDATE`;
    const contract = await tx.platformContract.findUnique({ where: { id: input.contractId } });
    if (!contract || Number(contract.amount) !== 119 || contract.period !== 'MONTHLY' || ['CANCELLED','SUSPENDED'].includes(contract.status)) throw new Error('Selecione contrato mensal de R$ 119,00 elegível.');
    if (await tx.platformSetting.findUnique({ where: { key } })) throw new Error('Operação já iniciada. Consulte o vínculo antes de repetir.');
    const value: AsaasBinding = { contractId: contract.id, organizationId: contract.organizationId, state: 'CREATING' };
    await tx.platformSetting.create({ data: { key, value } });
    await tx.platformAudit.create({ data: { operatorId: operator.operatorId, action: 'ASAAS_SANDBOX_REQUEST', resourceType: 'PlatformContract', resourceId: contract.id, organizationId: contract.organizationId, reason: 'Criação explicitamente confirmada no Sandbox' } });
    return value;
  });
  try {
    const reference = `adega:sandbox:${binding.organizationId}`;
    const customers = await client.customers(reference);
    if (customers.data.length > 1) throw new Error('Clientes duplicados; conciliação necessária.');
    const customer = customers.data[0] ?? await client.createCustomer({ name: input.name, email: input.email, cpfCnpj: input.cpfCnpj, externalReference: reference });
    if (!customer.id) throw new Error('Resposta inválida.');
    binding.customerId = customer.id;
    await prisma.platformSetting.update({ where: { key }, data: { value: binding } });
    const subscription = await client.createSubscription(customer.id, `adega:sandbox:${binding.contractId}`, input.dueDate, input.billingType);
    if (!subscription.id) throw new Error('Resposta inválida.');
    binding.subscriptionId = subscription.id; binding.state = 'READY';
    await prisma.$transaction(async tx => {
      await tx.platformSetting.update({ where: { key }, data: { value: binding } });
      await tx.platformSetting.create({ data: { key: `asaas:subscription:sandbox:${subscription.id}`, value: binding } });
      await tx.platformAudit.create({ data: { operatorId: operator.operatorId, action: 'ASAAS_SANDBOX_CREATED', resourceType: 'PlatformContract', resourceId: binding.contractId, organizationId: binding.organizationId, reason: 'Assinatura criada no Sandbox; nenhum pagamento confirmado', details: { subscriptionId: subscription.id } } });
    });
  } catch {
    binding.state = 'UNCERTAIN';
    await prisma.platformSetting.update({ where: { key }, data: { value: binding } });
    throw new Error('Operação requer consulta no Asaas antes de nova tentativa. Nenhuma repetição automática foi realizada.');
  }
  revalidatePath('/admin/asaas');
}

export async function manageAsaasSandboxSubscription(form: FormData): Promise<void> {
  const operator = await requirePlatformRole(['OWNER','ADMIN','FINANCE']);
  const input = z.object({ contractId: z.string().min(1).max(100), operation: z.enum(['REFRESH','ACTIVE','INACTIVE','CANCEL']), reason: z.string().trim().min(10).max(500), confirmation: z.literal('CONFIRMAR SANDBOX') }).parse(Object.fromEntries(form));
  const { client } = await configuredAsaas('sandbox');
  const key = bindingKey('sandbox', input.contractId);
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  const binding = row?.value as AsaasBinding | undefined;
  if (!binding || binding.state !== 'READY' || !binding.subscriptionId) throw new Error('Assinatura ainda não conciliada.');
  const contract = await prisma.platformContract.findUnique({ where: { id: input.contractId } });
  if (!contract || contract.organizationId !== binding.organizationId) throw new Error('Vínculo inválido.');
  const subscription = await client.subscription(binding.subscriptionId);
  if (subscription.id !== binding.subscriptionId || subscription.customer !== binding.customerId) throw new Error('Vínculo inválido no provedor.');
  // Request audit is durable even if the provider's mutation response is inconclusive.
  await prisma.platformAudit.create({ data: { operatorId: operator.operatorId, action: `ASAAS_SANDBOX_${input.operation}_REQUEST`, resourceType: 'PlatformContract', resourceId: contract.id, organizationId: contract.organizationId, reason: input.reason } });
  const history = input.operation === 'CANCEL' ? await client.payments(binding.subscriptionId) : null;
  if (input.operation === 'ACTIVE' || input.operation === 'INACTIVE') await client.setStatus(binding.subscriptionId, input.operation);
  if (input.operation === 'CANCEL') {
    const removed = await client.cancel(binding.subscriptionId);
    if (!removed.deleted) throw new Error('Cancelamento não confirmado pelo provedor.');
  }
  const current = input.operation === 'CANCEL' ? { id: binding.subscriptionId, customer: binding.customerId ?? '', status: 'DELETED' } : await client.subscription(binding.subscriptionId);
  const payments = history ?? await client.payments(binding.subscriptionId);
  const snapshot = { subscription: { id: current.id, customer: current.customer, status: current.status }, payments: payments.data.map(p => ({ id: p.id, status: p.status, value: p.value, dueDate: p.dueDate })), checkedAt: new Date().toISOString() };
  await prisma.$transaction(async tx => {
    await tx.platformSetting.upsert({ where: { key: `asaas:snapshot:sandbox:${contract.id}` }, create: { key: `asaas:snapshot:sandbox:${contract.id}`, value: snapshot }, update: { value: snapshot } });
    await tx.platformAudit.create({ data: { operatorId: operator.operatorId, action: `ASAAS_SANDBOX_${input.operation}`, resourceType: 'PlatformContract', resourceId: contract.id, organizationId: contract.organizationId, reason: input.reason, details: { providerStatus: current.status } } });
  });
  revalidatePath('/admin/asaas');
}
