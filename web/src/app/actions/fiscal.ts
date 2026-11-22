'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { checkProductRegime, fiscalProfileSchema, fiscalSettings, productFiscalSchema, readFiscalProfile, validFiscalCnpj } from '@/lib/fiscal';

export async function saveFiscalProfileAction(_prev: { ok: boolean; message: string } | null, form: FormData) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const profile = fiscalProfileSchema.parse({
      legalName: form.get('legalName') ?? '', cnpj: form.get('cnpj') ?? '', stateRegistration: form.get('stateRegistration') ?? '',
      regime: form.get('regime') ?? '', documentType: form.get('documentType') ?? 'NONE', notes: form.get('notes') ?? '',
      uf: form.get('uf') ?? '',
    });
    if (profile.cnpj && !validFiscalCnpj(profile.cnpj)) return { ok: false, message: 'Confira os dígitos verificadores do CNPJ.' };
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

export async function saveProductFiscalAction(_prev: { ok: boolean; message: string } | null, form: FormData) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const productId = z.string().min(1).max(100).parse(form.get('productId'));
    const rate = (key: string) => {
      const value = String(form.get(key) ?? '').trim();
      return value ? Number(value.replace(',', '.')) : null;
    };
    const productFiscal = productFiscalSchema.parse({
      ncm: form.get('ncm'), cest: form.get('cest'), cfop: form.get('cfop'), origin: form.get('origin'),
      icmsCode: form.get('icmsCode'), icmsRate: rate('icmsRate'), pisCode: form.get('pisCode'), pisRate: rate('pisRate'),
      cofinsCode: form.get('cofinsCode'), cofinsRate: rate('cofinsRate'), unit: form.get('unit'),
    });
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const [product, org] = await Promise.all([
        tx.product.findFirst({ where: { id: productId, organizationId: ctx.organizationId }, select: { id: true } }),
        tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } }),
      ]);
      if (!product) throw new Error('Produto não encontrado neste estabelecimento.');
      const settings = fiscalSettings(org?.settings);
      checkProductRegime(readFiscalProfile(settings), productFiscal);
      const fiscalProducts = { ...fiscalSettings(settings.fiscalProducts) as Prisma.InputJsonObject, [product.id]: productFiscal };
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, fiscalProducts } } });
    });
    revalidatePath('/app/configuracoes/fiscal');
    return { ok: true, message: 'Tributação do produto salva.' };
  } catch (error) {
    return { ok: false, message: error instanceof z.ZodError ? error.issues[0]?.message ?? 'Confira os campos.' : error instanceof Error ? error.message : toActionError(error).error };
  }
}

/** Configura o pagamento online da loja (InfinitePay ou Mercado Pago). Credenciais nunca voltam para a tela. */
export async function saveOnlinePaymentAction(_prev: { ok: boolean; message: string; webhookToken?: string } | null, form: FormData) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const { checkPaymentCredential, readOnlinePayment, sealSecrets, newWebhookToken } = await import('@/lib/order-payments');
    const { decryptJson } = await import('@/lib/crypto');
    const enabled = form.get('enabled') === 'on';
    const environment = form.get('environment') === 'production' ? 'production' : 'sandbox';
    const providerRaw = form.get('provider');
    const field = (name: string) => String(form.get(name) ?? '').trim();
    if (providerRaw === 'infinitepay') return await saveInfinitePay(ctx.organizationId, enabled, field('handle'), field('infinitePayApiKey'));
    // Só InfinitePay e Mercado Pago: o Asaas não é mais oferecido às lojas.
    if (providerRaw !== 'mercadopago') throw new Error('Escolha InfinitePay ou Mercado Pago.');
    const provider = 'mercadopago' as const;
    const regenerate = form.get('regenerate') === 'on';
    let shownToken: string | undefined;
    // Credencial nova vai ao provedor antes de gravar: recusada não é salva.
    const typedSecret = provider === 'mercadopago' ? field('accessToken') : field('apiKey');
    const check = typedSecret ? await checkPaymentCredential(provider, environment, typedSecret) : null;
    if (check?.status === 'rejected') throw new Error(`${check.detail} Nada foi salvo.`);
    let verifiedAt: string | undefined;
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      const current = readOnlinePayment(settings);
      const sameProvider = current.provider === provider && current.encrypted;
      verifiedAt = check ? (check.status === 'valid' ? new Date().toISOString() : undefined) : sameProvider ? current.verifiedAt : undefined;
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
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, onlinePayment: { enabled, environment, provider, ...(encrypted ? { encrypted } : {}), ...(verifiedAt ? { verifiedAt } : {}) } } } });
    });
    // Sem revalidatePath: a resposta não espera re-renderizar a página; o formulário pede o refresh.
    return { ok: true, message: enabled ? (environment === 'production' && process.env.ORDER_PAYMENTS_PRODUCTION !== 'true' ? 'Salvo. Produção continua bloqueada até a homologação ser liberada pela plataforma.' : `Pagamento online ativo (${environment === 'sandbox' ? 'teste' : 'produção'}).${check?.status === 'unavailable' ? ` Salvo sem confirmação: ${check.detail}` : verifiedAt ? '' : ' Use Testar conexão para confirmar a credencial.'}`) : 'Pagamento online desativado.', webhookToken: shownToken };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : toActionError(error).error };
  }
}

