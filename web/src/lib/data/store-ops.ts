import 'server-only';
import { prisma } from '@/lib/db';
import { normalizeSchedule, type WeekdaySchedule } from '@/lib/schedule';
import { normalizeTiers } from '@/lib/data/delivery-fee';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * OPERAÇÃO DA LOJA — o que se edita DEPOIS do onboarding (Fase 4)
 * -----------------------------------------------------------------------
 * Agenda, faixas de frete, identidade visual e banners. Nada aqui cria
 * tabela nova: a agenda e as faixas vivem em `Organization.settings`
 * (Json), que já existia; identidade são colunas que já existiam; banner
 * é o model `StoreBanner`, que já existia e já alimenta a vitrine.
 *
 * ── settings: por que ler-e-mesclar, e não substituir ──
 * `settings` guarda VÁRIAS coisas (estilo do restaurante, responsável,
 * agenda, faixas, versão do onboarding). Gravar o objeto inteiro a partir
 * do que a tela mandou apagaria as chaves que aquela tela não conhece —
 * editar o horário zeraria o estilo do restaurante. Por isso toda escrita
 * lê o valor atual, mescla só a sua chave e grava de volta.
 *
 * ── Multi-tenant ──
 * Toda função recebe `organizationId` como PRIMEIRO parâmetro e o usa em
 * todo `where`. Nas escritas por id de banner o filtro é `{ id, organizationId }`:
 * `update({ where: { id } })` deixaria editar o banner de outra loja.
 * ═══════════════════════════════════════════════════════════════════════
 */

type Settings = Record<string, unknown>;

/** Mesma queda para FIXED do delivery-fee.ts — aqui no retorno da tela. */
function normalizeFeeMode(mode: string | null | undefined): 'FIXED' | 'BY_NEIGHBORHOOD' | 'BY_DISTANCE_BAND' {
  if (mode === 'BY_NEIGHBORHOOD' || mode === 'BY_DISTANCE_BAND') return mode;
  return 'FIXED';
}

async function readSettings(organizationId: string): Promise<Settings> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const raw = org?.settings;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Settings) : {};
}

/** Mescla uma chave em settings sem tocar nas outras. */
async function mergeSettings(organizationId: string, patch: Settings): Promise<void> {
  const current = await readSettings(organizationId);
  const result = await prisma.organization.updateMany({
    where: { id: organizationId },
    data: { settings: { ...current, ...patch } as never },
  });
  if (result.count === 0) throw new Error('Estabelecimento não encontrado.');
}

/** Operação completa da loja, para a tela de horários e entrega. */
export async function getStoreOperations(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      storeStatus: true,
      openingHours: true,
      allowPickup: true,
      allowOwnDelivery: true,
      allowMarketplace: true,
      minimumOrder: true,
      baseDeliveryFee: true,
      extraKmFee: true,
      deliveryRadius: true,
      averageDeliveryTime: true,
      deliveryFeeMode: true,
      settings: true,
      deliveryZones: { orderBy: { position: 'asc' } },
    },
  });
  if (!org) return null;

  const settings: Settings = (org.settings as Settings | null) ?? {};

  return {
    storeStatus: org.storeStatus,
    // Texto legível (usado na vitrine) e agenda estruturada (usada para
    // saber se está aberto agora) são coisas diferentes de propósito.
    openingHoursText: org.openingHours,
    schedule: normalizeSchedule(settings.openingHours as WeekdaySchedule[] | undefined),
    deliveryTiers: normalizeTiers(settings.deliveryTiers),
    // Modo de taxa. Texto (FIXED / BY_NEIGHBORHOOD / BY_DISTANCE_BAND).
    // normalizeMode() em delivery-fee.ts garante queda para FIXED quando
    // o banco tiver um valor que não conhecemos.
    deliveryFeeMode: normalizeFeeMode(org.deliveryFeeMode),
    allowPickup: org.allowPickup,
    allowOwnDelivery: org.allowOwnDelivery,
    allowMarketplace: org.allowMarketplace,
    minimumOrder: Number(org.minimumOrder),
    baseDeliveryFee: Number(org.baseDeliveryFee),
    extraKmFee: Number(org.extraKmFee),
    deliveryRadius: Number(org.deliveryRadius),
    averageDeliveryTime: org.averageDeliveryTime,
    deliveryZones: org.deliveryZones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      fee: Number(zone.fee),
      active: zone.active,
      distanceKm: zone.distanceKm,
      latitude: zone.latitude,
      longitude: zone.longitude,
      position: zone.position,
    })),
  };
}

export type StoreOperations = NonNullable<Awaited<ReturnType<typeof getStoreOperations>>>;

/**
 * Faixas de frete são lidas por `normalizeTiers` de delivery-fee.ts.
 *
 * Ficou uma definição só, importada — não duas. Antes existia aqui uma
 * cópia da mesma validação; duas cópias de uma regra de preço é o tipo de
 * coisa que começa idêntica e termina diferente, e aí a tela exibe um
 * número que o checkout não cobra. A função original está em
 * `src/lib/data/delivery-fee.ts`, junto com o resto do cálculo.
 */


