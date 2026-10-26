'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { fiscalProfileSchema } from '@/lib/fiscal';

export async function saveFiscalProfileAction(_prev: { ok: boolean; message: string } | null, form: FormData) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const profile = fiscalProfileSchema.parse({
      legalName: form.get('legalName') ?? '', cnpj: form.get('cnpj') ?? '', stateRegistration: form.get('stateRegistration') ?? '',
      regime: form.get('regime') ?? '', documentType: form.get('documentType') ?? 'NONE', notes: form.get('notes') ?? '',
    });
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, fiscal: profile } } });
    });
    revalidatePath('/app/configuracoes/fiscal');
    return { ok: true, message: 'Cadastro fiscal salvo. A emissão continua desativada até a integração com um provedor.' };
  } catch (error) {
    return { ok: false, message: error instanceof z.ZodError ? error.issues[0]?.message ?? 'Confira os campos.' : toActionError(error).error };
  }
}

/** Configura o pagamento online da loja (Asaas ou Mercado Pago). Credenciais nunca voltam para a tela. */
export async function saveOnlinePaymentAction(_prev: { ok: boolean; message: string; webhookToken?: string } | null, form: FormData) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const { readOnlinePayment, sealSecrets, newWebhookToken } = await import('@/lib/order-payments');
    const { decryptJson } = await import('@/lib/crypto');
    const enabled = form.get('enabled') === 'on';
    const environment = form.get('environment') === 'production' ? 'production' : 'sandbox';
    const provider = form.get('provider') === 'mercadopago' ? 'mercadopago' : 'asaas';
    const field = (name: string) => String(form.get(name) ?? '').trim();
    const regenerate = form.get('regenerate') === 'on';
    let shownToken: string | undefined;
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      const current = readOnlinePayment(settings);
      const sameProvider = current.provider === provider && current.encrypted;
      let encrypted: string | undefined;
      if (provider === 'mercadopago') {
        const previous = sameProvider ? decryptJson<{ accessToken: string; webhookSecret: string }>(current.encrypted!) : null;
        const accessToken = field('accessToken') || previous?.accessToken;
        const webhookSecret = field('webhookSecret') || previous?.webhookSecret;
        if (enabled && (!accessToken || !webhookSecret)) throw new Error('Informe o Access Token e a assinatura secreta do webhook do Mercado Pago.');
        if (field('accessToken') && !/^(TEST|APP_USR)-[A-Za-z0-9-]{20,300}$/.test(field('accessToken'))) throw new Error('Access Token do Mercado Pago inválido.');
        if (environment === 'sandbox' && accessToken && !accessToken.startsWith('TEST-')) throw new Error('No ambiente de teste use as credenciais de teste do Mercado Pago (começam com TEST-).');
        if (field('webhookSecret') && !/^[A-Za-z0-9]{16,200}$/.test(field('webhookSecret'))) throw new Error('Assinatura secreta do webhook inválida.');
        if (accessToken && webhookSecret) encrypted = sealSecrets({ accessToken, webhookSecret });
      } else {
        const previous = sameProvider ? decryptJson<{ apiKey: string; webhookToken: string }>(current.encrypted!) : null;
        const apiKey = field('apiKey');
        const key = apiKey || previous?.apiKey;
        if (enabled && !key) throw new Error('Informe a chave de API da sua conta Asaas.');
        if (apiKey && (apiKey.length < 20 || apiKey.length > 1000 || /\s/.test(apiKey))) throw new Error('Chave de API inválida.');
        const token = !previous || regenerate ? newWebhookToken() : previous.webhookToken;
        if (key && (!previous || regenerate)) shownToken = token;
        if (key) encrypted = sealSecrets({ apiKey: key, webhookToken: token });
      }
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, onlinePayment: { enabled, environment, provider, ...(encrypted ? { encrypted } : {}) } } } });
    });
    // Sem revalidatePath: a resposta não espera re-renderizar a página; o formulário pede o refresh.
    return { ok: true, message: enabled ? (environment === 'production' && process.env.ORDER_PAYMENTS_PRODUCTION !== 'true' ? 'Salvo. Produção continua bloqueada até a homologação ser liberada pela plataforma.' : `Pagamento online ativo (${environment === 'sandbox' ? 'teste' : 'produção'}).`) : 'Pagamento online desativado.', webhookToken: shownToken };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : toActionError(error).error };
  }
}
