'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { decrypt, encrypt, isEncryptionConfigured } from '@/lib/crypto';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { assistantReady, graphVersion, whatsappConnectChecklist } from '@/lib/assistant/service';
import { exchangeSignupCode, MetaError, registerPhoneNumber, subscribeApp, verifyPhoneNumber } from '@/lib/assistant/meta-connect';
import { OperationError } from '@/lib/operation-error';

type Result = { ok: true; message: string } | { ok: false; error: string };
const failure = (error: unknown): { ok: false; error: string } => (error instanceof MetaError ? { ok: false, error: error.message } : { ok: false, ...toActionError(error) });
const SETTINGS_PATH = '/app/configuracoes/whatsapp';

/** O que falta para abrir o Embedded Signup. Nunca devolve valores, só nomes de item. */
export async function startWhatsAppConnectionAction() {
  try {
    await requirePermission('MANAGE_SETTINGS');
    const pending = whatsappConnectChecklist().filter((item) => !item.ok).map(({ key, label }) => ({ key, label }));
    if (pending.length || !(await assistantReady())) return { ok: true as const, ready: false as const, pending };
    return { ok: true as const, ready: true as const, appId: process.env.WHATSAPP_APP_ID!, configId: process.env.WHATSAPP_EMBEDDED_CONFIG_ID!, version: graphVersion() };
  } catch (error) {
    return failure(error);
  }
}

const finishSchema = z.object({ code: z.string().min(10).max(4000), phoneNumberId: z.string().regex(/^\d{5,30}$/), wabaId: z.string().regex(/^\d{5,30}$/) });

export async function finishWhatsAppConnectionAction(input: unknown): Promise<Result> {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const data = finishSchema.parse(input);
    if (!isEncryptionConfigured() || !process.env.WHATSAPP_APP_ID || !process.env.WHATSAPP_APP_SECRET || !(await assistantReady())) throw new OperationError('A plataforma ainda não está pronta para conectar o WhatsApp.');
    const owner = await prisma.assistantChannel.findUnique({ where: { phoneNumberId: data.phoneNumberId }, select: { organizationId: true } });
    if (owner && owner.organizationId !== ctx.organizationId) throw new OperationError('Este número já está conectado a outro estabelecimento.');

    const version = graphVersion();
    const token = await exchangeSignupCode(version, { appId: process.env.WHATSAPP_APP_ID, appSecret: process.env.WHATSAPP_APP_SECRET, code: data.code });
    const phone = await verifyPhoneNumber(version, data.phoneNumberId, token);
    await subscribeApp(version, data.wabaId, token);
    await registerPhoneNumber(version, data.phoneNumberId, token, String(randomInt(100000, 1000000)));

    const encryptedToken = encrypt(token);
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const values = { phoneNumberId: data.phoneNumberId, encryptedToken, enabled: true, verifiedAt: new Date(), webhookVerifiedAt: null };
      await tx.assistantChannel.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...values }, update: values });
      await tx.notification.create({ data: { organizationId: ctx.organizationId, userId: ctx.user.id, type: 'SYSTEM', title: 'WhatsApp oficial conectado', message: `Número ${phone.phone ?? data.phoneNumberId} confirmado pela Meta.`, href: SETTINGS_PATH } });
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, message: `Número ${phone.phone ?? data.phoneNumberId}${phone.name ? ` (${phone.name})` : ''} confirmado pela Meta. Envie uma mensagem de teste para confirmar o recebimento.` };
  } catch (error) {
    return failure(error);
  }
}

/** Testa o token gravado na Meta. Se ela recusar, a tela deixa de mostrar o número como conectado. */
export async function checkWhatsAppConnectionAction(): Promise<Result> {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const channel = await prisma.assistantChannel.findUnique({ where: { organizationId: ctx.organizationId } });
    if (!channel?.enabled || !channel.encryptedToken) throw new OperationError('Nenhum número conectado.');
    try {
      const phone = await verifyPhoneNumber(graphVersion(), channel.phoneNumberId, decrypt(channel.encryptedToken));
      await prisma.assistantChannel.update({ where: { id: channel.id }, data: { verifiedAt: new Date() } });
      revalidatePath(SETTINGS_PATH);
      return { ok: true, message: `Conexão confirmada pela Meta agora: ${phone.phone ?? channel.phoneNumberId}.` };
    } catch (error) {
      if (error instanceof MetaError && error.status !== null && error.status >= 400 && error.status < 500) {
        await prisma.assistantChannel.update({ where: { id: channel.id }, data: { verifiedAt: null } });
        revalidatePath(SETTINGS_PATH);
      }
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}

/** Desliga o canal e apaga o token. A IA da loja para junto. */
export async function disconnectWhatsAppAction(): Promise<Result> {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const changed = await tx.assistantChannel.updateMany({ where: { organizationId: ctx.organizationId }, data: { enabled: false, encryptedToken: '', verifiedAt: null, webhookVerifiedAt: null } });
      if (!changed.count) throw new OperationError('Nenhum número conectado.');
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
      const settings = (org?.settings ?? {}) as Record<string, any>;
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, assistant: { ...settings.assistant, enabled: false } } } });
      await tx.notification.create({ data: { organizationId: ctx.organizationId, userId: ctx.user.id, type: 'SYSTEM', title: 'WhatsApp oficial desconectado', message: 'Conexão removida pelo responsável da loja.', href: SETTINGS_PATH } });
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, message: 'Número desconectado. O token foi apagado.' };
  } catch (error) {
    return failure(error);
  }
}