// ── AGENDA (4.23) ──────────────────────────────────────────────────────

/**
 * Grava a agenda da semana.
 *
 * O texto de `openingHours` é DERIVADO da agenda (resumo), não digitado:
 * quando os dois existiam soltos, a vitrine podia dizer "abre às 18h" com
 * a agenda dizendo 19h. Agora há uma fonte só.
 */
export async function saveSchedule(
  organizationId: string,
  schedule: WeekdaySchedule[],
  summary: string,
): Promise<void> {
  const normalized = normalizeSchedule(schedule);
  await mergeSettings(organizationId, { openingHours: normalized });
  const result = await prisma.organization.updateMany({
    where: { id: organizationId },
    data: { openingHours: summary || null },
  });
  if (result.count === 0) throw new Error('Estabelecimento não encontrado.');
}

// ── ENTREGA (4.22) ─────────────────────────────────────────────────────

export async function saveDelivery(
  organizationId: string,
  input: {
    allowPickup: boolean;
    allowOwnDelivery: boolean;
    allowMarketplace: boolean;
    minimumOrder: number;
    baseDeliveryFee: number;
    extraKmFee: number;
    deliveryRadius: number;
    averageDeliveryTime: number;
    deliveryTiers: Array<{ upToKm: number; fee: number }>;
    deliveryFeeMode?: string;
  },
): Promise<void> {
  const sorted = [...input.deliveryTiers].sort((a, b) => a.upToKm - b.upToKm);

  // Só os três modos conhecidos. Qualquer outra coisa volta a FIXED:
  // um valor estranho no banco não pode deixar a loja sem regra de frete.
  const feeMode =
    input.deliveryFeeMode === 'BY_NEIGHBORHOOD' || input.deliveryFeeMode === 'BY_DISTANCE_BAND'
      ? input.deliveryFeeMode
      : 'FIXED';

  const result = await prisma.organization.updateMany({
    where: { id: organizationId },
    data: {
      allowPickup: input.allowPickup,
      allowOwnDelivery: input.allowOwnDelivery,
      allowMarketplace: input.allowMarketplace,
      minimumOrder: input.minimumOrder,
      baseDeliveryFee: input.baseDeliveryFee,
      extraKmFee: input.extraKmFee,
      deliveryRadius: input.deliveryRadius,
      averageDeliveryTime: Math.round(input.averageDeliveryTime),
      deliveryFeeMode: feeMode,
    },
  });
  if (result.count === 0) throw new Error('Estabelecimento não encontrado.');

  await mergeSettings(organizationId, { deliveryTiers: sorted });
}

// ── BAIRROS E TAXAS (Fase 3) ───────────────────────────────────────────
//
// Um único model (`DeliveryZone`) representa as regras de taxa por bairro.
// Não há três tabelas de frete: o modo BY_NEIGHBORHOOD lê daqui e o
// cálculo central (`delivery-fee.ts`) casa o bairro informado pelo cliente
// com estas zonas. Distância e coordenada são opcionais — informativas
// para o mapa, nunca a fonte do preço (o preço é a taxa cadastrada).

export async function getDeliveryZones(organizationId: string) {
  const zones = await prisma.deliveryZone.findMany({
    where: { organizationId },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  });
  return zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    fee: Number(zone.fee),
    active: zone.active,
    distanceKm: zone.distanceKm,
    latitude: zone.latitude,
    longitude: zone.longitude,
    position: zone.position,
  }));
}

export type DeliveryZoneView = Awaited<ReturnType<typeof getDeliveryZones>>[number];

