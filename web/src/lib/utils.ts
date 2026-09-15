import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** R$ 1.234,56 â€” mesmo formato do sistema anterior. */
export function formatBRL(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(n) ? n : 0);
}

/** 1.234 â€” sem casas decimais (contadores). */
export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR').format(value ?? 0);
}

/** 12/09 Ã s 14h30 */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return 'â€”';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 'â€”';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** 14h30 â€” usado na fila do entregador e no kanban. */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return 'â€”';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 'â€”';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** "hÃ¡ 5 min", "hÃ¡ 2 h" â€” tempo relativo curto para a operaÃ§Ã£o. */
export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return 'â€”';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `hÃ¡ ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hÃ¡ ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hÃ¡ ${days} d`;
}

/** Minutos entre duas datas â€” base dos indicadores de tempo operacional. */
export function minutesBetween(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined = new Date(),
): number | null {
  if (!start) return null;
  const a = typeof start === 'string' ? new Date(start) : start;
  const b = typeof end === 'string' ? new Date(end) : end;
  if (!b) return null;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

/**
 * Slug de URL. Usado em Organization.slug (rota /loja/[slug]) e em
 * Category.slug / Product.slug.
 */
export function slugify(input: string): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

/** Telefone sÃ³ com dÃ­gitos â€” chave de deduplicaÃ§Ã£o de Customer. */
export function onlyDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** (11) 98888-0001 */
export function formatPhone(value: string | null | undefined): string {
  const d = onlyDigits(value);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value ?? 'â€”';
}

/** InÃ­cio do dia no fuso local do servidor. */
export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Chave estÃ¡vel para agrupar por dia (YYYY-MM-DD). */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** MÃ©dia segura: nunca divide por zero. */
export function safeAverage(total: number, count: number): number {
  if (!count) return 0;
  return total / count;
}

