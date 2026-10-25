import 'server-only';
import { prisma } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { AsaasError, authenticateAsaasWebhook } from '@/lib/platform/asaas-client';

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
export type OnlinePaymentConfig = { enabled: boolean; environment: 'sandbox' | 'production'; encrypted?: string };
type Secrets = { apiKey: string; webhookToken: string };
export type OrderCharge = { environment: 'sandbox' | 'production'; paymentId: string; billingType: 'PIX' | 'CREDIT_CARD'; invoiceUrl: string | null; pixPayload: string | null; pixImage: string | null; value: number; createdAt: string };

const bases = { sandbox: 'https://api-sandbox.asaas.com/v3', production: 'https://api.asaas.com/v3' } as const;
const chargeKey = (orderId: string) => `order-payment:${orderId}`;

export function readOnlinePayment(settings: unknown): OnlinePaymentConfig {
  const root = settings && typeof settings === 'object' ? (settings as Record<string, any>) : {};
  const raw = root.onlinePayment ?? {};
  return { enabled: raw.enabled === true && typeof raw.encrypted === 'string', environment: raw.environment === 'production' ? 'production' : 'sandbox', encrypted: typeof raw.encrypted === 'string' ? raw.encrypted : undefined };
}

/** Pronto para cobrar? Produção exige liberação explícita do servidor. */
export function onlinePaymentUsable(config: OnlinePaymentConfig) {
  if (!config.enabled || !config.encrypted) return false;
  return config.environment === 'sandbox' || process.env.ORDER_PAYMENTS_PRODUCTION === 'true';
}

export function sealSecrets(secrets: Secrets) { return encryptJson(secrets); }
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
export async function createOrderCharge(input: { organizationId: string; orderId: string; displayId: number; total: number; customerName: string; customerPhone: string; document: string; method: 'PIX' | 'CREDIT_CARD'; storeName: string }): Promise<OrderCharge> {
  const org = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { settings: true } });
  const config = readOnlinePayment(org?.settings);
  if (!onlinePaymentUsable(config)) throw new Error('Pagamento online indisponível nesta loja.');
  const existing = await readOrderCharge(input.orderId);
  if (existing) return existing;
  await prisma.platformSetting.create({ data: { key: `${chargeKey(input.orderId)}:lock`, value: { at: new Date().toISOString() } } }).catch(() => { throw new Error('Cobrança deste pedido já está sendo criada.'); });
  try { return await issueCharge(config, input); }
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

const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
const REFUNDED = new Set(['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED']);

/** Webhook da loja: autentica o token, relê o pagamento e atualiza o pedido uma vez. */
export async function handleOrderPaymentWebhook(slug: string, token: string | null, payload: unknown): Promise<{ status: number; result: string }> {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!org) return { status: 404, result: 'loja' };
  const config = readOnlinePayment(org.settings);
  if (!config.encrypted) return { status: 401, result: 'sem configuração' };
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
    const changed = await prisma.order.updateMany({ where: { id: order.id, organizationId: org.id, paymentStatus: 'PENDING' }, data: { paymentStatus: 'PAID' } });
    if (changed.count) await prisma.notification.create({ data: { organizationId: org.id, type: 'SYSTEM', title: 'Pagamento online confirmado', message: `O pagamento do pedido foi confirmado pelo Asaas.`, href: '/app/pedidos' } }).catch(() => undefined);
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
