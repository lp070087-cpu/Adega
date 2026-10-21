import 'server-only';
import { timingSafeEqual } from 'node:crypto';

export type AsaasEnvironment = 'sandbox' | 'production';
export type AsaasConfig = { environment: AsaasEnvironment; apiKey: string };
export class AsaasError extends Error {
  constructor(public readonly uncertain = false) {
    super(uncertain ? 'Resposta inconclusiva do Asaas. Consulte antes de repetir a operação.' : 'Não foi possível concluir a operação no Asaas.');
  }
}
const bases = { sandbox: 'https://api-sandbox.asaas.com/v3', production: 'https://api.asaas.com/v3' };
export function authenticateAsaasWebhook(expected: string, received: string | null) {
  if (!received || expected.length < 32 || expected.length > 255 || /\s/.test(expected)) return false;
  const a = Buffer.from(expected), b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function asaasClient(config: AsaasConfig, fetcher: typeof fetch = fetch) {
  if (!config.apiKey || !Object.hasOwn(bases, config.environment)) throw new AsaasError();
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    // Production mutations intentionally have no activation switch in this release.
    if (config.environment === 'production' && method !== 'GET') throw new Error('Cobranças de produção não autorizadas.');
    let response: Response;
    try {
      response = await fetcher(`${bases[config.environment]}${path}`, {
        method, headers: { access_token: config.apiKey, 'Content-Type': 'application/json', 'User-Agent': 'AdegaSaaS/1.0' },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new AsaasError(method !== 'GET'); }
    if (!response.ok) throw new AsaasError(method !== 'GET' && response.status >= 500);
    try { return await response.json() as T; } catch { throw new AsaasError(method !== 'GET'); }
  }
  const id = (value: string) => { if (!/^[A-Za-z0-9_]+$/.test(value)) throw new AsaasError(); return value; };
  return {
    customers: (reference: string) => request<{ data: Array<{ id: string }> }>(`/customers?externalReference=${encodeURIComponent(reference)}&limit=100`),
    createCustomer: (input: { name: string; cpfCnpj: string; email: string; externalReference: string }) => request<{ id: string }>('/customers', 'POST', { ...input, notificationDisabled: true }),
    createSubscription: (customer: string, reference: string, nextDueDate: string, billingType: 'PIX' | 'BOLETO') => request<{ id: string }>('/subscriptions', 'POST', { customer: id(customer), externalReference: reference, nextDueDate, billingType, cycle: 'MONTHLY', value: 119, description: 'Del Flash Completo' }),
    subscription: (value: string) => request<{ id: string; customer: string; status: string }>(`/subscriptions/${id(value)}`),
    payments: (value: string) => request<{ data: Array<{ id: string; status: string; value: number; dueDate: string }> }>(`/subscriptions/${id(value)}/payments?limit=100`),
    payment: (value: string) => request<{ id: string; subscription: string; customer: string; status: string; value: number; dueDate: string; paymentDate?: string; billingType: string }>(`/payments/${id(value)}`),
    pix: (value: string) => request<{ encodedImage: string; payload: string; expirationDate: string }>(`/payments/${id(value)}/pixQrCode`),
    setStatus: (value: string, status: 'ACTIVE' | 'INACTIVE') => request<{ id: string; status: string }>(`/subscriptions/${id(value)}`, 'PUT', { status }),
    cancel: (value: string) => request<{ id: string; deleted: boolean }>(`/subscriptions/${id(value)}`, 'DELETE'),
  };
}
