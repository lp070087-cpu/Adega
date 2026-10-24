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
  if (raw === 'google') return 'google';
  if (raw === 'none') return null;
  // Padrão: Nominatim (OpenStreetMap), sem chave. O uso é pontual — só
  // quando o lojista toca em "Localizar pelo endereço" — dentro da política
  // de uso do serviço.
  return 'nominatim';
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
    encodeURIComponent(address) + '&countrycodes=br';

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': `DelFlash/1.0 (${process.env.APP_PUBLIC_URL ?? 'https://adega-nine.vercel.app'})`, 'Accept-Language': 'pt-BR' },
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

// ── Endereço aproximado de um ponto (seletor com pino central) ─────────

export type ReverseResult =
  | { ok: true; label: string; street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; zipCode: string | null }
  | { ok: false; reason: 'not_configured' | 'not_found' | 'provider_error' };

const UF_BY_NAME: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapá: 'AP', amazonas: 'AM', bahia: 'BA', ceará: 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES', goiás: 'GO', maranhão: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', pará: 'PA', paraíba: 'PB', paraná: 'PR', pernambuco: 'PE', piauí: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondônia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'são paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

export async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseResult> {
  const provider = configuredProvider();
  if (!provider) return { ok: false, reason: 'not_configured' };
  // Google reverso só com chave; sem ela, o Nominatim atende igual.
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude.toFixed(6)}&lon=${longitude.toFixed(6)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': `DelFlash/1.0 (${process.env.APP_PUBLIC_URL ?? 'https://adega-nine.vercel.app'})`, 'Accept-Language': 'pt-BR' },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return { ok: false, reason: 'provider_error' };
    const data = (await res.json()) as { display_name?: string; error?: string; address?: Record<string, string> };
    if (!data || data.error || !data.address) return { ok: false, reason: 'not_found' };
    const a = data.address;
    const street = a.road ?? a.pedestrian ?? a.footway ?? a.residential ?? null;
    const district = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? null;
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? null;
    const iso = a['ISO3166-2-lvl4'];
    const state = iso?.startsWith('BR-') ? iso.slice(3) : a.state ? UF_BY_NAME[a.state.toLowerCase()] ?? null : null;
    const zipCode = a.postcode ? a.postcode.replace(/\D/g, '').slice(0, 8) || null : null;
    const label = [street && `${street}${a.house_number ? `, ${a.house_number}` : ''}`, district, city && state ? `${city} - ${state}` : city].filter(Boolean).join(' · ') || data.display_name || 'Local selecionado';
    return { ok: true, label, street, number: a.house_number ?? null, district, city, state, zipCode };
  } catch {
    return { ok: false, reason: 'provider_error' };
  }
}

// ── CEP (ViaCEP, gratuito e sem chave) ─────────────────────────────────

export type CepResult =
  | { ok: true; street: string; district: string; city: string; state: string; zipCode: string }
  | { ok: false; reason: 'invalid' | 'not_found' | 'provider_error' };

export async function lookupCep(raw: string): Promise<CepResult> {
  const cep = raw.replace(/\D/g, '');
  if (!/^\d{8}$/.test(cep)) return { ok: false, reason: 'invalid' };
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { next: { revalidate: 60 * 60 * 24 * 7 } });
    if (!res.ok) return { ok: false, reason: res.status === 400 ? 'invalid' : 'provider_error' };
    const data = (await res.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (data.erro || !data.localidade) return { ok: false, reason: 'not_found' };
    return { ok: true, street: data.logradouro ?? '', district: data.bairro ?? '', city: data.localidade, state: data.uf ?? '', zipCode: cep };
  } catch {
    return { ok: false, reason: 'provider_error' };
  }
}
