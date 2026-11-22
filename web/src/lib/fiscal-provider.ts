import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma, toNumber } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { lookupCep } from '@/lib/maps/geocoding';
import { checkProductRegime, fiscalProfileProblems, fiscalSettings, readFiscalProfile, readProductFiscal, type FiscalProfile, type ProductFiscal } from '@/lib/fiscal';

export type FiscalEnvironment = 'homologacao' | 'producao';
export type FiscalProviderConfig = { provider: 'focusnfe'; environment: FiscalEnvironment; encrypted?: string; productionIssuer?: string; credentials: Partial<Record<FiscalEnvironment, string>> };
export type FiscalDocument = {
  ref: string;
  environment: FiscalEnvironment;
  status: 'processando' | 'autorizado' | 'erro_autorizacao' | 'cancelado' | 'rejeitado';
  chave?: string | null;
  numero?: string | null;
  serie?: string | null;
  protocolo?: string | null;
  xmlUrl?: string | null;
  danfeUrl?: string | null;
  message?: string | null;
  createdAt: string;
  updatedAt: string;
};
type FiscalClient = Pick<Prisma.TransactionClient, 'platformSetting'>;
type Credentials = Pick<FiscalProviderConfig, 'environment' | 'encrypted'>;
type FiscalItem = { productId: string | null; productName: string; quantity: number; total: number; fiscal: ProductFiscal };
type Destination = { zip: string; street: string; number: string; district: string; city: string; uf: string; name: string; cpf?: string };
type FiscalSale = { deliveryType: string; deliveryFee: number; discount: number; total: number; paymentMethod: string; items: FiscalItem[]; destination?: Destination };
type FocusResponse = {
  status?: string; mensagem_sefaz?: string; mensagem?: string; codigo?: string;
  chave_nfe?: string; numero?: string; serie?: string; protocolo?: string;
  protocolo_nota_fiscal?: string | { nProt?: string; infProt?: { nProt?: string } };
  caminho_xml_nota_fiscal?: string; caminho_danfe?: string;
  erros?: Array<{ mensagem?: string }>;
};

const BASES = { homologacao: 'https://homologacao.focusnfe.com.br', producao: 'https://api.focusnfe.com.br' } as const;
const orderKey = (orderId: string, environment: FiscalEnvironment) => `fiscal-doc:${environment}:${orderId}`;
const testKey = (id: string) => `fiscal-test:${id}`;
const evidenceKey = (id: string) => `fiscal-test-approved:${id}`;
const PAYMENT_CODE: Record<string, string> = { CASH: '01', CREDIT_CARD: '03', DEBIT_CARD: '04', PIX: '17', OTHER: '99' };

export function readFiscalProvider(settings: unknown): FiscalProviderConfig {
  const raw = fiscalSettings(fiscalSettings(settings).fiscalProvider);
  const saved = fiscalSettings(raw.credentials);
  const environment = raw.environment === 'producao' ? 'producao' : 'homologacao';
  const credentials: FiscalProviderConfig['credentials'] = {};
  for (const target of ['homologacao', 'producao'] as const) {
    const value = saved[target];
    if (typeof value === 'string' && value) credentials[target] = value;
  }
  if (!credentials[environment] && typeof raw.encrypted === 'string' && raw.encrypted) credentials[environment] = raw.encrypted;
  return {
    provider: 'focusnfe', environment, credentials, encrypted: credentials[environment],
    productionIssuer: typeof raw.productionIssuer === 'string' ? raw.productionIssuer : undefined,
  };
}
export const sealFiscalToken = (token: string) => encryptJson({ token });

export function fiscalCredentials(settings: unknown, environment: FiscalEnvironment): Credentials {
  if (environment !== 'homologacao' && environment !== 'producao') throw new Error('Ambiente fiscal inválido.');
  return { environment, encrypted: readFiscalProvider(settings).credentials[environment] };
}

