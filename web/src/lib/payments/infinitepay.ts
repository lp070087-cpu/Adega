/**
 * ═══════════════════════════════════════════════════════════════════════
 * INFINITEPAY — Checkout Integrado da conta da própria loja
 * -----------------------------------------------------------------------
 * • A loja informa só a InfiniteTag dela (o "handle", sem o $). Não há
 *   chave secreta: o dinheiro cai direto na conta InfinitePay da loja.
 * • POST /links cria o link de pagamento (Pix ou cartão, escolhidos na
 *   página da InfinitePay). Valores em centavos.
 * • O webhook da InfinitePay NÃO é assinado. Nada é liberado só porque um
 *   aviso chegou ou porque o cliente voltou: o servidor sempre confere em
 *   POST /payment_check e só aceita `success && paid && amount >= total`.
 * • Não existe ambiente de testes: todo link criado é real.
 * Documentação: https://www.infinitepay.io/checkout-documentacao
 * ═══════════════════════════════════════════════════════════════════════
 */

/** INFINITEPAY_API_URL só existe para testes locais com um servidor simulado. */
export const INFINITEPAY_API = (process.env.INFINITEPAY_API_URL || 'https://api.checkout.infinitepay.io').replace(/\/+$/, '');

/** InfiniteTag aceita como digitada pelo lojista ("$minhaloja", "Minha.Loja"). */
export function normalizeInfiniteTag(value: string): string {
  return value.trim().replace(/^\$+/, '').toLowerCase();
}

export function validInfiniteTag(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9._-]{0,58}[a-z0-9])?$/.test(value);
}

export type InfinitePayLinkInput = {
  handle: string;
  orderNsu: string;
  amountCents: number;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  customer?: { name?: string; phone_number?: string; email?: string };
};

type Fetch = typeof fetch;

/** Cria o link do checkout. Devolve a URL para onde o cliente é levado. */
export async function createInfinitePayLink(input: InfinitePayLinkInput, run: Fetch = fetch): Promise<string> {
  if (!validInfiniteTag(input.handle)) throw new Error('InfiniteTag inválida.');
  if (!Number.isInteger(input.amountCents) || input.amountCents < 100) throw new Error('Valor mínimo para pagamento online: R$ 1,00.');
  const customer = input.customer && Object.fromEntries(Object.entries(input.customer).filter(([, v]) => Boolean(v)));
  const response = await run(`${INFINITEPAY_API}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      handle: input.handle,
      order_nsu: input.orderNsu,
      redirect_url: input.redirectUrl,
      webhook_url: input.webhookUrl,
      items: [{ quantity: 1, price: input.amountCents, description: input.description.slice(0, 200) }],
      ...(customer && Object.keys(customer).length ? { customer } : {}),
    }),
  });
  const data = (await response.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof data?.url === 'string' ? data.url : '';
  if (!response.ok || !/^https:\/\/checkout\.infinitepay\.io\//.test(url)) {
    throw new Error(response.status === 400 || response.status === 404 || response.status === 422 ? 'A InfinitePay recusou a InfiniteTag ou os dados do pedido.' : 'A InfinitePay não respondeu.');
  }
  return url;
}

export type InfinitePayCheck = { success: boolean; paid: boolean; amount: number; paidAmount: number; captureMethod: string | null };

/**
 * Pergunta à InfinitePay se o pagamento existe e está pago. Dados errados
 * voltam 200 com `success:false`; falha de rede lança erro (o webhook
 * responde 400 e a InfinitePay tenta de novo).
 */
export async function checkInfinitePayPayment(input: { handle: string; orderNsu: string; transactionNsu: string; slug: string }, run: Fetch = fetch): Promise<InfinitePayCheck> {
  const response = await run(`${INFINITEPAY_API}/payment_check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ handle: input.handle, order_nsu: input.orderNsu, transaction_nsu: input.transactionNsu, slug: input.slug }),
  });
  if (!response.ok) throw new Error(`InfinitePay respondeu HTTP ${response.status}.`);
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    success: data.success === true,
    paid: data.paid === true,
    amount: Number(data.amount) || 0,
    paidAmount: Number(data.paid_amount) || 0,
    captureMethod: typeof data.capture_method === 'string' ? data.capture_method : null,
  };
}

/** Identificadores que a InfinitePay manda no webhook e na volta do checkout. */
export function infinitePayRef(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : null;
}