/**
 * InfinitePay: só a InfiniteTag da loja (sem chave, sem sandbox). Uma tag nova
 * é conferida na InfinitePay antes de gravar; recusada não é salva.
 */
async function saveInfinitePay(organizationId: string, enabled: boolean, typed: string, apiKey: string): Promise<{ ok: boolean; message: string; webhookToken?: string }> {
  const { checkInfiniteTag, readOnlinePayment } = await import('@/lib/order-payments');
  const { encryptJson } = await import('@/lib/crypto');
  const { normalizeInfiniteTag, validInfiniteTag } = await import('@/lib/payments/infinitepay');
  const { prisma } = await import('@/lib/db');
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const current = readOnlinePayment(org?.settings);
  const previous = current.provider === 'infinitepay' ? current.handle : undefined;
  const handle = typed ? normalizeInfiniteTag(typed) : previous;
  if (typed && !validInfiniteTag(handle)) throw new Error('InfiniteTag inválida. Use só letras, números, ponto, hífen ou sublinhado, sem o cifrão.');
  if (enabled && !handle) throw new Error('Informe a InfiniteTag da loja.');
  if (apiKey && !/^inchk_[A-Za-z0-9_-]{8,248}$/.test(apiKey)) throw new Error('A API Key precisa começar com inchk_.');
  if (apiKey && !handle) throw new Error('Informe também a InfiniteTag da loja.');
  const encrypted = apiKey ? encryptJson({ apiKey }) : current.provider === 'infinitepay' && handle === previous ? current.encrypted : undefined;
  const check = handle && (handle !== previous || apiKey) ? await checkInfiniteTag(handle, fetch, apiKey || undefined) : null;
  if (apiKey && check?.status !== 'valid') throw new Error(check?.detail ?? 'Não foi possível validar a API Key da InfinitePay.');
  if (check?.status === 'rejected') throw new Error(`${check.detail} Nada foi salvo.`);
  const verifiedAt = check ? (check.status === 'valid' ? new Date().toISOString() : undefined) : current.provider === 'infinitepay' ? current.verifiedAt : undefined;
  await withOrganizationTransaction(organizationId, async (tx) => {
    const fresh = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    const settings = (fresh?.settings ?? {}) as Record<string, unknown>;
    await tx.organization.update({ where: { id: organizationId }, data: { settings: { ...settings, onlinePayment: { enabled, environment: 'production', provider: 'infinitepay', ...(handle ? { handle } : {}), ...(encrypted ? { encrypted } : {}), ...(verifiedAt ? { verifiedAt } : {}) } } } });
  });
  const tag = handle ? ` (InfiniteTag ${handle})` : '';
  return { ok: true, message: enabled ? `Pagamento pela InfinitePay ativo${tag}.${check?.status === 'unavailable' ? ` Salvo sem confirmação: ${check.detail}` : ''}` : 'Pagamento online desativado.' };
}

/** Testa a credencial já salva no provedor e grava o resultado. */
export async function testOnlinePaymentAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const { checkPaymentCredential, readOnlinePayment } = await import('@/lib/order-payments');
    const { decryptJson } = await import('@/lib/crypto');
    const { prisma } = await import('@/lib/db');
    const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
    const current = readOnlinePayment(org?.settings);
    let check;
    if (current.provider === 'infinitepay') {
      if (!current.handle) return { ok: false, message: 'Salve a InfiniteTag antes de testar.' };
      check = await (await import('@/lib/order-payments')).checkInfiniteTag(current.handle);
    } else {
      if (!current.encrypted) return { ok: false, message: 'Salve a credencial antes de testar.' };
      const secrets = decryptJson<{ accessToken?: string; apiKey?: string }>(current.encrypted);
      check = await checkPaymentCredential(current.provider, current.environment, (current.provider === 'mercadopago' ? secrets.accessToken : secrets.apiKey) ?? '');
    }
    if (check.status !== 'unavailable') {
      await withOrganizationTransaction(ctx.organizationId, async (tx) => {
        const fresh = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
        const settings = (fresh?.settings ?? {}) as Record<string, any>;
        const { verifiedAt: _old, ...rest } = settings.onlinePayment ?? {};
        await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, onlinePayment: { ...rest, ...(check.status === 'valid' ? { verifiedAt: new Date().toISOString() } : {}) } } } });
      });
    }
    return { ok: check.status === 'valid', message: check.detail };
  } catch (error) {
    return { ok: false, message: toActionError(error).error };
  }
}

export async function testFiscalProviderAction(environment: 'homologacao' | 'producao'): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const { fiscalCredentials, testFiscalProvider } = await import('@/lib/fiscal-provider');
    const { prisma } = await import('@/lib/db');
    const target = z.enum(['homologacao', 'producao']).parse(environment);
    const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
    return { ok: true, message: await testFiscalProvider(fiscalCredentials(org?.settings, target)) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : toActionError(error).error };
  }
}

