import 'server-only';
import { prisma } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { AsaasError, authenticateAsaasWebhook } from '@/lib/platform/asaas-client';
import { createCardPreference, createPixPayment, fetchPayment, mapStatus, verifySignature, type MpSecrets } from '@/lib/payments/mercadopago';
import { checkInfinitePayPayment, createInfinitePayLink, infinitePayRef, validInfiniteTag } from '@/lib/payments/infinitepay';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PAGAMENTO ONLINE DO PEDIDO (Pix e cartão) — conta Asaas da própria loja
 * -----------------------------------------------------------------------
 * • A loja cadastra a chave da SUA conta Asaas (sandbox). Produção fica
 *   bloqueada para escrita até homologação explícita (ORDER_PAYMENTS_PRODUCTION).
 * • A cobrança é criada depois que o pedido existe; o cliente paga no Pix
 *   (QR/copia e cola) ou na página segura do Asaas (cartão). Nenhum dado
 *   de cartão passa pelo Del Flash.
 * • Só o webhook autenticado confirma: o evento é um sinal, o pagamento é
 *   relido na API e conferido (referência, loja e valor). A confirmação é
 *   idempotente: PENDING → PAID uma única vez.
 * ═══════════════════════════════════════════════════════════════════════
 */
export type PaymentProvider = 'asaas' | 'mercadopago' | 'infinitepay';
/** `handle`: InfiniteTag da loja (InfinitePay). Não é segredo, por isso não vai cifrado. */
export type OnlinePaymentConfig = { enabled: boolean; environment: 'sandbox' | 'production'; provider: PaymentProvider; encrypted?: string; verifiedAt?: string; handle?: string };
type Secrets = { apiKey: string; webhookToken: string };
export type OrderCharge = { provider?: PaymentProvider; preferenceId?: string; captureMethod?: string | null; receiptUrl?: string | null; environment: 'sandbox' | 'production'; paymentId: string; billingType: 'PIX' | 'CREDIT_CARD'; invoiceUrl: string | null; pixPayload: string | null; pixImage: string | null; value: number; createdAt: string };

const bases = { sandbox: 'https://api-sandbox.asaas.com/v3', production: 'https://api.asaas.com/v3' } as const;
const chargeKey = (orderId: string) => `order-payment:${orderId}`;

export function readOnlinePayment(settings: unknown): OnlinePaymentConfig {
  const root = settings && typeof settings === 'object' ? (settings as Record<string, any>) : {};
  const raw = root.onlinePayment ?? {};
  if (raw.provider === 'infinitepay') {
    const handle = validInfiniteTag(raw.handle) ? raw.handle : undefined;
    // Sem sandbox na InfinitePay: o ambiente é sempre o real.
    return { enabled: raw.enabled === true && Boolean(handle), environment: 'production', provider: 'infinitepay', handle, verifiedAt: typeof raw.verifiedAt === 'string' ? raw.verifiedAt : undefined };
  }
  return { enabled: raw.enabled === true && typeof raw.encrypted === 'string', environment: raw.environment === 'production' ? 'production' : 'sandbox', provider: raw.provider === 'mercadopago' ? 'mercadopago' : 'asaas', encrypted: typeof raw.encrypted === 'string' ? raw.encrypted : undefined, verifiedAt: typeof raw.verifiedAt === 'string' ? raw.verifiedAt : undefined };
}

export type CredentialCheck = { status: 'valid'; detail: string } | { status: 'rejected' | 'unavailable'; detail: string };

