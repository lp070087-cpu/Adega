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
