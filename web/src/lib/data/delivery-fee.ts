import 'server-only';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÁLCULO DE FRETE — fonte única (Fase 3)
 * -----------------------------------------------------------------------
 * Roda SEMPRE no servidor. O valor que o navegador mostra é apenas uma
 * prévia; o que vale é o que sai daqui. Nenhum total, frete, distância ou
 * coordenada vindo do navegador é aceito como verdade.
 *
 * Um único ponto de cálculo resolve os três modos de taxa que a Fase 3
 * pede. Não existem três sistemas de frete: existe UM `explainDeliveryFee`
 * que muda de regra conforme `feeMode`. É isso que impede a loja de ter
 * uma taxa na vitrine e outra no pedido.
 *
 * Modos (Organization.deliveryFeeMode, texto e não enum):
 *   FIXED            → taxa base + (km além do raio incluso) × taxa por km
 *   BY_NEIGHBORHOOD  → taxa do bairro (DeliveryZone), casado pelo NOME
 *   BY_DISTANCE_BAND → primeira faixa cujo limite >= distância (settings.deliveryTiers)
 *
 * Distância: Haversine sobre coordenadas conhecidas. Sem coordenada, o
 * cálculo degrada com honestidade — cobra a base e sinaliza `estimated`
 * em vez de inventar uma distância. Geocodificação também nunca inventa
 * coordenada: ver `geocodeAddress` no fim do arquivo.
 * ═══════════════════════════════════════════════════════════════════════
 */

const EARTH_RADIUS_KM = 6371;

export type DeliveryFeeMode = 'FIXED' | 'BY_NEIGHBORHOOD' | 'BY_DISTANCE_BAND';

export type DeliveryTier = { upToKm: number; fee: number };

/** Bairro para o modo BY_NEIGHBORHOOD. Só nome e taxa entram no cálculo. */
export type DeliveryZoneView = {
  name: string;
  fee: number;
  active: boolean;
};

export type DeliveryFeeSettings = {
  baseDeliveryFee: number;
  extraKmFee: number;
  deliveryRadius: number;
  latitude?: number | null;
  longitude?: number | null;
  feeMode?: DeliveryFeeMode | string | null;
  /** Faixas por distância (modo BY_DISTANCE_BAND). */
  tiers?: DeliveryTier[];
  /** Bairros com taxa (modo BY_NEIGHBORHOOD). */
  zones?: DeliveryZoneView[];
};

export type DeliveryDestination = {
  latitude?: number | null;
  longitude?: number | null;
  /** Bairro informado pelo cliente — usado no modo por bairro. */
  district?: string | null;
};

export type DeliveryFeeResult = {
  fee: number;
  distanceKm: number | null;
  /** true quando não foi possível medir a distância. */
  estimated: boolean;
  reason?: string;
};