/** Pergunta ao próprio provedor se a credencial vale. É o único caminho para "verificada". */
export async function checkPaymentCredential(provider: PaymentProvider, environment: 'sandbox' | 'production', secret: string, run: typeof fetch = fetch): Promise<CredentialCheck> {
  const name = provider === 'mercadopago' ? 'Mercado Pago' : 'Asaas';
  const url = provider === 'mercadopago' ? 'https://api.mercadopago.com/users/me' : `${bases[environment]}/finance/balance`;
  const headers: Record<string, string> = provider === 'mercadopago' ? { Authorization: `Bearer ${secret}` } : { access_token: secret, 'User-Agent': 'DelFlash/1.0' };
  let response: Response;
  try { response = await run(url, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { return { status: 'unavailable', detail: `${name} não respondeu.` }; }
  if (response.ok) return { status: 'valid', detail: `Credencial aceita pelo ${name}.` };
  if (response.status === 400 || response.status === 401 || response.status === 403) return { status: 'rejected', detail: `${name} recusou a credencial (HTTP ${response.status}).` };
  return { status: 'unavailable', detail: `${name} respondeu HTTP ${response.status}.` };
}

/**
 * Confere a InfiniteTag criando um link de R$ 1,00 na conta da loja. A
 * InfinitePay não tem sandbox nem consulta de conta: criar o link é a única
 * prova de que a tag existe. Ninguém é cobrado; o link só fica parado lá.
 */
export async function checkInfiniteTag(handle: string, run: typeof fetch = fetch): Promise<CredentialCheck> {
  try {
    await createInfinitePayLink({ handle, orderNsu: `teste-${Date.now()}`, amountCents: 100, description: 'Teste de conexão Del Flash (não pague)', redirectUrl: `${publicApp()}/`, webhookUrl: `${publicApp()}/api/webhooks/pedidos/infinitepay/teste` }, run);
    return { status: 'valid', detail: 'InfiniteTag aceita pela InfinitePay.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return /recusou|inválida/.test(message) ? { status: 'rejected', detail: 'A InfinitePay recusou esta InfiniteTag. Confira no app (Perfil › InfiniteTag), sem o $.' } : { status: 'unavailable', detail: 'A InfinitePay não respondeu.' };
  }
}

/** Pronto para cobrar? Produção exige liberação explícita do servidor. */
export function onlinePaymentUsable(config: OnlinePaymentConfig) {
  // InfinitePay: só a InfiniteTag, sem credencial e sem sandbox. O dinheiro
  // vai direto para a conta da loja e nada é cobrado sem o cliente pagar,
  // então não depende da liberação de produção dos outros provedores.
  if (config.provider === 'infinitepay') return config.enabled && validInfiniteTag(config.handle);
  // Asaas não é mais oferecido: uma configuração antiga não cobra novos pedidos.
  if (config.provider === 'asaas') return false;
  if (!config.enabled || !config.encrypted) return false;
  return config.environment === 'sandbox' || process.env.ORDER_PAYMENTS_PRODUCTION === 'true';
}

export function sealSecrets(secrets: Secrets | MpSecrets) { return encryptJson(secrets); }
function secretsOf(config: OnlinePaymentConfig): Secrets { return decryptJson<Secrets>(config.encrypted!); }

function client(config: OnlinePaymentConfig) {
  const { apiKey } = secretsOf(config);
  const base = bases[config.environment];
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (config.environment === 'production' && method !== 'GET' && process.env.ORDER_PAYMENTS_PRODUCTION !== 'true') throw new Error('Cobranças de produção não autorizadas.');
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, { method, headers: { access_token: apiKey, 'Content-Type': 'application/json', 'User-Agent': 'DelFlash/1.0' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new AsaasError(method !== 'GET'); }
    if (!response.ok) throw new AsaasError(method !== 'GET' && response.status >= 500);
    return (await response.json()) as T;
  }
  const id = (value: string) => { if (!/^[A-Za-z0-9_]+$/.test(value)) throw new AsaasError(); return value; };
  return {
    findCustomer: (reference: string) => request<{ data: Array<{ id: string }> }>(`/customers?externalReference=${encodeURIComponent(reference)}&limit=1`),
    createCustomer: (input: { name: string; cpfCnpj: string; mobilePhone?: string; externalReference: string }) => request<{ id: string }>('/customers', 'POST', { ...input, notificationDisabled: true }),
    createPayment: (input: { customer: string; billingType: 'PIX' | 'CREDIT_CARD'; value: number; dueDate: string; externalReference: string; description: string }) => request<{ id: string; invoiceUrl?: string; status: string }>('/payments', 'POST', { ...input, customer: id(input.customer) }),
    payment: (value: string) => request<{ id: string; status: string; value: number; externalReference?: string; billingType: string }>(`/payments/${id(value)}`),
    pix: (value: string) => request<{ encodedImage: string; payload: string }>(`/payments/${id(value)}/pixQrCode`),
  };
}

export async function readOrderCharge(orderId: string): Promise<OrderCharge | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key: chargeKey(orderId) } });
  return (row?.value as OrderCharge | undefined) ?? null;
}

