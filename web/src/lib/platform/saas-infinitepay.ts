import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { OperationError } from '@/lib/operation-error';
import { ADEGA_COMMERCIAL_PLAN } from '@/lib/commercial-plan';
import { checkInfinitePayPayment, createInfinitePayLink, infinitePayRef, normalizeInfiniteTag, validInfiniteTag } from '@/lib/payments/infinitepay';

const SETTINGS_KEY = 'del-flash:infinitepay';
const attemptKey = (id: string) => `saas-infinitepay:${id}`;
const CENTS = ADEGA_COMMERCIAL_PLAN.monthlyPrice * 100;
const attemptSchema = z.object({
  handle: z.string(), key: z.string(), nonce: z.string(), expiresAt: z.string(), reservedAt: z.number(), url: z.string().optional(),
});
const configSchema = z.object({ handle: z.string(), key: z.string() });
const appUrl = () => (process.env.APP_PUBLIC_URL ?? 'https://adega-nine.vercel.app').replace(/\/+$/, '');
export const SAAS_WEBHOOK_PATH = '/api/webhooks/assinaturas/infinitepay';
export const SAAS_BILLING_PATH = '/app/assinatura';

export async function readSaasReceiver() {
  const handle = normalizeInfiniteTag(process.env.DELFLASH_INFINITEPAY_TAG ?? '');
  const saved = configSchema.safeParse((await prisma.platformSetting.findUnique({ where: { key: SETTINGS_KEY } }))?.value);
  return {
    handle: validInfiniteTag(handle) ? handle : '',
    encryptedKey: saved.success && saved.data.handle === handle ? saved.data.key : undefined,
  };
}

export async function saveSaasReceiver(apiKey: string, operatorId: string) {
  if (!/^inchk_[A-Za-z0-9_-]{8,248}$/.test(apiKey)) throw new OperationError('Informe a API Key do Checkout Integrado, começando por inchk_.');
  const { handle } = await readSaasReceiver();
  if (!handle) throw new OperationError('A InfiniteTag da plataforma precisa estar configurada.');
  const key = encryptJson({ apiKey });
  await createInfinitePayLink({
    handle, apiKey, orderNsu: `df-conexao-${randomUUID()}`, amountCents: 100,
    description: 'Validação privada da conexão Del Flash',
    redirectUrl: `${appUrl()}${SAAS_BILLING_PATH}`, webhookUrl: `${appUrl()}${SAAS_WEBHOOK_PATH}`,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  const value = { handle, key };
  await prisma.$transaction([
    prisma.platformSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value }, update: { value } }),
    prisma.platformAudit.create({ data: { operatorId, action: 'SAAS_INFINITEPAY_CONFIGURED', resourceType: 'PlatformSetting', resourceId: SETTINGS_KEY, reason: 'Credencial do Checkout Integrado validada para a InfiniteTag da plataforma.' } }),
  ]);
}

