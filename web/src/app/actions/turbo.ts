'use server';
import { storeOpeningMode, storeTimeZone } from '@/lib/schedule';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { OperationError } from '@/lib/operation-error';
import { getDriverMap } from '@/lib/data/drivers';
import { normalizeSchedule, storeOpenState } from '@/lib/schedule';
import { previewTurbo, publishTurboNotices, saveTurboCampaign } from '@/lib/data/turbo';
import { turboCampaignSchema } from '@/lib/turbo';

export type TurboActionState = { ok: boolean; message: string };
function actionMessage(error: unknown) { return error instanceof z.ZodError ? error.issues[0]?.message ?? 'Confira os campos.' : toActionError(error).error; }
async function assertCapacity(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { storeStatus: true, settings: true } });
  const settings = org?.settings && typeof org.settings === 'object' && !Array.isArray(org.settings) ? org.settings as Record<string, unknown> : {};
  if (!org || storeOpenState(org.storeStatus, normalizeSchedule(settings.openingHours), undefined, storeOpeningMode(settings, org.storeStatus), storeTimeZone(settings)) !== 'OPEN') throw new OperationError('A loja precisa estar aberta para ativar ou publicar Entrega Turbo.');
  if (!(await getDriverMap(organizationId)).some(d => !d.accessPending && d.activeOrders.length === 0 && d.status !== 'OFFLINE')) throw new OperationError('Não há entregador online e livre. Revise a capacidade antes de oferecer Entrega Turbo.');
}
export async function saveTurboAction(_state: TurboActionState, form: FormData): Promise<TurboActionState> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_SETTINGS');
    if (form.get('confirm') !== 'on') throw new OperationError('Confirme a configuração antes de salvar.');
    const value = (name: string) => String(form.get(name) ?? '');
    const reason = z.string().trim().min(5).max(500).parse(value('reason'));
    const date = (name: string, suffix: string) => {
      const day = value(name); if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new OperationError('Informe datas válidas.');
      return new Date(`${day}T${suffix}-03:00`).toISOString();
    };
    const data = turboCampaignSchema.parse({ id: value('id') || undefined, name: value('name'), status: value('status'), startsAt: date('startsAt','00:00:00'), endsAt: date('endsAt','23:59:59'), weekdays: form.getAll('weekdays').map(Number), startTime: value('startTime'), endTime: value('endTime'), audience: value('audience'), customerIds: form.getAll('customerIds').map(String), minOrders: Number(value('minOrders')), inactiveDays: Number(value('inactiveDays')), conditions: value('conditions'), message: value('message'), frequencyHours: Number(value('frequencyHours')), audienceLimit: Number(value('audienceLimit')) });
    if (data.status === 'ACTIVE') {
      if (form.get('capacityConfirmed') !== 'on') throw new OperationError('Confirme as condições e a capacidade operacional da loja.');
      await assertCapacity(organizationId);
    }
    await saveTurboCampaign(organizationId,user.id,data,reason);
    revalidatePath('/app/campanhas'); return { ok: true, message: 'Entrega Turbo salva. Nenhum aviso foi publicado automaticamente.' };
  } catch (error) { return { ok: false, message: actionMessage(error) }; }
}
export async function previewTurboAction(campaignId: string) {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    return { ok: true as const, preview: await previewTurbo(organizationId,z.string().uuid().parse(campaignId)) };
  } catch (error) { return { ok: false as const, message: actionMessage(error) }; }
}
export async function publishTurboAction(_state: TurboActionState, form: FormData): Promise<TurboActionState> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_SETTINGS');
    if (form.get('confirm') !== 'on' || form.get('capacityConfirmed') !== 'on') throw new OperationError('Confirme o público, as condições e a capacidade operacional.');
    const campaignId = z.string().uuid().parse(form.get('campaignId'));
    const digest = z.string().regex(/^[a-f0-9]{64}$/).parse(form.get('digest'));
    const reason = z.string().trim().min(5).max(500).parse(form.get('reason'));
    await assertCapacity(organizationId);
    const count = await publishTurboNotices(organizationId,user.id,campaignId,digest,reason);
    revalidatePath('/app/campanhas'); return { ok: true, message: `${count} avisos internos publicados. Não houve envio por WhatsApp, push ou e-mail.` };
  } catch (error) { return { ok: false, message: actionMessage(error) }; }
}