async function call(config: Credentials, path: string, init: { method?: string; body?: unknown } = {}) {
  if (!config.encrypted) throw new Error('Salve o token da Focus NFe para este ambiente.');
  const { token } = decryptJson<{ token: string }>(config.encrypted);
  let response: Response;
  try {
    response = await fetch(`${BASES[config.environment]}${path}`, {
      method: init.method ?? 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`, 'Content-Type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new Error('A Focus NFe não respondeu. Consulte o status antes de tentar reenviar.');
  }
  if (response.status === 401 || response.status === 403) throw new Error('Token recusado pela Focus NFe neste ambiente.');
  if (response.status === 429 || response.status >= 500) throw new Error(`Focus NFe temporariamente indisponível (HTTP ${response.status}).`);
  const data = await response.json().catch(() => null) as FocusResponse | null;
  if (!data || typeof data !== 'object') throw new Error('A Focus NFe devolveu uma resposta inválida.');
  return { status: response.status, data };
}

const notePath = (ref: string) => `/v2/nfce/${encodeURIComponent(ref)}`;
export async function testFiscalProvider(config: Credentials) {
  const { status } = await call(config, notePath(`df-conexao-${randomUUID()}`));
  if (status !== 404) throw new Error(`A Focus NFe não confirmou o acesso à API de NFC-e (HTTP ${status}).`);
  return 'Token aceito pela Focus NFe. Emita uma NFC-e de teste para validar o credenciamento na SEFAZ.';
}

export const fiscalIssuer = (profile: FiscalProfile) => [profile.cnpj, profile.stateRegistration, profile.uf, profile.regime].join(':');
export async function homologationPassed(organizationId: string, settings: unknown, db: FiscalClient = prisma) {
  const profile = readFiscalProfile(settings);
  if (fiscalProfileProblems(profile).length) return false;
  const value = fiscalSettings((await db.platformSetting.findUnique({ where: { key: evidenceKey(organizationId) } }))?.value);
  return value.issuer === fiscalIssuer(profile) && value.approved === true;
}

export async function fiscalEmissionAllowed(organizationId: string, settings: unknown) {
  const profile = readFiscalProfile(settings);
  const config = readFiscalProvider(settings);
  if (!config.encrypted || fiscalProfileProblems(profile).length) return false;
  return config.environment === 'homologacao' || (process.env.FISCAL_PRODUCTION === 'true' && config.productionIssuer === fiscalIssuer(profile) && await homologationPassed(organizationId, settings));
}

async function readDoc(key: string, db: FiscalClient = prisma) {
  return (await db.platformSetting.findUnique({ where: { key } }))?.value as FiscalDocument | undefined ?? null;
}
export const readFiscalTest = (organizationId: string) => readDoc(testKey(organizationId));

export async function readFiscalDocument(orderId: string, environment: FiscalEnvironment, db: FiscalClient = prisma) {
  const current = await readDoc(orderKey(orderId, environment), db);
  if (current) return current;
  const previous = await readDoc(`fiscal-doc:${orderId}`, db);
  return previous?.environment === environment ? previous : null;
}

async function saveDoc(db: FiscalClient, key: string, doc: FiscalDocument) {
  return db.platformSetting.upsert({ where: { key }, create: { key, value: doc }, update: { value: doc } });
}

function fromFocus(config: Credentials, r: FocusResponse, previous: FiscalDocument): FiscalDocument {
  const base = BASES[config.environment];
  const abs = (path?: string) => {
    if (!path) return null;
    try {
      const url = new URL(path, base);
      return url.origin === base ? url.href : null;
    } catch { return null; }
  };
  const extraProtocol = typeof r.protocolo_nota_fiscal === 'string' ? r.protocolo_nota_fiscal :
    r.protocolo_nota_fiscal?.nProt ?? r.protocolo_nota_fiscal?.infProt?.nProt;
  const status: FiscalDocument['status'] = r.status === 'autorizado' ? 'autorizado' :
    r.status === 'cancelado' ? 'cancelado' : ['processando_autorizacao', 'processando'].includes(r.status ?? '') ? 'processando' :
    r.status === 'erro_autorizacao' ? 'erro_autorizacao' : 'rejeitado';
  return {
    ...previous, status,
    chave: r.chave_nfe ?? previous.chave ?? null, numero: r.numero ?? previous.numero ?? null,
    serie: r.serie ?? previous.serie ?? null, protocolo: r.protocolo ?? extraProtocol ?? previous.protocolo ?? null,
    xmlUrl: abs(r.caminho_xml_nota_fiscal) ?? previous.xmlUrl ?? null, danfeUrl: abs(r.caminho_danfe) ?? previous.danfeUrl ?? null,
    message: r.mensagem_sefaz ?? r.mensagem ?? r.erros?.map((error) => error.mensagem).filter(Boolean).join(' · ') ?? null,
    updatedAt: new Date().toISOString(),
  };
}

const cents = (n: number) => Math.round(n * 100);
const money = (n: number) => cents(n) / 100;
function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let done = 0;
  let allocated = 0;
  return weights.map((weight) => {
    done += weight;
    const next = sum ? Math.round(total * done / sum) : 0;
    const part = next - allocated;
    allocated = next;
    return part / 100;
  });
}

export function buildNfcePayload(profile: FiscalProfile, sale: FiscalSale, issuedAt = new Date()) {
  const issues = fiscalProfileProblems(profile);
  if (issues.length) throw new Error(`Complete o cadastro fiscal: ${issues.join(', ')}.`);
  if (!Object.hasOwn(PAYMENT_CODE, sale.paymentMethod)) throw new Error('O meio de pagamento confirmado precisa ser identificado para a NFC-e.');
  const delivery = sale.deliveryType === 'DELIVERY';
  if (delivery && (!sale.destination || sale.destination.uf !== profile.uf)) throw new Error('A NFC-e requer endereço de entrega dentro da UF do emitente.');
  const weights = sale.items.map((item) => cents(item.total));
  const subtotal = weights.reduce((sum, value) => sum + value, 0);
  if (!sale.items.length || subtotal <= 0 || weights.some((value) => value <= 0) ||
    subtotal + cents(sale.deliveryFee) - cents(sale.discount) !== cents(sale.total)) {
    throw new Error('Os valores do pedido não fecham com os itens, o frete e o desconto.');
  }
  const freight = allocate(cents(sale.deliveryFee), weights);
  const discounts = allocate(cents(sale.discount), weights);
  const items = sale.items.map(({ fiscal, ...item }, index) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error(`Quantidade fiscal inválida: ${item.productName}.`);
    checkProductRegime(profile, fiscal);
    const unit = Number((item.total / item.quantity).toFixed(10));
    const base = money(item.total + freight[index]! - discounts[index]!);
    const regularIcms = fiscal.icmsCode === '00' && fiscal.icmsRate !== null;
    const pisTaxed = ['01', '02', '49', '99'].includes(fiscal.pisCode) && fiscal.pisRate !== null;
    const cofinsTaxed = ['01', '02', '49', '99'].includes(fiscal.cofinsCode) && fiscal.cofinsRate !== null;
    return {
      numero_item: index + 1, codigo_produto: (item.productId ?? `item${index + 1}`).slice(0, 60), descricao: item.productName.slice(0, 120),
      cfop: fiscal.cfop, codigo_ncm: fiscal.ncm, ...(fiscal.cest ? { cest: fiscal.cest } : {}),
      unidade_comercial: fiscal.unit, quantidade_comercial: item.quantity, valor_unitario_comercial: unit, valor_bruto: money(item.total),
      unidade_tributavel: fiscal.unit, quantidade_tributavel: item.quantity, valor_unitario_tributavel: unit,
      ...(freight[index] ? { valor_frete: freight[index] } : {}), ...(discounts[index] ? { valor_desconto: discounts[index] } : {}),
      icms_origem: fiscal.origin, icms_situacao_tributaria: fiscal.icmsCode,
      ...(regularIcms ? { icms_modalidade_base_calculo: '3', icms_base_calculo: base, icms_aliquota: fiscal.icmsRate, icms_valor: money(base * fiscal.icmsRate! / 100) } : {}),
      pis_situacao_tributaria: fiscal.pisCode,
      ...(pisTaxed ? { pis_base_calculo: base, pis_aliquota_porcentual: fiscal.pisRate, pis_valor: money(base * fiscal.pisRate! / 100) } : {}),
      cofins_situacao_tributaria: fiscal.cofinsCode,
      ...(cofinsTaxed ? { cofins_base_calculo: base, cofins_aliquota_porcentual: fiscal.cofinsRate, cofins_valor: money(base * fiscal.cofinsRate! / 100) } : {}),
    };
  });
  const address = sale.destination;
  return {
    cnpj_emitente: profile.cnpj, data_emissao: issuedAt.toISOString(), natureza_operacao: 'VENDA AO CONSUMIDOR',
    tipo_documento: '1', finalidade_emissao: '1', consumidor_final: '1',
    presenca_comprador: delivery ? '4' : '1', modalidade_frete: delivery ? '0' : '9', local_destino: '1',
    ...(address && {
      nome_destinatario: address.name.slice(0, 60), ...(address.cpf ? { cpf_destinatario: address.cpf } : {}),
      indicador_inscricao_estadual_destinatario: '9', logradouro_destinatario: address.street.slice(0, 60),
      numero_destinatario: address.number.slice(0, 60), bairro_destinatario: address.district.slice(0, 60),
      municipio_destinatario: address.city.slice(0, 60), uf_destinatario: address.uf, cep_destinatario: address.zip,
    }),
    valor_frete: money(sale.deliveryFee), valor_desconto: money(sale.discount),
    items,
    formas_pagamento: [{ forma_pagamento: PAYMENT_CODE[sale.paymentMethod], valor_pagamento: money(sale.total),
      ...(sale.paymentMethod === 'OTHER' ? { descricao_pagamento: 'Outros meios de pagamento' } : {}) }],
  };
}

const terminal = (doc: FiscalDocument) => ['autorizado', 'cancelado'].includes(doc.status);
const pendingDocument = (ref: string, environment: FiscalEnvironment, previous?: FiscalDocument | null): FiscalDocument => {
  const now = new Date().toISOString();
  return { ref, environment, status: 'processando', createdAt: previous?.createdAt ?? now, updatedAt: now };
};

async function updateResult(organizationId: string, key: string, config: Credentials, previous: FiscalDocument, response: FocusResponse, approvedIssuer?: string) {
  const next = fromFocus(config, response, previous);
  return withOrganizationTransaction(organizationId, async (tx) => {
    const current = await readDoc(key, tx);
    if (current && current.ref !== previous.ref) return current;
    if (current?.status === 'cancelado' || (current?.status === 'autorizado' && !terminal(next))) return current;
    await saveDoc(tx, key, next);
    if (approvedIssuer && next.status === 'autorizado' && next.chave?.length === 44 && next.xmlUrl) {
      const value = { approved: true, issuer: approvedIssuer };
      await tx.platformSetting.upsert({ where: { key: evidenceKey(organizationId) }, create: { key: evidenceKey(organizationId), value }, update: { value } });
    }
    return next;
  });
}

const queryDoc = (config: Credentials, doc: FiscalDocument) => call(config, `${notePath(doc.ref)}?completa=1`);
const sendDoc = (config: Credentials, doc: FiscalDocument, body: ReturnType<typeof buildNfcePayload>) =>
  call(config, `/v2/nfce?ref=${encodeURIComponent(doc.ref)}&completa=1`, { method: 'POST', body });

async function consult(organizationId: string, key: string, config: Credentials, previous: FiscalDocument, approvedIssuer?: string) {
  const result = await queryDoc(config, previous);
  if (result.status === 404) {
    if (previous.status === 'processando' && Date.now() - Date.parse(previous.updatedAt) > 60000) {
      return updateResult(organizationId, key, config, previous, { mensagem: 'A Focus NFe ainda não encontrou a referência. Você pode reenviar.' });
    }
    throw new Error('A Focus NFe ainda não encontrou a referência. Aguarde um minuto antes de consultar de novo.');
  }
  if (result.status >= 400) throw new Error(result.data.mensagem ?? 'A Focus NFe recusou a consulta.');
  return updateResult(organizationId, key, config, previous, result.data, approvedIssuer);
}

async function cancel(organizationId: string, key: string, config: Credentials, previous: FiscalDocument, reason: string) {
  const justificativa = reason.trim();
  if (justificativa.length < 15 || justificativa.length > 255) throw new Error('Informe uma justificativa de 15 a 255 caracteres.');
  if (previous.status !== 'autorizado') throw new Error('Somente uma NFC-e autorizada pode ser cancelada.');
  const { data } = await call(config, notePath(previous.ref), { method: 'DELETE', body: { justificativa } });
  if (data.status !== 'cancelado') throw new Error(data.mensagem_sefaz ?? data.mensagem ?? 'O cancelamento ainda não foi confirmado. Consulte a NFC-e.');
  return updateResult(organizationId, key, config, previous, data);
}

export async function runFiscalHomologation(organizationId: string, input: { command: 'emit' | 'consult' | 'cancel'; productId?: string; reason?: string }) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  const profile = readFiscalProfile(org.settings);
  const config = fiscalCredentials(org.settings, 'homologacao');
  if (!config.encrypted) throw new Error('Salve e teste o token de homologação primeiro.');
  const key = testKey(organizationId);
  const stamp = fiscalIssuer(profile);
  if (input.command !== 'emit') {
    const { doc, approvedIssuer } = await readTestAttempt(organizationId);
    if (!doc) throw new Error('Emita uma NFC-e de teste primeiro.');
    return input.command === 'consult' ? consult(organizationId, key, config, doc, approvedIssuer) :
      cancel(organizationId, key, config, doc, input.reason ?? '');
  }
  const product = await prisma.product.findFirst({ where: { id: input.productId ?? '', organizationId, active: true }, select: { id: true, name: true, price: true } });
  const fiscal = readProductFiscal(org.settings, product?.id ?? null);
  if (!product || !fiscal) throw new Error('Escolha um produto ativo com tributação cadastrada.');
  const price = toNumber(product.price);
  const body = buildNfcePayload(profile, {
    deliveryType: 'PICKUP', deliveryFee: 0, discount: 0, total: price, paymentMethod: 'CASH',
    items: [{ productId: product.id, productName: 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL', quantity: 1, total: price, fiscal }],
  });
  const attempt = await withOrganizationTransaction(organizationId, async (tx) => {
    const { doc, approvedIssuer } = await readTestAttempt(organizationId, tx);
    if (doc?.status === 'processando') return { doc, approvedIssuer, reused: true };
    const next = pendingDocument(doc && !terminal(doc) ? doc.ref : `df-hom-${randomUUID()}`, 'homologacao');
    await saveDoc(tx, key, next);
    const value = { ref: next.ref, issuer: stamp };
    const attemptKey = `fiscal-test-issuer:${organizationId}`;
    await tx.platformSetting.upsert({ where: { key: attemptKey }, create: { key: attemptKey, value }, update: { value } });
    return { doc: next, approvedIssuer: stamp, reused: false };
  });
  if (attempt.reused) return consult(organizationId, key, config, attempt.doc, attempt.approvedIssuer);
  const { status, data } = await sendDoc(config, attempt.doc, body);
  if (status === 409 || data.codigo === 'referencia_ja_utilizada') return consult(organizationId, key, config, attempt.doc, stamp);
  return updateResult(organizationId, key, config, attempt.doc, data, stamp);
}

async function readTestAttempt(organizationId: string, db: FiscalClient = prisma) {
  const [doc, row] = await Promise.all([
    readDoc(testKey(organizationId), db),
    db.platformSetting.findUnique({ where: { key: `fiscal-test-issuer:${organizationId}` } }),
  ]);
  const value = fiscalSettings(row?.value);
  return { doc, approvedIssuer: doc?.ref === value.ref && typeof value.issuer === 'string' ? value.issuer : undefined };
}

function validatedCpf(value: string | undefined) {
  const digits = (value ?? '').replace(/[.\-\s]/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1+$/.test(digits)) throw new Error('Informe o CPF do destinatário para emitir NFC-e de entrega.');
  const check = (part: number) => {
    const sum = [...digits.slice(0, part)].reduce((total, digit, index) => total + Number(digit) * (part + 1 - index), 0);
    return (sum * 10 % 11) % 10;
  };
  if (check(9) !== Number(digits[9]) || check(10) !== Number(digits[10])) throw new Error('Confira o CPF do destinatário.');
  return digits;
}

export async function emitNfce(organizationId: string, orderId: string, details: { cpf?: string; payment?: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' } = {}): Promise<FiscalDocument> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  const config = readFiscalProvider(org.settings);
  const profile = readFiscalProfile(org.settings);
  if (!(await fiscalEmissionAllowed(organizationId, org.settings))) throw new Error('Conclua a configuração fiscal do estabelecimento antes de emitir.');
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId }, include: { items: true } });
  if (!order) throw new Error('Pedido não encontrado.');
  if (order.status === 'CANCELLED' || order.paymentStatus !== 'PAID') throw new Error('A NFC-e exige um pedido pago e não cancelado.');
  const key = orderKey(orderId, config.environment);
  const previous = await readFiscalDocument(orderId, config.environment);
  if (previous && terminal(previous)) return previous;
  if (previous?.status === 'processando') return consult(organizationId, key, config, previous);
  let destination: Destination | undefined;
  if (order.deliveryType === 'DELIVERY') {
    const cep = await lookupCep(order.deliveryZipCode ?? '');
    if (!cep.ok) throw new Error('Não foi possível confirmar o estado do endereço pelo CEP do pedido.');
    if (cep.state !== profile.uf) throw new Error('A NFC-e é para venda interna. Consulte o contador sobre NF-e para esta entrega interestadual.');
    const street = order.deliveryAddress?.trim() || cep.street;
    const district = order.deliveryDistrict?.trim() || cep.district;
    if (!street || !district || !order.deliveryNumber?.trim()) throw new Error('Complete o logradouro, bairro e número do endereço antes de emitir.');
    destination = {
      zip: cep.zipCode, street, district, number: order.deliveryNumber, city: cep.city, uf: cep.state,
      name: order.customerName, cpf: validatedCpf(details.cpf),
    };
  }
  const body = buildNfcePayload(profile, {
    deliveryType: order.deliveryType, deliveryFee: toNumber(order.deliveryFee), discount: toNumber(order.discount), total: toNumber(order.total),
    paymentMethod: order.paymentMethod === 'ONLINE' ? details.payment ?? 'ONLINE' : order.paymentMethod, destination,
    items: order.items.map((item) => {
      const fiscal = readProductFiscal(org.settings, item.productId);
      if (!fiscal) throw new Error(`Cadastre a tributação deste item antes de emitir: ${item.productName}.`);
      return { productId: item.productId, productName: item.productName, quantity: item.quantity, total: toNumber(item.total), fiscal };
    }),
  });
  const attempt = await withOrganizationTransaction(organizationId, async (tx) => {
    const doc = await readFiscalDocument(orderId, config.environment, tx);
    if (doc && (terminal(doc) || doc.status === 'processando')) return { doc, reused: true };
    const next = pendingDocument(doc?.ref ?? `df-${orderId}`, config.environment, doc);
    await saveDoc(tx, key, next);
    return { doc: next, reused: false };
  });
  if (attempt.reused) return attempt.doc;
  const { status, data } = await sendDoc(config, attempt.doc, body);
  if (status === 409 || data.codigo === 'referencia_ja_utilizada') return consult(organizationId, key, config, attempt.doc);
  return updateResult(organizationId, key, config, attempt.doc, data);
}

async function orderDocument(organizationId: string, orderId: string, environment: FiscalEnvironment) {
  const [order, org] = await Promise.all([
    prisma.order.findFirst({ where: { id: orderId, organizationId }, select: { id: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } }),
  ]);
  if (!order) throw new Error('Pedido não encontrado.');
  const config = fiscalCredentials(org?.settings, environment);
  const previous = await readFiscalDocument(orderId, environment);
  if (!previous) throw new Error('Nenhuma nota neste ambiente para este pedido.');
  return { previous, config, key: orderKey(orderId, environment) };
}
export async function consultNfce(organizationId: string, orderId: string, environment: FiscalEnvironment) {
  const { key, config, previous } = await orderDocument(organizationId, orderId, environment);
  return consult(organizationId, key, config, previous);
}
export async function cancelNfce(organizationId: string, orderId: string, reason: string, environment: FiscalEnvironment) {
  const { key, config, previous } = await orderDocument(organizationId, orderId, environment);
  return cancel(organizationId, key, config, previous, reason);
}
