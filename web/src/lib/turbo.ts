import { z } from 'zod';
import type { GrowthState } from './growth';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const turboCampaignSchema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(3).max(100),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED']), startsAt: z.string().datetime(), endsAt: z.string().datetime(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform(v => [...new Set(v)]),
  startTime: time, endTime: time,
  audience: z.enum(['ALL', 'RECENT_30', 'CUSTOM']),
  customerIds: z.array(z.string().min(1).max(100)).max(1000).transform(v => [...new Set(v)]),
  minOrders: z.number().int().min(0).max(10000), inactiveDays: z.number().int().min(0).max(730),
  conditions: z.string().trim().min(10).max(1000), message: z.string().trim().min(10).max(1000),
  frequencyHours: z.number().int().min(24).max(8760), audienceLimit: z.number().int().min(1).max(1000),
}).refine(v => new Date(v.endsAt) > new Date(v.startsAt), 'O término deve ser posterior ao início.')
  .refine(v => v.startTime !== v.endTime, 'Informe horários de início e término diferentes.')
  .refine(v => v.audience !== 'CUSTOM' || v.customerIds.length > 0 || v.minOrders > 0 || v.inactiveDays > 0, 'Selecione clientes ou um filtro para o público personalizado.');
export type TurboCampaign = z.infer<typeof turboCampaignSchema> & { id: string; createdAt: string; createdBy: string; updatedAt: string };
export type TurboCustomer = { id: string; name: string; createdAt: Date; lastOrderAt: Date | null; deliveredOrders?: number };
export type TurboNotice = { id: string; key: string; campaignId: string; customerId: string; title: string; message: string; conditions: string; createdAt: string; endsAt: string; actorId: string };

export function turboHoursMatch(campaign: Pick<TurboCampaign, 'weekdays' | 'startTime' | 'endTime'>, now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const weekday = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`).getUTCDay();
  const current = `${parts.hour}:${parts.minute}`;
  if (campaign.startTime < campaign.endTime) return campaign.weekdays.includes(weekday) && current >= campaign.startTime && current < campaign.endTime;
  return current >= campaign.startTime ? campaign.weekdays.includes(weekday) : current < campaign.endTime && campaign.weekdays.includes((weekday + 6) % 7);
}

export function turboEligibility(campaign: TurboCampaign, customer: TurboCustomer, state: GrowthState, now = new Date(), preview = false): string | null {
  if (!turboCampaignSchema.safeParse(campaign).success) return 'Configuração inválida';
  if (!preview && campaign.status !== 'ACTIVE') return 'Campanha inativa';
  if (now < new Date(campaign.startsAt) || now > new Date(campaign.endsAt)) return 'Fora da validade';
  if (!turboHoursMatch(campaign, now)) return 'Fora do horário da campanha';
  const consent = state.consents[customer.id];
  if (!consent || consent.optOut || consent.turboConsent !== true) return 'Sem consentimento para avisos internos de Entrega Turbo';
  if (campaign.audience === 'RECENT_30' && (!customer.lastOrderAt || now.getTime() - customer.lastOrderAt.getTime() > 30 * 86400000 || customer.lastOrderAt > now)) return 'Sem pedido entregue nos últimos 30 dias';
  if (campaign.audience === 'CUSTOM') {
    if (campaign.customerIds.length && !campaign.customerIds.includes(customer.id)) return 'Fora dos clientes selecionados';
    if ((customer.deliveredOrders ?? 0) < campaign.minOrders) return 'Fora do filtro de pedidos';
    if ((now.getTime() - (customer.lastOrderAt ?? customer.createdAt).getTime()) / 86400000 < campaign.inactiveDays) return 'Fora do filtro de inatividade';
  }
  if (state.turboNotices.some(n => n.campaignId === campaign.id && n.customerId === customer.id)) return 'Aviso desta campanha já publicado';
  const since = now.getTime() - campaign.frequencyHours * 3600000;
  if (state.turboNotices.some(n => n.customerId === customer.id && new Date(n.createdAt).getTime() > since) || state.contacts.some(n => n.customerId === customer.id && new Date(n.createdAt).getTime() > since)) return 'Limite de frequência';
  if (state.turboNotices.filter(n => n.campaignId === campaign.id).length >= campaign.audienceLimit) return 'Limite da campanha atingido';
  return null;
}

export function previewTurboAudience(campaign: TurboCampaign, customers: TurboCustomer[], state: GrowthState, now = new Date()) {
  const remaining = Math.max(0, campaign.audienceLimit - state.turboNotices.filter(n => n.campaignId === campaign.id).length);
  return customers.filter(c => !turboEligibility(campaign, c, state, now, true)).slice(0, remaining);
}
