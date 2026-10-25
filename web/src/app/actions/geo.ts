'use server';

import { mapRequestAllowed } from '@/lib/maps/throttle';

type Fields = { street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; zipCode: string | null };
export type PlaceResult =
  | { ok: true; latitude: number; longitude: number; label: string; fields: Fields }
  | { ok: false; error: string };

const BUSY = 'Muitas buscas seguidas. Aguarde um minuto ou mova o mapa até o local.';

async function storeFor(slug: string) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  const { getPublicStoreBySlug } = await import('@/lib/data/organization');
  return getPublicStoreBySlug(slug);
}

/** Busca por endereço ou CEP. Só posiciona o mapa: quem confirma é o cliente. */
export async function searchPlaceAction(input: { slug: string; query: string }): Promise<PlaceResult> {
  try {
    const query = typeof input?.query === 'string' ? input.query.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
    if (query.length < 3) return { ok: false, error: 'Digite o endereço com rua e número, ou o CEP.' };
    const store = await storeFor(input?.slug);
    if (!store) return { ok: false, error: 'Estabelecimento não encontrado.' };
    if (!(await mapRequestAllowed('search', 10))) return { ok: false, error: BUSY };
    const { geocodeAddress, lookupCep } = await import('@/lib/maps/geocoding');
    let fields: Fields = { street: null, number: null, district: null, city: null, state: null, zipCode: null };
    let text = query;
    const digits = query.replace(/\D/g, '');
    if (/^\d{5}-?\d{3}$/.test(query.trim()) && digits.length === 8) {
      const cep = await lookupCep(digits);
      if (!cep.ok) return { ok: false, error: cep.reason === 'not_found' ? 'CEP não encontrado. Confira os números ou busque pelo endereço.' : cep.reason === 'invalid' ? 'CEP inválido.' : 'A consulta de CEP não respondeu agora. Busque pelo endereço.' };
      fields = { street: cep.street || null, number: null, district: cep.district || null, city: cep.city, state: cep.state || null, zipCode: cep.zipCode };
      text = [cep.street, cep.district, cep.city, cep.state].filter(Boolean).join(', ');
    }
    const full = [text, store.city && !text.toLowerCase().includes(store.city.toLowerCase()) ? store.city : null, store.state, 'Brasil'].filter(Boolean).join(', ');
    const found = await geocodeAddress(full);
    if (!found.ok) return { ok: false, error: found.reason === 'not_found' ? 'Endereço não encontrado no mapa. Mova o mapa até o local da entrega.' : 'O mapa não respondeu agora. Tente de novo ou mova o mapa até o local.' };
    return { ok: true, latitude: found.latitude, longitude: found.longitude, label: found.displayName, fields };
  } catch {
    return { ok: false, error: 'O mapa não respondeu agora. Tente de novo.' };
  }
}

/** Endereço aproximado do ponto sob o pino (apenas informativo). */
export async function reversePlaceAction(input: { slug: string; latitude: number; longitude: number }): Promise<PlaceResult> {
  try {
    const { latitude, longitude } = input ?? ({} as typeof input);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { ok: false, error: 'Ponto inválido.' };
    const store = await storeFor(input.slug);
    if (!store) return { ok: false, error: 'Estabelecimento não encontrado.' };
    if (!(await mapRequestAllowed('reverse', 30))) return { ok: false, error: BUSY };
    const { reverseGeocode } = await import('@/lib/maps/geocoding');
    const found = await reverseGeocode(latitude, longitude);
    if (!found.ok) return { ok: false, error: found.reason === 'not_found' ? 'Sem endereço conhecido neste ponto.' : 'Endereço aproximado indisponível agora.' };
    return { ok: true, latitude, longitude, label: found.label, fields: { street: found.street, number: found.number, district: found.district, city: found.city, state: found.state, zipCode: found.zipCode } };
  } catch {
    return { ok: false, error: 'Endereço aproximado indisponível agora.' };
  }
}

export type DeliveryQuote =
  | { ok: true; fee: number; distanceKm: number | null; distanceKind: 'street' | 'straight' | null; outside: boolean; estimated: boolean }
  | { ok: false; error: string };

/**
 * Prévia do frete com a MESMA regra do pedido (faixas, bairro ou fixo;
 * distância pelas ruas quando há roteamento). O valor que vale continua
 * sendo recalculado no servidor quando o pedido é criado.
 */
export async function quoteDeliveryAction(input: { slug: string; latitude?: number | null; longitude?: number | null; district?: string | null }): Promise<DeliveryQuote> {
  try {
    const store = await storeFor(input?.slug);
    if (!store) return { ok: false, error: 'Estabelecimento não encontrado.' };
    if (!(await mapRequestAllowed('reverse', 30))) return { ok: false, error: BUSY };
    const { prisma } = await import('@/lib/db');
    const org = await prisma.organization.findUnique({ where: { slug: input.slug }, select: { id: true, baseDeliveryFee: true, extraKmFee: true, deliveryRadius: true, latitude: true, longitude: true, deliveryFeeMode: true, settings: true } });
    if (!org) return { ok: false, error: 'Estabelecimento não encontrado.' };
    const { explainDeliveryFee, isOutsideDeliveryArea, normalizeTiers } = await import('@/lib/data/delivery-fee');
    const { getDeliveryZonesForFee } = await import('@/lib/data/store-ops');
    const settings = {
      baseDeliveryFee: Number(org.baseDeliveryFee), extraKmFee: Number(org.extraKmFee), deliveryRadius: org.deliveryRadius,
      latitude: org.latitude, longitude: org.longitude, feeMode: org.deliveryFeeMode,
      tiers: normalizeTiers((org.settings as Record<string, unknown> | null)?.deliveryTiers),
      zones: await getDeliveryZonesForFee(org.id),
    };
    const lat = Number.isFinite(input.latitude) ? Number(input.latitude) : null;
    const lng = Number.isFinite(input.longitude) ? Number(input.longitude) : null;
    let roadKm: number | null = null;
    if (lat !== null && lng !== null && org.latitude != null && org.longitude != null) {
      const { routingConfigured, streetRoute } = await import('@/lib/maps/routing');
      if (routingConfigured()) {
        const route = await streetRoute({ latitude: org.latitude, longitude: org.longitude }, { latitude: lat, longitude: lng }).catch(() => null);
        if (route?.available) roadKm = route.distanceMeters / 1000;
      }
    }
    const destination = { latitude: lat, longitude: lng, district: typeof input.district === 'string' ? input.district.slice(0, 120) : null, roadKm };
    const fee = explainDeliveryFee(settings, destination);
    const area = isOutsideDeliveryArea(settings, destination);
    return { ok: true, fee: fee.fee, distanceKm: fee.distanceKm, distanceKind: fee.distanceKm === null ? null : fee.distanceKind ?? 'straight', outside: area.outside, estimated: fee.estimated };
  } catch {
    return { ok: false, error: 'Não foi possível calcular a taxa agora.' };
  }
}
