/**
 * Faixas de frete por distância — regra única usada na tela (prévia) e no
 * servidor (cálculo que vale). Cada faixa cobre "acima de fromKm até upToKm";
 * a primeira começa em 0 km e inclui o zero. A última faixa é a distância
 * máxima atendida.
 *
 * `fromKm` é opcional porque faixas gravadas antes dele guardam só o limite
 * superior: nelas a faixa começa onde a anterior termina (ver resolveTiers).
 */
export type DeliveryTier = { fromKm?: number; upToKm: number; fee: number };

export const MAX_DELIVERY_TIERS = 50;

export function sortTiers<T extends DeliveryTier>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.upToKm - b.upToKm);
}

/** Ordena e preenche `fromKm` das faixas que não o informam. */
export function resolveTiers(tiers: DeliveryTier[]): Array<Required<DeliveryTier>> {
  let previous = 0;
  return sortTiers(tiers).map((tier) => {
    const fromKm = Number.isFinite(tier.fromKm) ? (tier.fromKm as number) : previous;
    previous = tier.upToKm;
    return { fromKm, upToKm: tier.upToKm, fee: tier.fee };
  });
}

const kmText = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const sameKm = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Problemas que impedem salvar: limites inválidos, sobreposição, buraco, taxa negativa. */
export function tierProblems(tiers: DeliveryTier[]): string[] {
  const problems: string[] = [];
  if (tiers.length > MAX_DELIVERY_TIERS) problems.push(`Use no máximo ${MAX_DELIVERY_TIERS} faixas.`);
  const seen = new Set<number>();
  for (const t of tiers) {
    if (!Number.isFinite(t.upToKm) || t.upToKm <= 0) problems.push('Toda faixa precisa de uma distância maior que zero.');
    else if (t.upToKm > 200) problems.push('A distância máxima por faixa é 200 km.');
    if (!Number.isFinite(t.fee) || t.fee < 0) problems.push('A taxa não pode ser negativa.');
    const key = Math.round(t.upToKm * 100);
    if (seen.has(key)) problems.push(`Duas faixas terminam em ${t.upToKm} km: cada faixa precisa de um limite diferente.`);
    seen.add(key);
  }
  if (problems.length) return [...new Set(problems)];

  const resolved = resolveTiers(tiers);
  resolved.forEach((tier, index) => {
    if (tier.fromKm < 0) problems.push('A distância mínima não pode ser negativa.');
    if (tier.fromKm >= tier.upToKm) problems.push(`A faixa de ${kmText(tier.fromKm)} a ${kmText(tier.upToKm)} km precisa terminar depois de começar.`);
    const previous = resolved[index - 1];
    if (!previous) {
      if (tier.fromKm > 0) problems.push(`A primeira faixa precisa começar em 0 km (hoje começa em ${kmText(tier.fromKm)} km).`);
      return;
    }
    if (sameKm(tier.fromKm, previous.upToKm)) return;
    if (tier.fromKm < previous.upToKm) problems.push(`As faixas até ${kmText(previous.upToKm)} km e até ${kmText(tier.upToKm)} km se sobrepõem.`);
    else problems.push(`Falta uma faixa entre ${kmText(previous.upToKm)} e ${kmText(tier.fromKm)} km.`);
  });
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
  return index === 0 ? `Até ${kmText(t.upToKm)} km` : `Acima de ${kmText(from)} até ${kmText(t.upToKm)} km`;
}
