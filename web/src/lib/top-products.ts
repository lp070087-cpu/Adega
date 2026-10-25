/**
 * Agrupamento dos "Produtos mais vendidos": por produto (id ou nome do
 * snapshot), ordenado por valor, com os demais somados em "Outros".
 */
export type SoldLine = { productId: string | null; productName: string; quantity: number; total: number };
export type TopSlice = { key: string; label: string; quantity: number; total: number; share: number };

export function groupTopProducts(lines: SoldLine[], limit = 5): { slices: TopSlice[]; total: number; quantity: number } {
  const byKey = new Map<string, { label: string; quantity: number; total: number }>();
  for (const line of lines) {
    const key = line.productId ?? `name:${line.productName.trim().toLowerCase()}`;
    const current = byKey.get(key) ?? { label: line.productName, quantity: 0, total: 0 };
    current.quantity += line.quantity;
    current.total = Math.round((current.total + line.total) * 100) / 100;
    byKey.set(key, current);
  }
  const ranked = [...byKey.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total || b.quantity - a.quantity);
  const total = Math.round(ranked.reduce((s, r) => s + r.total, 0) * 100) / 100;
  const quantity = ranked.reduce((s, r) => s + r.quantity, 0);
  const head = ranked.slice(0, ranked.length > limit + 1 ? limit : limit + 1);
  const rest = ranked.slice(head.length);
  const slices = head.map((r) => ({ ...r, share: total > 0 ? r.total / total : 0 }));
  if (rest.length) {
    const othersTotal = Math.round(rest.reduce((s, r) => s + r.total, 0) * 100) / 100;
    slices.push({ key: 'outros', label: `Outros (${rest.length})`, quantity: rest.reduce((s, r) => s + r.quantity, 0), total: othersTotal, share: total > 0 ? othersTotal / total : 0 });
  }
  return { slices, total, quantity };
}

/** Início do dia/mês no fuso da loja, como instante UTC. */
export function zonedStart(now: Date, timeZone: string, unit: 'day' | 'month'): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const date = `${get('year')}-${get('month')}-${unit === 'month' ? '01' : get('day')}`;
  return zonedMidnight(date, timeZone);
}

/** Meia-noite de uma data AAAA-MM-DD no fuso indicado. */
export function zonedMidnight(date: string, timeZone: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  const offsetParts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(guess);
  const name = offsetParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  const minutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  return new Date(guess.getTime() - minutes * 60_000);
}
