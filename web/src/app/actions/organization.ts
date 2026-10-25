'use server';
import { isBrUf as validUf, isCityName as validCity } from '@/lib/br-ufs';
import { setStoreOpeningModeAction } from '@/app/actions/store-opening';

import { revalidatePath } from 'next/cache';
import type { StoreStatus } from '@prisma/client';
import { requirePermission, requireOrg, toActionError } from '@/lib/auth/guards';
import * as orgData from '@/lib/data/organization';
import { updateOrganizationSchema } from '@/lib/validations/organization';
import { storeCoordinatesSchema } from '@/lib/validations/store-ops';
import { geocodeAddress, geocodingStatus } from '@/lib/maps/geocoding';
import { getStorage, validateImageUrl } from '@/lib/storage';

/**
 * Minha Loja / Configurações.
 *
 * O endereço público (slug) muda junto com o nome, mas nunca em cima de
 * um slug já ocupado — o sufixo é resolvido no servidor.
 */

export type OrgActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

function str(value: FormDataEntryValue | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  return raw === '' ? undefined : raw;
}

function num(value: FormDataEntryValue | null | undefined): number | undefined {
  const raw = str(value);
  if (raw === undefined) return undefined;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function updateOrganizationAction(formData: FormData): Promise<OrgActionResult<{ slug?: string }>> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');

    const logoUrl = str(formData.get('logoUrl'));

    // Base64 nunca entra no banco. O erro é claro para o lojista entender
    // que precisa subir a imagem para um storage, não colar o arquivo.
    if (logoUrl && logoUrl.startsWith('data:')) {
      return {
        ok: false,
        error:
          'Imagem em base64 não é aceita. Envie o arquivo para um storage e informe a URL pública.',
        field: 'logoUrl',
      };
    }

    const parsed = updateOrganizationSchema.safeParse({
      name: formData.get('name'),
      businessType: str(formData.get('businessType')),
      brandColor: str(formData.get('brandColor')),
      logoUrl: logoUrl ?? '',
      description: str(formData.get('description')),
      phone: str(formData.get('phone')),
      whatsapp: str(formData.get('whatsapp')),
      email: str(formData.get('email')),
      address: str(formData.get('address')),
      addressNumber: str(formData.get('addressNumber')),
      addressComplement: str(formData.get('addressComplement')),
      district: str(formData.get('district')),
      city: str(formData.get('city')),
      state: str(formData.get('state')),
      zipCode: str(formData.get('zipCode')),
      openingHours: str(formData.get('openingHours')),
      minimumOrder: num(formData.get('minimumOrder')),
      deliveryRadius: num(formData.get('deliveryRadius')),
      baseDeliveryFee: num(formData.get('baseDeliveryFee')),
      extraKmFee: num(formData.get('extraKmFee')),
      averageDeliveryTime: num(formData.get('averageDeliveryTime')),
    });

    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    const d = parsed.data;

    const updated = await orgData.updateOrganization(organizationId, {
      name: d.name,
      businessType: d.businessType,
      brandColor: d.brandColor,
      logoUrl: d.logoUrl || null,
      description: d.description || null,
      phone: d.phone || null,
      whatsapp: d.whatsapp || null,
      email: d.email || null,
      address: d.address || null,
      addressNumber: d.addressNumber || null,
      addressComplement: d.addressComplement || null,
      district: d.district || null,
      city: d.city || null,
      state: d.state || null,
      zipCode: d.zipCode || null,
      openingHours: d.openingHours || null,
      minimumOrder: d.minimumOrder,
      deliveryRadius: d.deliveryRadius,
      baseDeliveryFee: d.baseDeliveryFee,
      extraKmFee: d.extraKmFee,
      averageDeliveryTime: d.averageDeliveryTime,
    });

    revalidatePath('/app/minha-loja');
    revalidatePath('/app', 'layout');
    if (updated?.slug) revalidatePath(`/loja/${updated.slug}`);

    return { ok: true, data: { slug: updated?.slug } };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/**
 * Abrir, pausar ou fechar a loja. A vitrine pública reflete na hora.
 * Abrir/fechar é decisão operacional — mas não de entregador nem de
 * cozinha: exige permissão de pedidos.
 */
export async function setStoreStatusAction(storeStatus: StoreStatus): Promise<OrgActionResult> {
  if (!STORE_STATUSES.includes(storeStatus)) return {ok:false,error:'Status de loja inválido.'};
  return setStoreOpeningModeAction(storeStatus === 'OPEN' ? 'MANUAL_OPEN' : 'MANUAL_CLOSED');
}

const STORE_STATUSES: StoreStatus[] = ['OPEN', 'PAUSED', 'CLOSED'];

/**
 * Coordenadas da loja: usadas no cálculo de frete por distância.
 *
 * Aceita nulo nos dois lados — e nulo aqui quer dizer "ainda não temos a
 * posição da loja", não "zero". Gravar 0,0 seria colocar a loja no Golfo da
 * Guiné e mentir para o cálculo: com 0,0 a distância até um endereço em
 * São Paulo daria um número enorme e o cliente seria recusado por um motivo
 * falso. Ou existe coordenada, ou não existe.
 */
export async function setStoreCoordinatesAction(input: {
  latitude: number | null;
  longitude: number | null;
}): Promise<OrgActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');

    const parsed = storeCoordinatesSchema.safeParse({
      latitude: input.latitude,
      longitude: input.longitude,
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? 'Coordenadas inválidas.' };
    }

    // Meia coordenada não é coordenada: se um lado veio e o outro não, é
    // erro de digitação/colagem, não um estado válido.
    const { latitude, longitude } = parsed.data;
    const umSo = (latitude === null) !== (longitude === null);
    if (umSo) {
      return {
        ok: false,
        error: 'Informe latitude e longitude juntas, ou deixe as duas em branco.',
      };
    }

    await orgData.updateOrganization(organizationId, { latitude, longitude });

    revalidatePath('/app/minha-loja');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/**
 * Resolve o endereço da loja em coordenadas.
 *
 * Não inventa nada: sem provedor configurado, ou sem encontrar o endereço,
 * devolve o motivo real e a tela explica. Quem decide o que fazer com a
 * coordenada é o lojista — a ação só devolve o resultado.
 */
export async function geocodeStoreAddressAction(): Promise<
  OrgActionResult<{ latitude: number; longitude: number; displayName: string }>
> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');

    const org = await orgData.getOrganizationById(organizationId);
    if (!org) return { ok: false, error: 'Estabelecimento não encontrado.' };

    const street = (org.address ?? '').trim();
    const number = (org.addressNumber ?? '').trim();
    const city = validCity(org.city) ? org.city!.trim() : '';
    const uf = validUf(org.state) ? org.state!.trim().toUpperCase() : '';
    if (!street || !city || !uf) {
      return {
        ok: false,
        error: !street ? 'Preencha a rua antes de localizar no mapa.' : 'Cidade ou UF inválida no cadastro (ex.: Recife e PE). Corrija e salve antes de localizar.',
        field: !street ? 'address' : 'city',
      };
    }

    // Do mais completo para o mais simples: o OpenStreetMap costuma falhar
    // quando recebe tudo junto (CEP, bairro e complemento na mesma busca).
    const attempts = [
      [`${street}${number ? `, ${number}` : ''}`, city, uf, 'Brasil'],
      [`${street}${number ? `, ${number}` : ''}`, org.district, city, uf, 'Brasil'],
      [street, city, uf, 'Brasil'],
    ].map((parts) => parts.filter((p) => p && String(p).trim()).join(', '));
    let result: Awaited<ReturnType<typeof geocodeAddress>> | null = null;
    for (const query of [...new Set(attempts)]) {
      result = await geocodeAddress(query);
      if (result.ok || result.reason !== 'not_found') break;
    }
    // Último recurso: o CEP (ViaCEP) confirma rua e cidade oficiais.
    if (result && !result.ok && result.reason === 'not_found' && org.zipCode) {
      const { lookupCep } = await import('@/lib/maps/geocoding');
      const cep = await lookupCep(org.zipCode);
      if (cep.ok) result = await geocodeAddress([cep.street, cep.city, cep.state, 'Brasil'].filter(Boolean).join(', '));
    }
    if (!result || !result.ok) {
      return { ok: false, error: result && result.reason === 'not_found' ? 'Endereço não encontrado no mapa. Confira rua, número, cidade e UF, cole o link da localização ou toque no mapa no ponto da loja.' : 'O serviço de mapa não respondeu agora. Tente de novo, cole o link da localização ou toque no mapa.' };
    }

    return {
      ok: true,
      data: { latitude: result.latitude, longitude: result.longitude, displayName: result.displayName },
    };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Estado da geocodificação — a tela mostra o que está configurado. */
export async function getGeocodingStatusAction() {
  await requirePermission('MANAGE_SETTINGS');
  return geocodingStatus();
}

/** Estado do storage de imagens — a tela mostra o que está configurado. */
export async function getStorageStatusAction() {
  const storage = getStorage();
  return {
    name: storage.name,
    isConfigured: storage.isConfigured(),
    hint: storage.isConfigured()
      ? 'Envie a imagem e cole a URL pública.'
      : 'Storage não configurado. Informe a URL pública da imagem hospedada externamente.',
  };
}

export async function validateLogoUrlAction(url: string): Promise<OrgActionResult> {
  try {
    await requirePermission('MANAGE_SETTINGS');
    validateImageUrl(url);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}





/** Coordenadas de um link de mapa (Google, OSM, Apple, Waze). Nunca inventa. */
export async function resolveMapLinkAction(input: { url: string }): Promise<OrgActionResult<{ latitude: number; longitude: number }>> {
  try {
    await requirePermission('MANAGE_SETTINGS');
    const { coordinatesFromMapLink, isShortMapLink } = await import('@/lib/maps/map-link');
    const raw = typeof input?.url === 'string' ? input.url.trim().slice(0, 2000) : '';
    if (!raw) return { ok: false, error: 'Cole o link da localização.' };
    let point = coordinatesFromMapLink(raw);
    // Link curto do Google: segue só redirecionamentos para domínios do Google.
    let current = raw;
    if (!point && isShortMapLink(raw)) {
      for (let hop = 0; hop < 4 && !point; hop++) {
        const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(8000), cache: 'no-store' }).catch(() => null);
        const next = response?.headers.get('location');
        if (!next) break;
        const target = new URL(next, current);
        if (target.protocol !== 'https:' || !/(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$/.test(target.hostname)) break;
        current = target.toString();
        point = coordinatesFromMapLink(current);
      }
    }
    if (!point) return { ok: false, error: 'Este link não traz as coordenadas do ponto. Abra o local no Google Maps, toque em Compartilhar e cole o link, ou marque o ponto direto no mapa.' };
    return { ok: true, data: point };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Endereço aproximado do ponto, para manter o texto da loja coerente com o mapa. */
export async function reverseStoreLocationAction(input: { latitude: number; longitude: number }) {
  try {
    await requirePermission('MANAGE_SETTINGS');
    const { reverseGeocode } = await import('@/lib/maps/geocoding');
    if (!Number.isFinite(input?.latitude) || !Number.isFinite(input?.longitude)) return { ok: false as const, error: 'Ponto inválido.' };
    const found = await reverseGeocode(input.latitude, input.longitude);
    if (!found.ok) return { ok: false as const, error: 'Não foi possível descobrir o endereço deste ponto agora.' };
    return { ok: true as const, data: found };
  } catch (error) {
    return { ok: false as const, ...toActionError(error) };
  }
}

/** CEP → rua, bairro, cidade e UF oficiais (ViaCEP). */
export async function lookupStoreCepAction(input: { cep: string }) {
  try {
    await requirePermission('MANAGE_SETTINGS');
    const { lookupCep } = await import('@/lib/maps/geocoding');
    const found = await lookupCep(String(input?.cep ?? ''));
    if (!found.ok) return { ok: false as const, error: found.reason === 'not_found' ? 'CEP não encontrado.' : found.reason === 'invalid' ? 'CEP inválido: use 8 números.' : 'A consulta de CEP não respondeu agora.' };
    return { ok: true as const, data: found };
  } catch (error) {
    return { ok: false as const, ...toActionError(error) };
  }
}