export async function createDeliveryZone(
  organizationId: string,
  input: {
    name: string;
    fee: number;
    active: boolean;
    distanceKm?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  },
) {
  const last = await prisma.deliveryZone.findFirst({
    where: { organizationId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  return prisma.deliveryZone.create({
    data: {
      organizationId,
      name: input.name,
      fee: input.fee,
      active: input.active,
      distanceKm: input.distanceKm ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      position: (last?.position ?? -1) + 1,
    },
  });
}

export async function updateDeliveryZone(
  organizationId: string,
  zoneId: string,
  input: {
    name?: string;
    fee?: number;
    active?: boolean;
    distanceKm?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  },
) {
  const result = await prisma.deliveryZone.updateMany({
    where: { id: zoneId, organizationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.fee !== undefined ? { fee: input.fee } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.distanceKm !== undefined ? { distanceKm: input.distanceKm } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
    },
  });
  if (result.count === 0) throw new Error('Bairro não encontrado neste estabelecimento.');
  return { ok: true as const };
}

export async function deleteDeliveryZone(organizationId: string, zoneId: string) {
  const result = await prisma.deliveryZone.deleteMany({
    where: { id: zoneId, organizationId },
  });
  if (result.count === 0) throw new Error('Bairro não encontrado neste estabelecimento.');
  return { ok: true as const };
}

/**
 * Bairros para o cálculo do frete (BY_NEIGHBORHOOD). Só nome + taxa +
 * ativo entram no cálculo — a coordenada fica de fora de propósito.
 */
export async function getDeliveryZonesForFee(organizationId: string) {
  const zones = await prisma.deliveryZone.findMany({
    where: { organizationId, active: true },
    select: { name: true, fee: true, active: true },
  });
  return zones.map((z) => ({ name: z.name, fee: Number(z.fee), active: z.active }));
}

// ── IDENTIDADE VISUAL (4.21) ───────────────────────────────────────────
//
// Mesmas colunas que o onboarding gravou. Não refaz o onboarding: a tela
// edita só a aparência, sem repetir tipo/nome/categorias.

export async function saveVisualIdentity(
  organizationId: string,
  input: {
    brandColor: string;
    secondaryColor: string | null;
    accentColor: string | null;
    theme: string;
    logoUrl: string | null;
  },
): Promise<void> {
  const result = await prisma.organization.updateMany({
    where: { id: organizationId },
    data: {
      brandColor: input.brandColor,
      secondaryColor: input.secondaryColor,
      accentColor: input.accentColor,
      theme: input.theme,
      logoUrl: input.logoUrl,
    },
  });
  if (result.count === 0) throw new Error('Estabelecimento não encontrado.');
}

// ── BANNERS (4.19) ─────────────────────────────────────────────────────
//
// Só os DA LOJA. O `StoreBanner` com organizationId nulo é o banner
// padrão da plataforma para o segmento: o lojista não edita nem apaga.
// Quando ele ainda não criou nenhum, a vitrine usa o padrão — é o mesmo
// comportamento de `getBannersForStore`, e por isso a tela precisa dizer
// "você ainda não tem banners seus".

export async function getStoreBanners(organizationId: string) {
  const banners = await prisma.storeBanner.findMany({
    where: { organizationId, placement: 'hero' },
    orderBy: { position: 'asc' },
  });
  return banners.map((banner) => ({
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle,
    imagePath: banner.imagePath,
    linkUrl: banner.linkUrl,
    position: banner.position,
    active: banner.active,
  }));
}

export type StoreBannerView = Awaited<ReturnType<typeof getStoreBanners>>[number];

/** Banner padrão do segmento, quando a loja não tem nenhum seu. */
export async function countDefaultBanners() {
  return prisma.storeBanner.count({ where: { organizationId: null, placement: 'hero', active: true } });
}

export async function createStoreBanner(
  organizationId: string,
  input: {
    title: string;
    subtitle?: string | null;
    imagePath: string;
    linkUrl?: string | null;
    active: boolean;
  },
) {
  // Entra no fim da fila: o lojista já escolheu uma ordem, e enfiar o
  // novo na frente dela seria desfazer a escolha sem avisar.
  const last = await prisma.storeBanner.findFirst({
    where: { organizationId, placement: 'hero' },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const banner = await prisma.storeBanner.create({
    data: {
      organizationId,
      title: input.title,
      subtitle: input.subtitle || null,
      imagePath: input.imagePath,
      linkUrl: input.linkUrl || null,
      placement: 'hero',
      position: (last?.position ?? -1) + 1,
      active: input.active,
    },
    select: { id: true },
  });
  return banner;
}

export async function updateStoreBanner(
  organizationId: string,
  bannerId: string,
  input: {
    title: string;
    subtitle?: string | null;
    imagePath: string;
    linkUrl?: string | null;
    active: boolean;
  },
) {
  const result = await prisma.storeBanner.updateMany({
    where: { id: bannerId, organizationId },
    data: {
      title: input.title,
      subtitle: input.subtitle || null,
      imagePath: input.imagePath,
      linkUrl: input.linkUrl || null,
      active: input.active,
    },
  });
  if (result.count === 0) throw new Error('Banner não encontrado neste estabelecimento.');
  return { ok: true as const };
}

export async function deleteStoreBanner(organizationId: string, bannerId: string) {
  const result = await prisma.storeBanner.deleteMany({ where: { id: bannerId, organizationId } });
  if (result.count === 0) throw new Error('Banner não encontrado neste estabelecimento.');
  return { ok: true as const };
}

export async function toggleStoreBanner(
  organizationId: string,
  bannerId: string,
  active: boolean,
) {
  const result = await prisma.storeBanner.updateMany({
    where: { id: bannerId, organizationId },
    data: { active },
  });
  if (result.count === 0) throw new Error('Banner não encontrado neste estabelecimento.');
  return { ok: true as const };
}

export async function reorderStoreBanners(organizationId: string, bannerIds: string[]) {
  const unique = Array.from(new Set(bannerIds.filter(Boolean)));
  if (unique.length === 0) return { ok: true as const, count: 0 };

  const found = await prisma.storeBanner.count({ where: { organizationId, id: { in: unique } } });
  if (found !== unique.length) {
    throw new Error('A lista contém banners que não são deste estabelecimento.');
  }

  await prisma.$transaction(
    unique.map((id, index) =>
      prisma.storeBanner.updateMany({ where: { id, organizationId }, data: { position: index } }),
    ),
  );
  return { ok: true as const, count: unique.length };
}