/**
 * Cria a cobrança de um pedido já gravado. Uma cobrança por pedido: a chave
 * é reservada antes da chamada externa, então repetir não duplica.
 */
export async function createOrderCharge(input: { organizationId: string; orderId: string; displayId: number; total: number; customerName: string; customerPhone: string; document: string; email?: string; method: 'PIX' | 'CREDIT_CARD'; storeName: string }): Promise<OrderCharge> {
  const org = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { settings: true, slug: true } });
  const config = readOnlinePayment(org?.settings);
  if (!onlinePaymentUsable(config)) throw new Error('Pagamento online indisponível nesta loja.');
  const existing = await readOrderCharge(input.orderId);
  if (existing) return existing;
  await prisma.platformSetting.create({ data: { key: `${chargeKey(input.orderId)}:lock`, value: { at: new Date().toISOString() } } }).catch(() => { throw new Error('Cobrança deste pedido já está sendo criada.'); });
  try { return config.provider === 'infinitepay' ? await issueInfinitePay(config, input, org!.slug) : config.provider === 'mercadopago' ? await issueMercadoPago(config, input, org!.slug) : await issueCharge(config, input); }
  catch (error) {
    // Falhou antes de gravar: libera a reserva para uma nova tentativa.
    await prisma.platformSetting.delete({ where: { key: `${chargeKey(input.orderId)}:lock` } }).catch(() => undefined);
    throw error;
  }
}

async function issueCharge(config: OnlinePaymentConfig, input: Parameters<typeof createOrderCharge>[0]): Promise<OrderCharge> {
  const api = client(config);
  const reference = `delflash:${input.organizationId}:${input.document}`;
  const found = await api.findCustomer(reference);
  const customer = found.data[0]?.id ?? (await api.createCustomer({ name: input.customerName, cpfCnpj: input.document, mobilePhone: input.customerPhone.replace(/\D/g, '').slice(-11) || undefined, externalReference: reference })).id;
  const dueDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const payment = await api.createPayment({ customer, billingType: input.method, value: input.total, dueDate, externalReference: input.orderId, description: `Pedido #${input.displayId} · ${input.storeName}`.slice(0, 500) });
  let pixPayload: string | null = null, pixImage: string | null = null;
  if (input.method === 'PIX') {
    const pix = await api.pix(payment.id).catch(() => null);
    pixPayload = pix?.payload ?? null;
    pixImage = pix?.encodedImage ?? null;
  }
  const charge: OrderCharge = { environment: config.environment, paymentId: payment.id, billingType: input.method, invoiceUrl: payment.invoiceUrl ?? null, pixPayload, pixImage, value: input.total, createdAt: new Date().toISOString() };
  await prisma.platformSetting.upsert({ where: { key: chargeKey(input.orderId) }, create: { key: chargeKey(input.orderId), value: charge }, update: { value: charge } });
  return charge;
}

/** Endereço público usado nos links de volta e nos webhooks dos provedores. */
function publicApp() { return (process.env.APP_PUBLIC_URL ?? 'https://adega-nine.vercel.app').replace(/\/+$/, ''); }

