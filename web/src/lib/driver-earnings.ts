/**
 * Remuneração do entregador — regra pura, sem banco, usada no servidor e na tela.
 *
 * Três valores que NÃO se misturam: total do pedido (faturamento da loja), taxa
 * cobrada do cliente e ganho do entregador. O ganho sai só da regra configurada
 * pela loja; sem regra não existe valor estimado.
 */
export type EarningsPeriod = 'today' | 'week' | 'month';

export type DriverPayRule = {
  /** FIXED: valor por entrega. FEE_PERCENT: percentual da taxa cobrada do cliente. */
  mode: 'FIXED' | 'FEE_PERCENT';
  amountCents: number;
  percent: number;
  updatedAt: string;
  updatedBy: string;
};

export const MAX_PAY_CENTS = 1_000_000;

export function readDriverPayRule(settings: unknown): DriverPayRule | null {
  const rule = (settings as { driverPayRule?: Partial<DriverPayRule> } | null)?.driverPayRule;
  if (!rule || typeof rule.updatedAt !== 'string' || typeof rule.updatedBy !== 'string') return null;
  const mode = rule.mode === 'FEE_PERCENT' ? 'FEE_PERCENT' : 'FIXED';
  const amountCents = rule.amountCents ?? 0;
  const percent = rule.percent ?? 0;
  if (mode === 'FIXED' && (!Number.isSafeInteger(amountCents) || amountCents < 0 || amountCents > MAX_PAY_CENTS)) return null;
  if (mode === 'FEE_PERCENT' && (!Number.isFinite(percent) || percent < 0 || percent > 100)) return null;
  return { mode, amountCents, percent, updatedAt: rule.updatedAt, updatedBy: rule.updatedBy };
}

/** Ganho de uma entrega, em centavos. Nunca recebe o total do pedido. */
export function driverPayCents(rule: DriverPayRule, deliveryFeeCents: number): number {
  return rule.mode === 'FIXED' ? rule.amountCents : Math.round((deliveryFeeCents * rule.percent) / 100);
}

export function earningsTimezone(settings: unknown) {
  const zone = (settings as { timeZone?: string } | null)?.timeZone ?? 'America/Sao_Paulo';
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format();
    return zone;
  } catch {
    return 'America/Sao_Paulo';
  }
}

/** Diferença, em ms, entre o relógio do fuso e o UTC naquele instante. */
function zoneOffsetMs(instant: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Início do período no fuso da loja. A semana começa na segunda-feira. */
export function earningsPeriodStart(period: EarningsPeriod, now = new Date(), zone = 'America/Sao_Paulo'): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, zone));
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  if (period === 'month') day.setUTCDate(1);
  if (period === 'week') day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return new Date(day.getTime() - zoneOffsetMs(day, zone));
}

/** Aceita "5", "5,00" e "1.234,50". Devolve centavos ou null. */
export function parseMoneyCents(raw: string): number | null {
  const text = raw.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.replaceAll('.', '').split(',');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
