/**
 * Conexão oficial do WhatsApp: chamadas à Graph API da Meta.
 *
 * Nada aqui marca conexão por conta própria: cada função devolve o que a Meta
 * respondeu, e a mensagem de erro é a da própria Meta. Quem grava o canal só
 * grava depois de `verifyPhoneNumber` confirmar o número com o token recebido.
 */
export class MetaError extends Error {
  constructor(message: string, readonly status: number | null) { super(message); }
}

type Fetcher = typeof fetch;

async function graph<T>(version: string, path: string, init: { method?: string; token?: string; body?: unknown } = {}, run: Fetcher = fetch): Promise<T> {
  let response: Response;
  try {
    response = await run(`https://graph.facebook.com/${version}/${path}`, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: { ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new MetaError('A Meta não respondeu. Tente novamente em instantes.', null);
  }
  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!response.ok) {
    const reason = data.error?.message ?? `HTTP ${response.status}`;
    throw new MetaError(`A Meta recusou: ${reason}${data.error?.code ? ` (código ${data.error.code})` : ''}`, response.status);
  }
  return data;
}

/** Confere que o token enxerga este número. Devolve o nome verificado na Meta. */
export async function verifyPhoneNumber(version: string, phoneNumberId: string, token: string, run?: Fetcher) {
  const data = await graph<{ id?: string; verified_name?: string; display_phone_number?: string }>(version, `${phoneNumberId}?fields=id,verified_name,display_phone_number`, { token }, run);
  if (data.id !== phoneNumberId) throw new MetaError('A Meta devolveu outro número para este token.', null);
  return { name: data.verified_name ?? null, phone: data.display_phone_number ?? null };
}

/** Troca o código do Embedded Signup por um token de acesso do negócio. */
export async function exchangeSignupCode(version: string, input: { appId: string; appSecret: string; code: string }, run?: Fetcher) {
  const query = new URLSearchParams({ client_id: input.appId, client_secret: input.appSecret, code: input.code });
  const data = await graph<{ access_token?: string }>(version, `oauth/access_token?${query}`, {}, run);
  if (!data.access_token) throw new MetaError('A Meta não devolveu o token de acesso.', null);
  return data.access_token;
}

/** Assina o aplicativo na conta do WhatsApp Business: é o que faz o webhook receber as mensagens. */
export async function subscribeApp(version: string, wabaId: string, token: string, run?: Fetcher) {
  await graph(version, `${wabaId}/subscribed_apps`, { method: 'POST', token }, run);
}

/** Registra o número na Cloud API com um PIN de verificação em duas etapas. */
export async function registerPhoneNumber(version: string, phoneNumberId: string, token: string, pin: string, run?: Fetcher) {
  await graph(version, `${phoneNumberId}/register`, { method: 'POST', token, body: { messaging_product: 'whatsapp', pin } }, run);
}

/** Interpreta a mensagem que a janela do Embedded Signup envia ao concluir. */
export function readSignupMessage(raw: unknown): { event: 'FINISH'; phoneNumberId: string; wabaId: string } | { event: 'CANCEL' | 'ERROR'; detail: string } | null {
  let message: { type?: string; event?: string; data?: Record<string, unknown> };
  try { message = typeof raw === 'string' ? JSON.parse(raw) : (raw as typeof message); } catch { return null; }
  if (message?.type !== 'WA_EMBEDDED_SIGNUP') return null;
  const data = message.data ?? {};
  if (message.event === 'CANCEL') return { event: 'CANCEL', detail: String(data.current_step ?? '') };
  if (message.event === 'ERROR') return { event: 'ERROR', detail: String(data.error_message ?? 'Erro informado pela Meta.') };
  if (typeof message.event === 'string' && message.event.startsWith('FINISH') && typeof data.phone_number_id === 'string' && typeof data.waba_id === 'string') {
    return { event: 'FINISH', phoneNumberId: data.phone_number_id, wabaId: data.waba_id };
  }
  return null;
}