async function issueInfinitePay(config: OnlinePaymentConfig, input: Parameters<typeof createOrderCharge>[0], slug: string): Promise<OrderCharge> {
  const app = publicApp();
  const phone = input.customerPhone.replace(/\D/g, '');
  const url = await createInfinitePayLink({
    handle: config.handle!,
    orderNsu: input.orderId,
    amountCents: Math.round(input.total * 100),
    description: `Pedido #${input.displayId} · ${input.storeName}`,
    // A InfinitePay acrescenta order_nsu, transaction_nsu, slug, receipt_url e capture_method.
    redirectUrl: `${app}/loja/${slug}/pedido/${input.orderId}`,
    webhookUrl: `${app}/api/webhooks/pedidos/infinitepay/${slug}`,
    customer: { name: input.customerName, phone_number: phone.length >= 10 ? `+55${phone.slice(-11)}` : undefined, email: input.email },
  });
  const charge: OrderCharge = { provider: 'infinitepay', environment: 'production', paymentId: '', billingType: input.method, invoiceUrl: url, pixPayload: null, pixImage: null, value: input.total, createdAt: new Date().toISOString() };
  await prisma.platformSetting.upsert({ where: { key: chargeKey(input.orderId) }, create: { key: chargeKey(input.orderId), value: charge }, update: { value: charge } });
  return charge;
}

/**
 * Confirma um pagamento da InfinitePay — no webhook e na volta do checkout.
 * O aviso não é assinado, então ele só serve de gatilho: quem decide é o
 * /payment_check, conferido contra pedido, loja e valor. Idempotente.
 */
export async function confirmInfinitePayPayment(slug: string, refs: { orderNsu: unknown; transactionNsu: unknown; invoiceSlug: unknown; receiptUrl?: unknown }, run: typeof fetch = fetch): Promise<{ status: number; result: string }> {
  const orderNsu = infinitePayRef(refs.orderNsu), transactionNsu = infinitePayRef(refs.transactionNsu), invoiceSlug = infinitePayRef(refs.invoiceSlug);
  if (!orderNsu || !transactionNsu || !invoiceSlug) return { status: 200, result: 'ignorado' };
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!org) return { status: 404, result: 'loja' };
  const config = readOnlinePayment(org.settings);
  if (config.provider !== 'infinitepay' || !config.handle) return { status: 200, result: 'sem configuração' };
  const order = await prisma.order.findFirst({ where: { id: orderNsu, organizationId: org.id }, select: { id: true, total: true, paymentStatus: true, displayId: true } });
  const charge = order ? await readOrderCharge(order.id) : null;
  if (!order || !charge || charge.provider !== 'infinitepay') return { status: 200, result: 'sem pedido' };
  if (order.paymentStatus === 'PAID') return { status: 200, result: 'já pago' };
  const check = await checkInfinitePayPayment({ handle: config.handle, orderNsu, transactionNsu, slug: invoiceSlug }, run);
  if (!check.success || !check.paid) return { status: 200, result: 'pendente' };
  if (check.amount < Math.round(Number(order.total) * 100)) return { status: 200, result: 'valor divergente' };
  const changed = await prisma.order.updateMany({ where: { id: order.id, organizationId: org.id, paymentStatus: { in: ['PENDING', 'FAILED'] } }, data: { paymentStatus: 'PAID' } });
  const receiptUrl = typeof refs.receiptUrl === 'string' && /^https:\/\/[\w.-]*infinitepay\.io\//.test(refs.receiptUrl) ? refs.receiptUrl : charge.receiptUrl ?? null;
  await prisma.platformSetting.update({ where: { key: chargeKey(order.id) }, data: { value: { ...charge, paymentId: transactionNsu, captureMethod: check.captureMethod, receiptUrl } } }).catch(() => undefined);
  if (changed.count) await prisma.notification.create({ data: { organizationId: org.id, type: 'SYSTEM', title: 'Pagamento online confirmado', message: `Pedido #${order.displayId} pago pela InfinitePay (${check.captureMethod === 'pix' ? 'Pix' : check.captureMethod ?? 'online'}). Já pode ser liberado para entrega.`, href: `/app/pedidos?pedido=${order.id}` } }).catch(() => undefined);
  return { status: 200, result: changed.count ? 'pago' : 'já pago' };
}