/** Um mês de calendário preservando o fim do mês. */
export function nextSubscriptionDue(now: Date) {
  const date = new Date(now);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

const monthlyCompetence = (now: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(now);
const sameAmount = (value: unknown) => Math.round(Number(value) * 100) === CENTS;
const validLink = (url: string | undefined) => Boolean(url?.startsWith('https://checkout.infinitepay.io/'));

export async function openSaasCheckout(organizationId: string, planId: string) {
  const { handle, encryptedKey } = await readSaasReceiver();
  if (!handle || !encryptedKey) throw new OperationError('O checkout do Del Flash está aguardando a validação da conta InfinitePay.');
  const now = new Date();
  const reserved = await withOrganizationTransaction(organizationId, async (tx) => {
    const [org, plan, current] = await Promise.all([
      tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, isDemo: true, status: true } }),
      tx.plan.findFirst({ where: { id: planId, active: true, slug: ADEGA_COMMERCIAL_PLAN.slug, price: ADEGA_COMMERCIAL_PLAN.monthlyPrice } }),
      tx.platformContract.findUnique({ where: { organizationId } }),
    ]);
    if (!plan || org.isDemo || ['SUSPENDED', 'CANCELLED'].includes(org.status)) throw new OperationError('Plano indisponível para este estabelecimento.');
    if (current && (current.period !== 'MONTHLY' || current.planId !== planId || !sameAmount(current.amount) || ['CANCELLED', 'SUSPENDED'].includes(current.status))) {
      throw new OperationError('O contrato atual precisa ser revisado pela administração.');
    }
    if (current?.status === 'ACTIVE' && current.dueAt > now) throw new OperationError('O plano está ativo até o vencimento indicado no painel.');
    const contract = current ?? await tx.platformContract.create({ data: { organizationId, planId, period: 'MONTHLY', status: 'PENDING', amount: plan.price, startedAt: now, dueAt: now } });
    const pending = await tx.saaSCharge.findMany({ where: { contractId: contract.id, status: 'PENDING' }, orderBy: { dueAt: 'asc' }, take: 2 });
    if (pending.length > 1) throw new OperationError('Há várias cobranças em aberto. Peça a revisão no Admin Central.');
    const competence = monthlyCompetence(now);
    const existing = pending[0] ?? await tx.saaSCharge.findUnique({ where: { contractId_competence: { contractId: contract.id, competence } } });
    if (existing && (existing.status !== 'PENDING' || !sameAmount(existing.amount))) throw new OperationError('Já existe uma cobrança diferente nesta competência.');
    const charge = existing ?? await tx.saaSCharge.create({ data: { contractId: contract.id, organizationId, competence, amount: plan.price, dueAt: now } });
    const settingKey = attemptKey(charge.id);
    const old = attemptSchema.safeParse((await tx.platformSetting.findUnique({ where: { key: settingKey } }))?.value);
    if (old.success && Date.parse(old.data.expiresAt) > now.getTime()) {
      if (validLink(old.data.url)) return { url: old.data.url!, chargeId: charge.id, value: null };
      if (now.getTime() - old.data.reservedAt < 30_000) throw new OperationError('O checkout está sendo preparado. Aguarde alguns instantes.');
    }
    const retry = old.success && Date.parse(old.data.expiresAt) > now.getTime() ? old.data : null;
    const value = {
      handle: retry?.handle ?? handle, key: retry?.key ?? encryptedKey, nonce: randomUUID(),
      expiresAt: retry?.expiresAt ?? new Date(now.getTime() + 30 * 60_000).toISOString(), reservedAt: now.getTime(),
    };
    await tx.platformSetting.upsert({ where: { key: settingKey }, create: { key: settingKey, value }, update: { value } });
    return { url: null, chargeId: charge.id, value };
  });
  if (reserved.url) return reserved.url;
  const value = reserved.value!;
  const { apiKey } = decryptJson<{ apiKey: string }>(value.key);
  const url = await createInfinitePayLink({
    handle: value.handle, apiKey, orderNsu: reserved.chargeId, amountCents: CENTS,
    description: `${ADEGA_COMMERCIAL_PLAN.name} · mensalidade`,
    redirectUrl: `${appUrl()}${SAAS_BILLING_PATH}`, webhookUrl: `${appUrl()}${SAAS_WEBHOOK_PATH}`,
    expiresAt: value.expiresAt,
  });
  await withOrganizationTransaction(organizationId, async (tx) => {
    const key = attemptKey(reserved.chargeId);
    const current = attemptSchema.safeParse((await tx.platformSetting.findUnique({ where: { key } }))?.value);
    if (!current.success || current.data.nonce !== value.nonce) throw new OperationError('O checkout mudou. Abra a cobrança novamente pelo painel.');
    await tx.platformSetting.update({ where: { key }, data: { value: { ...value, url } } });
  });
  return url;
}

export async function reconcileSaasCheckout(refs: { orderNsu: unknown; transactionNsu: unknown; slug: unknown }, organizationId?: string) {
  const orderNsu = infinitePayRef(refs.orderNsu);
  const transactionNsu = infinitePayRef(refs.transactionNsu);
  const slug = infinitePayRef(refs.slug);
  if (!orderNsu || !transactionNsu || !slug) return false;
  const charge = await prisma.saaSCharge.findFirst({ where: { id: orderNsu, organizationId }, select: { id: true, organizationId: true, status: true, amount: true, contractId: true } });
  if (!charge || !sameAmount(charge.amount)) return false;
  if (charge.status === 'PAID') return true;
  const record = attemptSchema.safeParse((await prisma.platformSetting.findUnique({ where: { key: attemptKey(charge.id) } }))?.value);
  if (!record.success) return false;
  const { apiKey } = decryptJson<{ apiKey: string }>(record.data.key);
  const payment = await checkInfinitePayPayment({ handle: record.data.handle, apiKey, orderNsu, transactionNsu, slug });
  if (!payment.success || !payment.paid || payment.amount !== CENTS || payment.paidAmount < CENTS || !['pix', 'credit_card'].includes(payment.captureMethod ?? '')) return false;
  return withOrganizationTransaction(charge.organizationId, async (tx) => {
    const current = await tx.saaSCharge.findUniqueOrThrow({ where: { id: charge.id }, include: { contract: { include: { plan: { select: { slug: true } } } } } });
    if (current.status === 'PAID') return true;
    if (!sameAmount(current.amount)) return false;
    const now = new Date();
    const changed = await tx.saaSCharge.updateMany({ where: { id: charge.id, status: current.status, amount: current.amount }, data: {
      status: 'PAID', paidAt: now, paymentMethod: payment.captureMethod === 'pix' ? 'PIX' : 'CREDIT_CARD',
      reference: `InfinitePay: ${transactionNsu}`,
    } });
    if (!changed.count) return false;
    if (current.status === 'PENDING' && current.contract.period === 'MONTHLY' && current.contract.plan.slug === ADEGA_COMMERCIAL_PLAN.slug && sameAmount(current.contract.amount) && !['SUSPENDED', 'CANCELLED'].includes(current.contract.status)) {
      await tx.platformContract.update({ where: { id: charge.contractId }, data: {
        status: 'ACTIVE', dueAt: nextSubscriptionDue(current.contract.dueAt > now ? current.contract.dueAt : now),
      } });
    }
    return true;
  });
}
