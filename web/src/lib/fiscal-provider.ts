import 'server-only';
import { prisma, toNumber } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { fiscalProfileProblems, readFiscalProfile, type FiscalProfile } from '@/lib/fiscal';

/**
 * Emissão de NFC-e por provedor homologado (Focus NFe). O provedor guarda o
 * certificado A1 e o CSC da loja e fala com a SEFAZ; aqui só enviamos os
 * dados da venda e guardamos o que a SEFAZ devolveu (chave, protocolo, XML e
 * DANFE). Produção fica bloqueada até a plataforma liberar FISCAL_PRODUCTION.
 * Nada é gerado localmente como se fosse documento fiscal.
 */
export type FiscalProviderConfig = { provider: 'focusnfe'; environment: 'homologacao' | 'producao'; encrypted?: string };
export type FiscalDocument = { ref: string; environment: 'homologacao' | 'producao'; status: 'processando' | 'autorizado' | 'erro_autorizacao' | 'cancelado' | 'rejeitado'; chave?: string | null; numero?: string | null; serie?: string | null; protocolo?: string | null; xmlUrl?: string | null; danfeUrl?: string | null; message?: string | null; createdAt: string; updatedAt: string };

const BASES = { homologacao: 'https://homologacao.focusnfe.com.br', producao: 'https://api.focusnfe.com.br' } as const;
const docKey = (orderId: string) => `fiscal-doc:${orderId}`;

export function readFiscalProvider(settings: unknown): FiscalProviderConfig {
  const root = settings && typeof settings === 'object' ? (settings as Record<string, any>) : {};
  const raw = root.fiscalProvider ?? {};
  return { provider: 'focusnfe', environment: raw.environment === 'producao' ? 'producao' : 'homologacao', encrypted: typeof raw.encrypted === 'string' ? raw.encrypted : undefined };
}
export const fiscalEmissionAllowed = (config: FiscalProviderConfig) => Boolean(config.encrypted) && (config.environment === 'homologacao' || process.env.FISCAL_PRODUCTION === 'true');
export const sealFiscalToken = (token: string) => encryptJson({ token });