async function issueMercadoPago(config: OnlinePaymentConfig, input: Parameters<typeof createOrderCharge>[0], slug: string): Promise<OrderCharge> {
  const secrets = decryptJson<MpSecrets>(config.encrypted!);
  const app = process.env.APP_PUBLIC_URL ?? 'https://adega-nine.vercel.app';
  const notificationUrl = `${app}/api/webhooks/pedidos/mercadopago/${slug}`;
  if (!input.email) throw new Error('E-mail de quem paga é obrigatório para o Mercado Pago.');
  const base = { provider: 'mercadopago' as const, environment: config.environment, billingType: input.method, value: input.total, createdAt: new Date().toISOString() };
  let charge: OrderCharge;
  if (input.method === 'PIX') {
    const pix = await createPixPayment(secrets, { orderId: input.orderId, amount: input.total, description: `Pedido #${input.displayId} · ${input.storeName}`, notificationUrl, email: input.email, firstName: input.customerName.split(' ')[0] || input.customerName, document: input.document });
    charge = { ...base, paymentId: pix.paymentId, invoiceUrl: pix.invoiceUrl, pixPayload: pix.pixPayload, pixImage: pix.pixImage };
  } else {
    const pref = await createCardPreference(secrets, { orderId: input.orderId, amount: input.total, title: `Pedido #${input.displayId} · ${input.storeName}`, notificationUrl, backUrl: `${app}/loja/${slug}/pedido/${input.orderId}`, email: input.email, sandbox: config.environment === 'sandbox' });
    charge = { ...base, paymentId: '', preferenceId: pref.preferenceId, invoiceUrl: pref.invoiceUrl, pixPayload: null, pixImage: null };
  }
  await prisma.platformSetting.upsert({ where: { key: chargeKey(input.orderId) }, create: { key: chargeKey(input.orderId), value: charge }, update: { value: charge } });
  return charge;
}

/**
 * Webhook do Mercado Pago da loja: assinatura x-signature, releitura do
 * pagamento na API e conferência de pedido, loja, provedor e valor. Cada
 * transição acontece uma única vez (updateMany com o status de origem).
 */
export async function handleMercadoPagoWebhook(slug: string, headers: { signature: string | null; requestId: string | null }, dataId: string | null, payload: unknown): Promise<{ status: number; result: string }> {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!org) return { status: 404, result: 'loja' };
  const config = readOnlinePayment(org.settings);
  if (config.provider !== 'mercadopago' || !config.encrypted) return { status: 401, result: 'sem configuração' };
  const secrets = decryptJson<MpSecrets>(config.encrypted);
  const event = payload as { type?: string; topic?: string; action?: string; data?: { id?: string | number } };
  const id = String(dataId ?? event?.data?.id ?? '');
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return { status: 200, result: 'ignorado' };
  if (!verifySignature(secrets.webhookSecret, headers.signature, headers.requestId, id)) return { status: 401, result: 'assinatura' };
  if ((event?.type ?? event?.topic) && (event.type ?? event.topic) !== 'payment') return { status: 200, result: 'ignorado' };
  const payment = await fetchPayment(secrets, id);
  const orderId = payment.external_reference ?? '';
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId: org.id }, select: { id: true, total: true, paymentStatus: true } });
  const charge = order ? await readOrderCharge(order.id) : null;
  if (!order || !charge || charge.provider !== 'mercadopago') return { status: 200, result: 'sem pedido' };
  // Pix: um pagamento por cobrança, o id precisa bater. Checkout Pro (cartão):
  // a mesma preferência aceita novas tentativas, cada uma com um id novo —
  // a primeira recusada não pode descartar a segunda aprovada. O vínculo
  // com o pedido já foi conferido acima (external_reference, loja, API).
  const paymentId = String(payment.id);
  const isPreference = Boolean(charge.preferenceId);
  if (!isPreference && charge.paymentId && charge.paymentId !== paymentId) return { status: 200, result: 'pagamento de outra cobrança' };
  if (Math.abs(Number(payment.transaction_amount) - Number(order.total)) > 0.009) return { status: 200, result: 'valor divergente' };
  const effect = mapStatus(payment.status);
  if (!charge.paymentId || (isPreference && effect === 'PAID' && charge.paymentId !== paymentId)) await prisma.platformSetting.update({ where: { key: chargeKey(order.id) }, data: { value: { ...charge, paymentId } } });
  // Estorno só vale para o pagamento que quitou o pedido.
  if (effect === 'REFUNDED' && isPreference && charge.paymentId && charge.paymentId !== paymentId) return { status: 200, result: 'estorno de outra tentativa' };
  if (effect === 'PAID') {
    const changed = await prisma.order.updateMany({ where: { id: order.id, organizationId: org.id, paymentStatus: { in: ['PENDING', 'FAILED'] } }, data: { paymentStatus: 'PAID' } });
    if (changed.count) await prisma.notification.create({ data: { organizationId: org.id, type: 'SYSTEM', title: 'Pagamento online confirmado', message: 'O pagamento do pedido foi confirmado pelo Mercado Pago.', href: `/app/pedidos?pedido=${order.id}` } }).catch(() => undefined);
    return { status: 200, result: changed.count ? 'pago' : 'já pago' };
  }
  if (effect === 'REFUNDED') { await prisma.order.updateMany({ where: { id: order.id, organizationId: org.id, paymentStatus: 'PAID' }, data: { paymentStatus: 'REFUNDED' } }); return { status: 200, result: 'estornado' }; }
  if (effect === 'FAILED') { await prisma.order.updateMany({ where: { id: order.id, organizationId: org.id, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } }); return { status: 200, result: 'recusado' }; }
  return { status: 200, result: 'pendente' };
}

