import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { growthState, GROWTH_EVENT_LIMIT } from '@/lib/growth';
import { previewTurboAudience, turboCampaignSchema, type TurboCampaign, type TurboCustomer } from '@/lib/turbo';
import { OperationError } from '@/lib/operation-error';
import { withOrganizationTransaction } from './transaction';

async function customersFor(tx: Prisma.TransactionClient, organizationId: string, campaign: TurboCampaign): Promise<TurboCustomer[]> {
  const rows = await tx.customer.findMany({ where: { organizationId, ...(campaign.audience === 'CUSTOM' && campaign.customerIds.length ? { id: { in: campaign.customerIds } } : {}) }, take: 1001, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true, createdAt: true, orders: { where: { status: 'DELIVERED' }, take: 1, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }, _count: { select: { orders: { where: { status: 'DELIVERED' } } } } } });
  if (rows.length > 1000) throw new OperationError('Esta prévia suporta até 1.000 clientes. Use público personalizado com seleção para publicar em grupos.');
  return rows.map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt, lastOrderAt: c.orders[0]?.createdAt ?? null, deliveredOrders: c._count.orders }));
}
function digest(campaign: TurboCampaign, customers: TurboCustomer[]) {
  return createHash('sha256').update(JSON.stringify({ campaign, customers: customers.map(c => c.id).sort() })).digest('hex');
}
async function read(tx: Prisma.TransactionClient, organizationId: string, campaignId: string) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  const settings = org.settings && typeof org.settings === 'object' && !Array.isArray(org.settings) ? org.settings as Prisma.JsonObject : {};
  const state = growthState(settings);
  const campaign = state.turboCampaigns.find(c => c.id === campaignId);
  if (!campaign) throw new OperationError('Campanha de Entrega Turbo não encontrada nesta loja.');
  return { settings, state, campaign };
}
export async function previewTurbo(organizationId: string, campaignId: string) {
  const { state, campaign } = await read(prisma, organizationId, campaignId);
  const all = await customersFor(prisma, organizationId, campaign);
  const eligible = previewTurboAudience(campaign, all, state);
  return { digest: digest(campaign, eligible), customers: eligible.map(c => ({ id: c.id, name: c.name })), evaluated: all.length, excluded: all.length - eligible.length, active: campaign.status === 'ACTIVE' };
}
export async function saveTurboCampaign(organizationId: string, actorId: string, input: unknown, reason: string) {
  const parsed = turboCampaignSchema.parse(input);
  return withOrganizationTransaction(organizationId, async tx => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
    const settings = org.settings && typeof org.settings === 'object' && !Array.isArray(org.settings) ? org.settings as Prisma.JsonObject : {};
    const state = growthState(settings);
    const previous = state.turboCampaigns.find(c => c.id === parsed.id);
    if (parsed.id && !previous) throw new OperationError('Campanha de Entrega Turbo não encontrada nesta loja.');
    if (!previous && state.turboCampaigns.length >= 50) throw new OperationError('Limite de 50 campanhas de Entrega Turbo atingido. Reutilize uma campanha existente.');
    if (parsed.customerIds.length) {
      const count = await tx.customer.count({ where: { organizationId, id: { in: parsed.customerIds } } });
      if (count !== parsed.customerIds.length) throw new OperationError('Todos os clientes selecionados devem pertencer a esta loja.');
    }
    const now = new Date().toISOString();
    const campaign: TurboCampaign = { ...parsed, id: previous?.id ?? randomUUID(), createdAt: previous?.createdAt ?? now, createdBy: previous?.createdBy ?? actorId, updatedAt: now };
    state.turboCampaigns = previous ? state.turboCampaigns.map(c => c.id === previous.id ? campaign : c) : [...state.turboCampaigns, campaign];
    await tx.organization.update({ where: { id: organizationId }, data: { settings: { ...settings, growth: state as unknown as Prisma.InputJsonValue } } });
    await tx.notification.create({ data: { organizationId, userId: actorId, type: 'SYSTEM', title: 'Entrega Turbo atualizada', message: `${campaign.name}: ${campaign.status}. Motivo: ${reason}`, href: '/app/campanhas?aba=turbo' } });
    return campaign.id;
  });
}
/** Internal notices only. No WhatsApp, push or email is sent by this operation. */
export async function publishTurboNotices(organizationId: string, actorId: string, campaignId: string, expectedDigest: string, reason: string) {
  return withOrganizationTransaction(organizationId, async tx => {
    const { settings, state, campaign } = await read(tx, organizationId, campaignId);
    if (campaign.status !== 'ACTIVE') throw new OperationError('Ative a campanha antes de publicar avisos.');
    const eligible = previewTurboAudience(campaign, await customersFor(tx, organizationId, campaign), state);
    if (expectedDigest !== digest(campaign, eligible)) throw new OperationError('O público ou a campanha mudou. Atualize a prévia antes de confirmar.');
    if (!eligible.length) throw new OperationError('Nenhum cliente com consentimento e critérios elegíveis neste horário.');
    if (state.turboNotices.length + eligible.length > GROWTH_EVENT_LIMIT) throw new OperationError('Limite do histórico de avisos atingido. Nenhum histórico foi apagado.');
    const createdAt = new Date().toISOString();
    for (const customer of eligible) state.turboNotices.push({ id: randomUUID(), key: `${campaign.id}:${customer.id}`, campaignId: campaign.id, customerId: customer.id, title: campaign.name, message: campaign.message, conditions: campaign.conditions, createdAt, endsAt: campaign.endsAt, actorId });
    await tx.organization.update({ where: { id: organizationId }, data: { settings: { ...settings, growth: state as unknown as Prisma.InputJsonValue } } });
    await tx.notification.create({ data: { organizationId, userId: actorId, type: 'SYSTEM', title: 'Avisos internos de Entrega Turbo publicados', message: `${eligible.length} clientes elegíveis. Motivo: ${reason}`, href: '/app/campanhas?aba=turbo' } });
    return eligible.length;
  });
}