async function call<T>(config: FiscalProviderConfig, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  if (config.environment === 'producao' && process.env.FISCAL_PRODUCTION !== 'true') throw new Error('Emissão em produção não liberada pela plataforma.');
  const { token } = decryptJson<{ token: string }>(config.encrypted!);
  let response: Response;
  try {
    response = await fetch(`${BASES[config.environment]}${path}`, {
      method: init.method ?? 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`, 'Content-Type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch { throw new Error('O provedor fiscal não respondeu. Tente novamente.'); }
  if (response.status === 401 || response.status === 403) throw new Error('Token do provedor fiscal recusado.');
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}

export async function readFiscalDocument(orderId: string) {
  const row = await prisma.platformSetting.findUnique({ where: { key: docKey(orderId) } });
  return (row?.value as FiscalDocument | undefined) ?? null;
}
async function saveDoc(orderId: string, doc: FiscalDocument) {
  await prisma.platformSetting.upsert({ where: { key: docKey(orderId) }, create: { key: docKey(orderId), value: doc }, update: { value: doc } });
  return doc;
}

const PAYMENT_CODE: Record<string, string> = { CASH: '01', CREDIT_CARD: '03', DEBIT_CARD: '04', PIX: '17', ONLINE: '99' };

type FocusResponse = { status?: string; status_sefaz?: string; mensagem_sefaz?: string; mensagem?: string; codigo?: string; chave_nfe?: string; numero?: string; serie?: string; protocolo?: string; caminho_xml_nota_fiscal?: string; caminho_danfe?: string; erros?: Array<{ mensagem?: string }> };

function fromFocus(config: FiscalProviderConfig, ref: string, r: FocusResponse, previous?: FiscalDocument | null): FiscalDocument {
  const base = BASES[config.environment];
  const abs = (p?: string) => (p ? (p.startsWith('http') ? p : `${base}${p}`) : null);
  const status: FiscalDocument['status'] = r.status === 'autorizado' ? 'autorizado' : r.status === 'cancelado' ? 'cancelado' : r.status === 'processando_autorizacao' ? 'processando' : r.status === 'erro_autorizacao' ? 'erro_autorizacao' : 'rejeitado';
  return {
    ref, environment: config.environment, status,
    chave: r.chave_nfe ?? previous?.chave ?? null, numero: r.numero ?? previous?.numero ?? null, serie: r.serie ?? previous?.serie ?? null,
    protocolo: r.protocolo ?? previous?.protocolo ?? null, xmlUrl: abs(r.caminho_xml_nota_fiscal) ?? previous?.xmlUrl ?? null, danfeUrl: abs(r.caminho_danfe) ?? previous?.danfeUrl ?? null,
    message: r.mensagem_sefaz ?? r.mensagem ?? r.erros?.map((e) => e.mensagem).filter(Boolean).join(' · ') ?? null,
    createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

/** Monta a NFC-e a partir do pedido gravado (valores do banco, nunca da tela). */
export function buildNfcePayload(profile: FiscalProfile, order: { createdAt: Date; deliveryType: string; deliveryFee: number; discount: number; total: number; paymentMethod: string | null; items: Array<{ productId: string | null; productName: string; quantity: number; total: number }> }) {
  const items = order.items.map((item, i) => ({
    numero_item: i + 1, codigo_produto: (item.productId ?? `item${i + 1}`).slice(0, 60), descricao: item.productName.slice(0, 120),
    cfop: profile.defaultCfop, codigo_ncm: profile.defaultNcm, unidade_comercial: 'UN', quantidade_comercial: item.quantity,
    valor_unitario_comercial: Math.round((item.total / item.quantity) * 100) / 100, valor_bruto: Math.round(item.total * 100) / 100,
    unidade_tributavel: 'UN', quantidade_tributavel: item.quantity, valor_unitario_tributavel: Math.round((item.total / item.quantity) * 100) / 100,
    icms_origem: profile.origin, icms_situacao_tributaria: profile.icmsCode,
  }));
  return {
    cnpj_emitente: profile.cnpj, data_emissao: order.createdAt.toISOString(), natureza_operacao: 'VENDA AO CONSUMIDOR',
    presenca_comprador: order.deliveryType === 'PICKUP' ? '1' : '4', modalidade_frete: order.deliveryType === 'PICKUP' ? '9' : '0', local_destino: '1',
    valor_frete: Math.round(order.deliveryFee * 100) / 100, valor_desconto: Math.round(order.discount * 100) / 100,
    items,
    formas_pagamento: [{ forma_pagamento: PAYMENT_CODE[order.paymentMethod ?? ''] ?? '99', valor_pagamento: Math.round(order.total * 100) / 100 }],
  };
}

/** Emite (ou devolve a já emitida) a NFC-e do pedido. Referência única por pedido evita duplicidade. */
export async function emitNfce(organizationId: string, orderId: string): Promise<FiscalDocument> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const config = readFiscalProvider(org?.settings);
  if (!config.encrypted) throw new Error('Cadastre o token do provedor fiscal antes de emitir.');
  if (!fiscalEmissionAllowed(config)) throw new Error('Emissão em produção não liberada pela plataforma. Use homologação.');
  const profile = readFiscalProfile(org?.settings);
  const problems = fiscalProfileProblems(profile);
  if (problems.length) throw new Error(`Complete o cadastro fiscal: ${problems.join(', ')}.`);
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId }, include: { items: true } });
  if (!order) throw new Error('Pedido não encontrado.');
  if (order.status === 'CANCELLED') throw new Error('Pedido cancelado não recebe nota.');
  if (order.paymentStatus !== 'PAID') throw new Error('Emita a nota depois que o pagamento estiver confirmado.');
  const previous = await readFiscalDocument(orderId);
  if (previous && ['autorizado', 'processando', 'cancelado'].includes(previous.status)) return previous;
  const ref = previous?.ref && previous.status !== 'autorizado' ? previous.ref : `df-${orderId}`;
  const payload = buildNfcePayload(profile, { createdAt: order.createdAt, deliveryType: order.deliveryType, deliveryFee: toNumber(order.deliveryFee), discount: toNumber(order.discount), total: toNumber(order.total), paymentMethod: order.paymentMethod, items: order.items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, total: toNumber(i.total) })) });
  const { data } = await call<FocusResponse>(config, `/v2/nfce?ref=${encodeURIComponent(ref)}&completa=1`, { method: 'POST', body: payload });
  return saveDoc(orderId, fromFocus(config, ref, data, previous));
}

export async function consultNfce(organizationId: string, orderId: string): Promise<FiscalDocument> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const config = readFiscalProvider(org?.settings);
  const previous = await readFiscalDocument(orderId);
  if (!previous || !config.encrypted) throw new Error('Nenhuma nota emitida para este pedido.');
  if (!(await prisma.order.count({ where: { id: orderId, organizationId } }))) throw new Error('Pedido não encontrado.');
  const { data } = await call<FocusResponse>({ ...config, environment: previous.environment }, `/v2/nfce/${encodeURIComponent(previous.ref)}?completa=1`);
  return saveDoc(orderId, fromFocus({ ...config, environment: previous.environment }, previous.ref, data, previous));
}

export async function cancelNfce(organizationId: string, orderId: string, reason: string): Promise<FiscalDocument> {
  const justificativa = reason.trim();
  if (justificativa.length < 15 || justificativa.length > 255) throw new Error('A justificativa do cancelamento deve ter de 15 a 255 caracteres.');
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const config = readFiscalProvider(org?.settings);
  const previous = await readFiscalDocument(orderId);
  if (!previous || previous.status !== 'autorizado' || !config.encrypted) throw new Error('Só uma nota autorizada pode ser cancelada.');
  if (!(await prisma.order.count({ where: { id: orderId, organizationId } }))) throw new Error('Pedido não encontrado.');
  const { data } = await call<FocusResponse>({ ...config, environment: previous.environment }, `/v2/nfce/${encodeURIComponent(previous.ref)}`, { method: 'DELETE', body: { justificativa } });
  const doc = fromFocus({ ...config, environment: previous.environment }, previous.ref, data, previous);
  return saveDoc(orderId, data.status === 'cancelado' ? doc : { ...previous, message: doc.message ?? 'Cancelamento recusado pela SEFAZ.', updatedAt: new Date().toISOString() });
}

/** Já houve NFC-e autorizada em homologação nesta loja? (passo da prontidão) */
export async function homologationPassed(organizationId: string) {
  const orders = await prisma.order.findMany({ where: { organizationId }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  if (!orders.length) return false;
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: orders.map((o) => docKey(o.id)) } }, select: { value: true } });
  return rows.some((r) => (r.value as FiscalDocument).environment === 'homologacao' && ['autorizado', 'cancelado'].includes((r.value as FiscalDocument).status));
}