export async function saveFiscalProviderAction(_prev: { ok: boolean; message: string } | null, form: FormData) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const { readFiscalProvider, sealFiscalToken, homologationPassed, fiscalIssuer } = await import('@/lib/fiscal-provider');
    const tokenInput = z.string().trim().max(256).regex(/^[!-~]*$/).refine((value) => !value.includes(':')).parse(form.get('token') ?? '');
    const environment = z.enum(['homologacao', 'producao']).parse(form.get('environment'));
    const enableProduction = environment === 'producao' && form.get('activate') === 'on';
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
      const settings = fiscalSettings(org?.settings);
      const current = readFiscalProvider(settings);
      const credentials = { ...current.credentials };
      if (tokenInput) credentials[environment] = sealFiscalToken(tokenInput);
      if (!credentials[environment]) throw new Error('Informe o token da Focus NFe para este ambiente.');
      if (enableProduction && (process.env.FISCAL_PRODUCTION !== 'true' || !(await homologationPassed(ctx.organizationId, settings, tx)))) {
        throw new Error('Conclua a homologação da loja e aguarde a liberação de produção pelo Del Flash.');
      }
      const active = enableProduction ? 'producao' : environment === 'homologacao' ? 'homologacao' : current.environment;
      const productionIssuer = enableProduction ? fiscalIssuer(readFiscalProfile(settings)) : environment === 'homologacao' ? null : current.productionIssuer ?? null;
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, fiscalProvider: { provider: 'focusnfe', environment: active, credentials, productionIssuer } } } });
    });
    revalidatePath('/app/configuracoes/fiscal');
    revalidatePath('/app/pedidos');
    const message = enableProduction ? 'Emissão em produção ativada para este estabelecimento.' :
      environment === 'homologacao' ? 'Homologação salva. As notas de teste não têm valor fiscal.' :
      'Token de produção salvo.';
    return { ok: true, message };
  } catch (error) {
    return { ok: false, message: error instanceof z.ZodError ? 'Confira o ambiente e o formato do token.' : error instanceof Error ? error.message : toActionError(error).error };
  }
}

export async function runFiscalTestAction(input: { command: 'emit' | 'consult' | 'cancel'; productId?: string; reason?: string }): Promise<InvoiceResult> {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const data = z.object({ command: z.enum(['emit', 'consult', 'cancel']), productId: z.string().max(100).optional(), reason: z.string().max(255).optional() }).parse(input);
    const { runFiscalHomologation } = await import('@/lib/fiscal-provider');
    const doc = await runFiscalHomologation(ctx.organizationId, data);
    revalidatePath('/app/configuracoes/fiscal');
    return { ok: true, doc };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : toActionError(error).error };
  }
}

type InvoiceResult = { ok: true; doc: import('@/lib/fiscal-provider').FiscalDocument | null } | { ok: false; error: string };

export async function getInvoiceAction(input: { orderId: string; environment: 'homologacao' | 'producao' }): Promise<InvoiceResult> {
  try {
    const ctx = await requirePermission('MANAGE_ORDERS');
    const { readFiscalDocument } = await import('@/lib/fiscal-provider');
    const { prisma } = await import('@/lib/db');
    if (!(await prisma.order.count({ where: { id: input.orderId, organizationId: ctx.organizationId } }))) return { ok: false, error: 'Pedido não encontrado.' };
    return { ok: true, doc: await readFiscalDocument(input.orderId, input.environment) };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : toActionError(error).error }; }
}

export async function emitInvoiceAction(input: { orderId: string; cpf?: string; payment?: string }): Promise<InvoiceResult> {
  try {
    const ctx = await requirePermission('MANAGE_ORDERS');
    const data = z.object({ orderId: z.string().min(1).max(100), cpf: z.string().max(14).optional(), payment: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD']).optional() }).parse(input);
    const { emitNfce } = await import('@/lib/fiscal-provider');
    return { ok: true, doc: await emitNfce(ctx.organizationId, data.orderId, data) };
  }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : toActionError(error).error }; }
}

export async function consultInvoiceAction(input: { orderId: string; environment: 'homologacao' | 'producao' }): Promise<InvoiceResult> {
  try { const ctx = await requirePermission('MANAGE_ORDERS'); const { consultNfce } = await import('@/lib/fiscal-provider'); return { ok: true, doc: await consultNfce(ctx.organizationId, String(input.orderId), input.environment) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : toActionError(error).error }; }
}

export async function cancelInvoiceAction(input: { orderId: string; reason: string; environment: 'homologacao' | 'producao' }): Promise<InvoiceResult> {
  try { const ctx = await requirePermission('MANAGE_SETTINGS'); const { cancelNfce } = await import('@/lib/fiscal-provider'); return { ok: true, doc: await cancelNfce(ctx.organizationId, String(input.orderId), String(input.reason ?? ''), input.environment) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : toActionError(error).error }; }
}
