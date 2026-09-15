'use server';

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
  try {
    const { organizationId } = await requirePermission('MANAGE_ORDERS');
    if (!STORE_STATUSES.includes(storeStatus)) {
      return { ok: false, error: 'Status de loja inválido.' };
    }

    await orgData.setStoreStatus(organizationId, storeStatus);
    revalidatePath('/app', 'layout');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
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

    // Endereço montado com o que existe. Sem rua e cidade não há o que
    // geocodificar — pedir antes evita gastar chamada do provedor à toa.
    const parts = [
      [org.address, org.addressNumber].filter(Boolean).join(', '),
      org.district,
      [org.city, org.state].filter(Boolean).join(' - '),
      org.zipCode,
      'Brasil',
    ].filter((p) => p && String(p).trim() !== '');

    if (!org.address || parts.length < 3) {
      return {
        ok: false,
        error: 'Preencha ao menos rua, cidade e estado antes de localizar no mapa.',
        field: 'address',
      };
    }

    const result = await geocodeAddress(parts.join(', '));

    if (!result.ok) {
      // A mensagem do provedor já é honesta (not_configured / not_found /
      // provider_error); repassar é melhor do que resumir para "deu erro".
      return { ok: false, error: result.message };
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