const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
const REFUNDED = new Set(['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED']);

/** Webhook da loja: autentica o token, relê o pagamento e atualiza o pedido uma vez. */
export async function handleOrderPaymentWebhook(slug: string, token: string | null, payload: unknown): Promise<{ status: number; result: string }> {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!org) return { status: 404, result: 'loja' };
  const config = readOnlinePayment(org.settings);
  if (!config.encrypted || config.provider !== 'asaas') return { status: 401, result: 'sem configuração' };
  if (!authenticateAsaasWebhook(secretsOf(config).webhookToken, token)) return { status: 401, result: 'token' };
  const event = payload as { id?: string; event?: string; payment?: { id?: string } };
  const paymentId = event?.payment?.id;
  if (typeof paymentId !== 'string' || !/^[A-Za-z0-9_]+$/.test(paymentId)) return { status: 200, result: 'ignorado' };
  const payment = await client(config).payment(paymentId);
  const orderId = payment.externalReference ?? '';
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId: org.id }, select: { id: true, total: true, paymentStatus: true } });
  const charge = order ? await readOrderCharge(order.id) : null;
  if (!order || !charge || charge.paymentId !== payment.id) return { status: 200, result: 'sem pedido' };
  if (PAID.has(payment.status)) {
    if (Math.abs(Number(payment.value) - Number(order.total)) > 0.009) return { status: 200, result: 'valor divergente' };
    // Cobrança vencida (FAILED) paga depois também quita, como no Mercado Pago.
    const changed = await prisma.order.updateMany({ where: { id: order.id, organizationId: org.id, paymentStatus: { in: ['PENDING', 'FAILED'] } }, data: { paymentStatus: 'PAID' } });
    if (changed.count) await prisma.notification.create({ data: { organizationId: org.id, type: 'SYSTEM', title: 'Pagamento online confirmado', message: `O pagamento do pedido foi confirmado pelo Asaas.`, href: `/app/pedidos?pedido=${order.id}` } }).catch(() => undefined);
    return { status: 200, result: changed.count ? 'pago' : 'já pago' };
  }
  if (REFUNDED.has(payment.status)) {
    await prisma.order.updateMany({ where: { id: order.id, organizationId: org.id, paymentStatus: 'PAID' }, data: { paymentStatus: 'REFUNDED' } });
    return { status: 200, result: 'estornado' };
  }
  if (payment.status === 'OVERDUE' || /DELETED|REPROVED/.test(event.event ?? '')) {
    await prisma.order.updateMany({ where: { id: order.id, organizationId: org.id, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } });
    return { status: 200, result: 'falhou' };
  }
  return { status: 200, result: 'sem mudança' };
}

export function newWebhookToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
}
