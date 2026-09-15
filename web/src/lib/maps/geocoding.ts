import 'server-only';

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
 * POR QUE ISTO FICA NO SERVIDOR: o Nominatim é uma API pública que aceita
 * CORS, mas a chave do Google não pode ir para o navegador — e a decisão
 * de "está configurado?" muda o que a tela mostra. A regra é a mesma de
 * storage: sem provedor, falha clara e honesta, nunca dado inventado.
 *
 * Nota: geocodificação é para facilitar o cadastro (pré-preencher a
 * coordenada da loja e do endereço). O cálculo do frete NÃO depende dela:
 * `delivery-fee.ts` degrada para a taxa base quando não há coordenada.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type GeocodeResult =
  | { ok: true; latitude: number; longitude: number; displayName: string }
  | { ok: false; reason: 'not_configured' | 'not_found' | 'provider_error'; message: string };

type Provider = 'nominatim' | 'google';

function configuredProvider(): Provider | null {
  const raw = process.env.GEOCODING_PROVIDER?.trim().toLowerCase();
  if (raw === 'nominatim') return 'nominatim';
  if (raw === 'google') return 'google';
  return null;
}

/** Devolve o que está configurado — a tela usa para decidir o que mostrar. */
export function geocodingStatus(): {
  provider: Provider | null;
  configured: boolean;
  hint: string;
} {
  const provider = configuredProvider();
  if (!provider) {
    return {
      provider: null,
      configured: false,
      hint: 'Nenhum provedor de geocodificação configurado (GEOCODING_PROVIDER).',
    };
  }
  if (provider === 'google' && !process.env.GEOCODING_API_KEY) {
    return {
      provider: 'google',
      configured: false,
      hint: 'Provedor google exige GEOCODING_API_KEY.',
    };
  }
  return { provider, configured: true, hint: `Provedor ${provider} pronto.` };
}

function notConfigured(): GeocodeResult {
  return {
    ok: false,
    reason: 'not_configured',
    message:
      'Geocodificação não configurada. Defina GEOCODING_PROVIDER (nominatim ou google) para transformar endereço em coordenadas.',
  };
}

async function viaNominatim(address: string): Promise<GeocodeResult> {
  // OSM Nominatim pede um User-Agent identificável; sem ele a API recusa
  // a requisição. Uso pontual (cadastro), nunca em massa — a política de
  // uso do Nominatim proíbe tráfego pesado, e por isso ele é a opção sem
  // chave, não a padrão de produção.
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(address);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'delivery-platform/0.1 (geocoding de cadastro)' },
      // Cache curto: o mesmo endereço não precisa ser resolvido a cada clique.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: 'provider_error',
        message: `O provedor de geocodificação respondeu com erro (${res.status}).`,
      };
    }
    const data = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const first = data[0];
    if (!first || first.lat === undefined || first.lon === undefined) {
      return { ok: false, reason: 'not_found', message: 'Endereço não encontrado.' };
    }
    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, reason: 'not_found', message: 'Endereço não encontrado.' };
    }
    return { ok: true, latitude, longitude, displayName: first.display_name ?? address };
  } catch {
    return {
      ok: false,
      reason: 'provider_error',
      message: 'Não foi possível consultar o provedor de geocodificação.',
    };
  }
}

async function viaGoogle(address: string): Promise<GeocodeResult> {
  const key = process.env.GEOCODING_API_KEY?.trim();
  if (!key) return notConfigured();

  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?address=' +
    encodeURIComponent(address) +
    '&key=' +
    encodeURIComponent(key);

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) {
      return {
        ok: false,
        reason: 'provider_error',
        message: `O provedor de geocodificação respondeu com erro (${res.status}).`,
      };
    }
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{
        geometry?: { location?: { lat?: number; lng?: number } };
        formatted_address?: string;
      }>;
    };
    if (data.status !== 'OK' || !data.results?.length) {
      return { ok: false, reason: 'not_found', message: 'Endereço não encontrado.' };
    }
    const location = data.results[0].geometry?.location;
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return { ok: false, reason: 'not_found', message: 'Endereço não encontrado.' };
    }
    return {
      ok: true,
      latitude: location.lat,
      longitude: location.lng,
      displayName: data.results[0].formatted_address ?? address,
    };
  } catch {
    return {
      ok: false,
      reason: 'provider_error',
      message: 'Não foi possível consultar o provedor de geocodificação.',
    };
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const trimmed = address.trim();
  if (!trimmed) {
    return { ok: false, reason: 'not_found', message: 'Informe um endereço.' };
  }

  const provider = configuredProvider();
  if (!provider) return notConfigured();
  if (provider === 'google') return viaGoogle(trimmed);
  return viaNominatim(trimmed);
}