/** Distância em km entre dois pontos (Haversine). */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundKm(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Aceita o texto do banco e cai para FIXED quando inválido. */
function normalizeMode(mode: DeliveryFeeSettings['feeMode']): DeliveryFeeMode {
  if (mode === 'BY_NEIGHBORHOOD' || mode === 'BY_DISTANCE_BAND') return mode;
  return 'FIXED';
}

/**
 * Faixas de frete lidas sem confiar no formato.
 *
 * É A MESMA função usada por store-ops.ts (reusada, não duplicada): uma
 * faixa com texto no lugar do número quebraria o cálculo, então o formato
 * é reconferido e o que não serve é descartado. Ordenada por limite
 * crescente — a ordem importa para o modo por faixa.
 */
export function normalizeTiers(value: unknown): DeliveryTier[] {
  if (!Array.isArray(value)) return [];
  const tiers: DeliveryTier[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const t = entry as Record<string, unknown>;
    const km = typeof t.upToKm === 'number' ? t.upToKm : Number(t.upToKm);
    const fee = typeof t.fee === 'number' ? t.fee : Number(t.fee);
    if (!Number.isFinite(km) || !Number.isFinite(fee) || km <= 0 || fee < 0) continue;
    tiers.push({ upToKm: km, fee: Math.round(fee * 100) / 100 });
  }
  return tiers.sort((a, b) => a.upToKm - b.upToKm);
}

/**
 * Casa o bairro informado com uma zona ativa, por NOME.
 *
 * Comparação sem diferenciar maiúsculas e sem espaços nas pontas — o
 * cliente digita "Centro" e a loja cadastrou "Centro". Não usamos
 * coordenada para casar bairro: o bairro é o que o cliente informa, não
 * um raio estimado (a coordenada é opcional na DeliveryZone e serve para
 * desenhar o mapa, nunca para o cálculo).
 */
function findZone(
  zones: DeliveryZoneView[] | undefined,
  district: DeliveryDestination['district'],
): DeliveryZoneView | null {
  if (!district || !Array.isArray(zones)) return null;
  const needle = district.trim().toLowerCase();
  if (!needle) return null;
  return (
    zones.find(
      (z) => z.active && z.name.trim().toLowerCase() === needle,
    ) ?? null
  );
}

export function calculateDeliveryFee(
  settings: DeliveryFeeSettings,
  destination: DeliveryDestination,
): number {
  return explainDeliveryFee(settings, destination).fee;
}

export function explainDeliveryFee(
  settings: DeliveryFeeSettings,
  destination: DeliveryDestination,
): DeliveryFeeResult {
  const base = Number(settings.baseDeliveryFee) || 0;
  const mode = normalizeMode(settings.feeMode);

  const hasOrigin =
    typeof settings.latitude === 'number' && typeof settings.longitude === 'number';
  const hasDestination =
    typeof destination.latitude === 'number' && typeof destination.longitude === 'number';

  const rawDistance = hasOrigin && hasDestination
    ? haversineKm(settings.latitude!, settings.longitude!, destination.latitude!, destination.longitude!)
    : null;
  const distanceKm = rawDistance === null ? null : roundKm(rawDistance);

  // ── POR BAIRRO ─────────────────────────────────────────────────────
  // A taxa vem da DeliveryZone, não da distância. Se o bairro não estiver
  // cadastrado, cai na base e avisa — decidir cobrar a mais sem regra
  // seria inventar preço.
  if (mode === 'BY_NEIGHBORHOOD') {
    const zone = findZone(settings.zones, destination.district);
    if (zone) {
      return {
        fee: round2(zone.fee),
        distanceKm,
        estimated: rawDistance === null,
        reason: `Taxa do bairro ${zone.name}.`,
      };
    }
    return {
      fee: round2(base),
      distanceKm,
      estimated: true,
      reason: 'Bairro sem taxa cadastrada — cobrada a taxa base.',
    };
  }

  // ── POR FAIXA DE DISTÂNCIA ─────────────────────────────────────────
  // Primeira faixa cujo limite alcança a distância. Além da última faixa,
  // vale a última (banda "daqui para frente"). Sem faixa configurada,
  // cai na base — nunca inventa faixa.
  if (mode === 'BY_DISTANCE_BAND') {
    const tiers = normalizeTiers(settings.tiers);
    if (tiers.length > 0 && rawDistance !== null) {
      const tier = tiers.find((t) => t.upToKm >= rawDistance) ?? tiers[tiers.length - 1];
      return {
        fee: round2(tier.fee),
        distanceKm,
        estimated: false,
        reason: `Faixa de até ${tier.upToKm} km.`,
      };
    }
    return {
      fee: round2(base),
      distanceKm,
      estimated: rawDistance === null,
      reason: 'Faixas não configuradas — cobrada a taxa base.',
    };
  }

  // ── FIXO (padrão) ──────────────────────────────────────────────────
  // Sem coordenadas não há como medir: cobra a base e sinaliza.
  if (rawDistance === null) {
    return {
      fee: round2(base),
      distanceKm: null,
      estimated: true,
      reason: hasOrigin
        ? 'Endereço sem coordenadas — cobrada apenas a taxa base.'
        : 'A loja ainda não cadastrou a localização — cobrada apenas a taxa base.',
    };
  }

  // O raio contratado já está embutido na taxa base; só o excedente
  // é cobrado por km.
  const extraKm = Math.max(0, rawDistance - (settings.deliveryRadius || 0));
  const fee = base + extraKm * (Number(settings.extraKmFee) || 0);

  return {
    fee: round2(fee),
    distanceKm,
    estimated: false,
  };
}

/**
 * Fora da área de entrega? Usado para BLOQUEAR o checkout.
 *
 * O que define "área" depende do modo:
 *   • FIXO / POR FAIXA  → o raio (deliveryRadius).
 *   • POR BAIRRO        → estar listado num bairro ativo E dentro do raio
 *                         (quando há coordenada para medir).
 *
 * Sem coordenada no modo por bairro, a lista de bairros ainda decide: um
 * distrito fora dela é recusado. Sem coordenada nos outros modos, não dá
 * para afirmar que está fora — devolve `outside: false` (não se recusa o
 * que não se pode medir; o frete saiu estimado e o lojista ajusta).
 */
export function isOutsideDeliveryArea(
  settings: DeliveryFeeSettings,
  destination: DeliveryDestination,
): { outside: boolean; distanceKm: number | null; reason?: string } {
  const mode = normalizeMode(settings.feeMode);

  const hasOrigin =
    typeof settings.latitude === 'number' && typeof settings.longitude === 'number';
  const hasDestination =
    typeof destination.latitude === 'number' && typeof destination.longitude === 'number';

  const rawDistance = hasOrigin && hasDestination
    ? haversineKm(settings.latitude!, settings.longitude!, destination.latitude!, destination.longitude!)
    : null;
  const distanceKm = rawDistance === null ? null : roundKm(rawDistance);

  if (mode === 'BY_NEIGHBORHOOD') {
    const zone = findZone(settings.zones, destination.district);
    const zonesExist = Array.isArray(settings.zones) && settings.zones.length > 0;
    const outsideByZone = zonesExist && !zone;
    const outsideByRadius =
      rawDistance !== null && rawDistance > (settings.deliveryRadius || 0);

    if (outsideByRadius) {
      return { outside: true, distanceKm, reason: 'Fora do raio de entrega.' };
    }
    if (outsideByZone) {
      return { outside: true, distanceKm, reason: 'Bairro fora da área de entrega.' };
    }
    return { outside: false, distanceKm };
  }

  if (rawDistance === null) return { outside: false, distanceKm: null };

  return {
    outside: rawDistance > (settings.deliveryRadius || 0),
    distanceKm,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * GEOCODIFICAÇÃO — nunca inventa coordenada
 * -----------------------------------------------------------------------
 * Um endereço só vira latitude/longitude quando um provedor REAL está
 * configurado. Sem provedor, devolve `not_configured` e a tela explica —
 * em vez de desenhar um ponto num lugar que não existe.
 *
 * Provedores suportados (env):
 *   GEOCODING_PROVIDER=nominatim → OpenStreetMap (sem chave; uso pontual)
 *   GEOCODING_PROVIDER=google     → exige GEOCODING_API_KEY
 *
 * A implementação mora em src/lib/maps/geocoding.ts; aqui fica o contrato
 * de importação reexportado para quem só precisa do "não invente".
 * ═══════════════════════════════════════════════════════════════════════
 */

export type GeocodeResult =
  | { ok: true; latitude: number; longitude: number; displayName: string }
  | { ok: false; reason: 'not_configured' | 'not_found' | 'provider_error'; message: string };

/**
 * Geo­codi­fi­ca um endereço. Reexportado do módulo de mapas — mantido aqui
 * como ponto único para quem calcula frete não precisar saber de mapa.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const { geocodeAddress: run } = await import('@/lib/maps/geocoding');
  return run(address);
}
