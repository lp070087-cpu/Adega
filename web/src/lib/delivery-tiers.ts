/**
 * Faixas de frete por distância — regra única usada na tela (prévia) e no
 * servidor (cálculo que vale). Cada faixa cobre "acima do limite anterior
 * até upToKm". A última faixa é a distância máxima atendida.
 */
export type DeliveryTier = { upToKm: number; fee: number };

export function sortTiers(tiers: DeliveryTier[]): DeliveryTier[] {
  return [...tiers].sort((a, b) => a.upToKm - b.upToKm);
}

/** Problemas que impedem salvar: limites repetidos, zero/negativos, taxa negativa. */
export function tierProblems(tiers: DeliveryTier[]): string[] {
  const problems: string[] = [];
  if (tiers.length > 10) problems.push('Use no máximo 10 faixas.');
  const seen = new Set<number>();
  for (const t of tiers) {
    if (!Number.isFinite(t.upToKm) || t.upToKm <= 0) problems.push('Toda faixa precisa de uma distância maior que zero.');
    else if (t.upToKm > 200) problems.push('A distância máxima por faixa é 200 km.');
    if (!Number.isFinite(t.fee) || t.fee < 0) problems.push('A taxa não pode ser negativa.');
    const key = Math.round(t.upToKm * 100);
    if (seen.has(key)) problems.push(`Duas faixas terminam em ${t.upToKm} km: cada faixa precisa de um limite diferente.`);
    seen.add(key);
  }
  return [...new Set(problems)];
}

export function maxTierKm(tiers: DeliveryTier[]): number | null {
  const sorted = sortTiers(tiers);
  return sorted.length ? sorted[sorted.length - 1].upToKm : null;
}

/** Taxa para uma distância; `outside` quando passa da última faixa. */
export function tierForDistance(tiers: DeliveryTier[], km: number): { tier: DeliveryTier | null; from: number; outside: boolean } {
  const sorted = sortTiers(tiers);
  let from = 0;
  for (const tier of sorted) {
    if (km <= tier.upToKm + 1e-9) return { tier, from, outside: false };
    from = tier.upToKm;
  }
  return { tier: null, from, outside: sorted.length > 0 };
}

export function tierLabel(tiers: DeliveryTier[], index: number): string {
  const sorted = sortTiers(tiers);
  const t = sorted[index];
  const from = index === 0 ? 0 : sorted[index - 1].upToKm;
  const km = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return index === 0 ? `Até ${km(t.upToKm)} km` : `Acima de ${km(from)} até ${km(t.upToKm)} km`;
}
