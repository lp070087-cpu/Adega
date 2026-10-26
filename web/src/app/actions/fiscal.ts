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
      defaultNcm: form.get('defaultNcm') ?? '', defaultCfop: form.get('defaultCfop') ?? '5102', icmsCode: form.get('icmsCode') ?? '', origin: form.get('origin') ?? '0',
    });
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, fiscal: profile } } });
    });
    revalidatePath('/app/configuracoes/fiscal');
    return { ok: true, message: 'Cadastro fiscal salvo.' };
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

/** Provedor fiscal (Focus NFe): token write-only e ambiente. Produção depende de liberação da plataforma. */
export async function saveFiscalProviderAction(_prev: { ok: boolean; message: string } | null, form: FormData) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const { readFiscalProvider, sealFiscalToken } = await import('@/lib/fiscal-provider');
    const token = String(form.get('token') ?? '').trim();
    const environment = form.get('environment') === 'producao' ? 'producao' : 'homologacao';
    if (token && !/^[A-Za-z0-9]{16,128}$/.test(token)) throw new Error('Token do provedor inválido.');
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      const current = readFiscalProvider(settings);
      const encrypted = token ? sealFiscalToken(token) : current.encrypted;
      if (!encrypted) throw new Error('Informe o token do provedor fiscal.');
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, fiscalProvider: { provider: 'focusnfe', environment, encrypted } } } });
    });
    revalidatePath('/app/configuracoes/fiscal');
    return { ok: true, message: environment === 'producao' && process.env.FISCAL_PRODUCTION !== 'true' ? 'Salvo. A emissão em produção continua bloqueada até a liberação da plataforma.' : 'Provedor salvo (homologação: notas sem valor fiscal).' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : toActionError(error).error };
  }
}

type InvoiceResult = { ok: true; doc: import('@/lib/fiscal-provider').FiscalDocument | null } | { ok: false; error: string };

export async function getInvoiceAction(input: { orderId: string }): Promise<InvoiceResult> {
  try {
    const ctx = await requirePermission('MANAGE_ORDERS');
    const { readFiscalDocument } = await import('@/lib/fiscal-provider');
    const { prisma } = await import('@/lib/db');
    if (!(await prisma.order.count({ where: { id: input.orderId, organizationId: ctx.organizationId } }))) return { ok: false, error: 'Pedido não encontrado.' };
    return { ok: true, doc: await readFiscalDocument(input.orderId) };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : toActionError(error).error }; }
}

export async function emitInvoiceAction(input: { orderId: string }): Promise<InvoiceResult> {
  try { const ctx = await requirePermission('MANAGE_ORDERS'); const { emitNfce } = await import('@/lib/fiscal-provider'); return { ok: true, doc: await emitNfce(ctx.organizationId, String(input.orderId)) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : toActionError(error).error }; }
}

export async function consultInvoiceAction(input: { orderId: string }): Promise<InvoiceResult> {
  try { const ctx = await requirePermission('MANAGE_ORDERS'); const { consultNfce } = await import('@/lib/fiscal-provider'); return { ok: true, doc: await consultNfce(ctx.organizationId, String(input.orderId)) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : toActionError(error).error }; }
}

export async function cancelInvoiceAction(input: { orderId: string; reason: string }): Promise<InvoiceResult> {
  try { const ctx = await requirePermission('MANAGE_SETTINGS'); const { cancelNfce } = await import('@/lib/fiscal-provider'); return { ok: true, doc: await cancelNfce(ctx.organizationId, String(input.orderId), String(input.reason ?? '')) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : toActionError(error).error }; }
}
