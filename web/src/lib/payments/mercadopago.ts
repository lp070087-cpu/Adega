import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Mercado Pago — credenciais da PRÓPRIA loja (Access Token + assinatura secreta
 * do webhook, geradas no painel do Mercado Pago). Pix por /v1/payments e cartão
 * pelo Checkout Pro (o cliente digita o cartão só na página do Mercado Pago).
 * O webhook é só um sinal: o pagamento é relido na API antes de mudar o pedido.
 */
const BASE = 'https://api.mercadopago.com';
export type MpSecrets = { accessToken: string; webhookSecret: string };
export type MpPayment = { id: number | string; status: string; status_detail?: string; transaction_amount: number; external_reference?: string | null; payment_method_id?: string; point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } } };

export class MercadoPagoError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); }
}

async function request<T>(secrets: MpSecrets, path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${secrets.accessToken}`, 'Content-Type': 'application/json', ...(init.idempotencyKey ? { 'X-Idempotency-Key': init.idempotencyKey } : {}) },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch { throw new MercadoPagoError('Mercado Pago não respondeu.', true); }
  if (response.status === 401 || response.status === 403) throw new MercadoPagoError('Credenciais do Mercado Pago recusadas. Confira o Access Token.');
  if (!response.ok) throw new MercadoPagoError('O Mercado Pago recusou a cobrança.', response.status >= 500);
  return (await response.json()) as T;
}

export async function createPixPayment(secrets: MpSecrets, input: { orderId: string; amount: number; description: string; notificationUrl: string; email: string; firstName: string; document: string }) {
  const payment = await request<MpPayment>(secrets, '/v1/payments', {
    method: 'POST', idempotencyKey: `delflash-${input.orderId}-pix`,
    body: {
      transaction_amount: Math.round(input.amount * 100) / 100,
      description: input.description.slice(0, 250), payment_method_id: 'pix', external_reference: input.orderId, notification_url: input.notificationUrl,
      payer: { email: input.email, first_name: input.firstName.slice(0, 60), identification: { type: input.document.length === 14 ? 'CNPJ' : 'CPF', number: input.document } },
    },
  });
  const data = payment.point_of_interaction?.transaction_data;
  return { paymentId: String(payment.id), pixPayload: data?.qr_code ?? null, pixImage: data?.qr_code_base64 ?? null, invoiceUrl: data?.ticket_url ?? null };
}

export async function createCardPreference(secrets: MpSecrets, input: { orderId: string; amount: number; title: string; notificationUrl: string; backUrl: string; email: string; sandbox: boolean }) {
  const pref = await request<{ id: string; init_point?: string; sandbox_init_point?: string }>(secrets, '/checkout/preferences', {
    method: 'POST', idempotencyKey: `delflash-${input.orderId}-card`,
    body: {
      items: [{ id: input.orderId, title: input.title.slice(0, 250), quantity: 1, unit_price: Math.round(input.amount * 100) / 100, currency_id: 'BRL' }],
      external_reference: input.orderId, notification_url: input.notificationUrl, payer: { email: input.email },
      back_urls: { success: input.backUrl, pending: input.backUrl, failure: input.backUrl }, auto_return: 'approved',
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 1 },
    },
  });
  return { preferenceId: pref.id, invoiceUrl: (input.sandbox ? pref.sandbox_init_point : pref.init_point) ?? pref.init_point ?? null };
}

export const fetchPayment = (secrets: MpSecrets, id: string) => request<MpPayment>(secrets, `/v1/payments/${encodeURIComponent(id)}`);

/**
 * Valida o cabeçalho x-signature do Mercado Pago:
 * manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` assinado com
 * HMAC-SHA256 pela assinatura secreta da loja. Recusa eventos com mais de 15 min.
 */
export function verifySignature(secret: string, header: string | null, requestId: string | null, dataId: string, now = Date.now()): boolean {
  if (!secret || !header || !dataId) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]));
  const ts = parts.ts, v1 = parts.v1;
  if (!ts || !v1 || !/^[a-f0-9]{64}$/i.test(v1)) return false;
  const tsMs = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > 15 * 60_000) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `id:${id};${requestId ? `request-id:${requestId};` : ''}ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  return expected.length === v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(v1.toLowerCase()));
}

/** Situação do pagamento do Mercado Pago → efeito no pedido. */
export function mapStatus(status: string): 'PAID' | 'FAILED' | 'REFUNDED' | null {
  if (status === 'approved') return 'PAID';
  if (status === 'rejected' || status === 'cancelled') return 'FAILED';
  if (status === 'refunded' || status === 'charged_back') return 'REFUNDED';
  return null;
}
