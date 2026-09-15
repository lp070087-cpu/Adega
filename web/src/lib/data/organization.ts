import 'server-only';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';

/**
 * Acesso a dados de Organization.
 *
 * Toda função recebe organizationId como PRIMEIRO parâmetro. Não existe
 * versão "sem filtro" — é isso que torna o vazamento entre lojas
 * estruturalmente difícil, e não uma questão de lembrar do where.
 */

/** Organização da sessão. */
export async function getOrganizationById(organizationId: string) {
  return prisma.organization.findUnique({ where: { id: organizationId } });
}

/**
 * Loja pública: busca por slug. Aqui não há sessão — o slug é a chave.
 * Só devolve o necessário para a vitrine; nada de dado interno.
 */
export async function getPublicStoreBySlug(slug: string) {
  return prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      brandColor: true,
      secondaryColor: true,
      accentColor: true,
      description: true,
      businessType: true,
      phone: true,
      whatsapp: true,
      email: true,
      address: true,
      addressNumber: true,
      addressComplement: true,
      district: true,
      city: true,
      state: true,
      zipCode: true,
      openingHours: true,
      minimumOrder: true,
      baseDeliveryFee: true,
      extraKmFee: true,
      deliveryRadius: true,
      averageDeliveryTime: true,
      allowPickup: true,
      allowOwnDelivery: true,
      storeStatus: true,
      status: true,
      /**
       * Só o que a vitrine precisa ler de `settings`: a agenda estruturada,
       * para saber se está aberto AGORA (o texto de openingHours é resumo
       * digitado, não serve para calcular) e as faixas de frete.
       */
      settings: true,
    },
  });
}

/**
 * Catálogo público: só categorias e produtos realmente vendáveis.
 *
 * Traz junto o vínculo com o produto global. Sem ele a vitrine não teria
 * como mostrar a foto: o item vindo da biblioteca tem `imageUrl` nulo de
 * propósito — o arquivo é um só, compartilhado por todas as lojas.
 */
export async function getPublicCatalog(organizationId: string) {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId, active: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, emoji: true },
    }),
    prisma.product.findMany({
      /**
       * INATIVO não aparece; INDISPONÍVEL aparece.
       *
       * A distinção é do próprio schema: `active: false` é o produto que o
       * lojista despublicou — não deve existir na vitrine. Já
       * `available: false` (ou estoque zerado) é pausa temporária: "acabou
       * o pão". Sumir com ele faria o cliente procurar por um item que a
       * loja vende e concluir que ela não tem — pior do que dizer
       * "indisponível agora". O card mostra e bloqueia o botão.
       */
      where: { organizationId, active: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        categoryId: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        customImageUrl: true,
        emoji: true,
        featured: true,
        featuredPosition: true,
        available: true,
        price: true,
        promotionalPrice: true,
        stock: true,
        trackStock: true,
        type: true,
        globalProduct: { select: { defaultImageUrl: true } },
        variations: {
          where: { active: true },
          orderBy: { position: 'asc' },
          select: { id: true, name: true, priceAdjustment: true },
        },
        addonGroups: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            minSelections: true,
            maxSelections: true,
            required: true,
            addons: {
              where: { active: true },
              orderBy: { position: 'asc' },
              select: { id: true, name: true, price: true },
            },
          },
        },
        /**
         * Combo vem junto porque o combo É um produto: a vitrine precisa
         * saber quais itens do cardápio são conjuntos e quanto eles
         * economizam. Sem isso, o combo apareceria como um prato comum
         * com um preço aparentemente aleatório.
         */
        combo: {
          select: {
            items: {
              orderBy: { position: 'asc' },
              select: {
                quantity: true,
                product: { select: { id: true, name: true, price: true, active: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  return { categories, products };
}

/**
 * Produtos em destaque, para o hero da vitrine.
 *
 * Ordem: `featuredPosition` primeiro (o lojista decide o que aparece na
 * frente), produtos sem posição definida depois, e por fim nome. Não
 * filtra por imagem: quem não tem foto ainda aparece, com o emoji —
 * esconder o destaque do lojista porque o acervo não chegou seria pior.
 */
export async function getFeaturedProducts(organizationId: string, limit = 6) {
  return prisma.product.findMany({
    where: {
      organizationId,
      featured: true,
      active: true,
      available: true,
      OR: [{ trackStock: false }, { stock: { gt: 0 } }],
    },
    orderBy: [{ featuredPosition: 'asc' }, { name: 'asc' }],
    take: limit,
    select: {
      id: true,
      name: true,
      emoji: true,
      imageUrl: true,
      customImageUrl: true,
      price: true,
      promotionalPrice: true,
      globalProduct: { select: { defaultImageUrl: true } },
    },
  });
}

/**
 * Atualiza Minha Loja.
 *
 * Só a própria organização — o where carrega o id da sessão. O slug é
 * recalculado quando o nome muda, mas nunca em cima de um slug de outra
 * loja: se colidir, ganha sufixo.
 */
export async function updateOrganization(
  organizationId: string,
  input: {
    name?: string;
    slug?: string;
    businessType?: import('@prisma/client').BusinessType;
    brandColor?: string;
    secondaryColor?: string | null;
    accentColor?: string | null;
    theme?: string;
    logoUrl?: string | null;
    description?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    address?: string | null;
    addressNumber?: string | null;
    addressComplement?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    openingHours?: string | null;
    minimumOrder?: number;
    deliveryRadius?: number;
    baseDeliveryFee?: number;
    extraKmFee?: number;
    averageDeliveryTime?: number;
    latitude?: number | null;
    longitude?: number | null;
  },
) {
  let slug = input.slug;

  if (!slug && input.name) {
    const base = slugify(input.name) || 'loja';
    slug = base;
    let attempt = 2;
    while (await slugExists(slug, organizationId)) {
      slug = `${base}-${attempt++}`;
    }
  }

  if (slug && (await slugExists(slug, organizationId))) {
    throw new Error('Este endereço de loja já está em uso.');
  }

  const result = await prisma.organization.updateMany({
    where: { id: organizationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug ? { slug } : {}),
      ...(input.businessType ? { businessType: input.businessType } : {}),
      ...(input.brandColor ? { brandColor: input.brandColor } : {}),
      ...(input.secondaryColor !== undefined ? { secondaryColor: input.secondaryColor } : {}),
      ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.addressNumber !== undefined ? { addressNumber: input.addressNumber } : {}),
      ...(input.addressComplement !== undefined
        ? { addressComplement: input.addressComplement }
        : {}),
      ...(input.district !== undefined ? { district: input.district } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.zipCode !== undefined ? { zipCode: input.zipCode } : {}),
      ...(input.openingHours !== undefined ? { openingHours: input.openingHours } : {}),
      ...(input.minimumOrder !== undefined ? { minimumOrder: input.minimumOrder } : {}),
      ...(input.deliveryRadius !== undefined ? { deliveryRadius: input.deliveryRadius } : {}),
      ...(input.baseDeliveryFee !== undefined ? { baseDeliveryFee: input.baseDeliveryFee } : {}),
      ...(input.extraKmFee !== undefined ? { extraKmFee: input.extraKmFee } : {}),
      ...(input.averageDeliveryTime !== undefined
        ? { averageDeliveryTime: input.averageDeliveryTime }
        : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
    },
  });

  if (result.count === 0) throw new Error('Estabelecimento não encontrado.');
  return prisma.organization.findUnique({ where: { id: organizationId } });
}

/** Abrir/pausar/fechar a loja. Reflete na vitrine imediatamente. */
export async function setStoreStatus(
  organizationId: string,
  storeStatus: import('@prisma/client').StoreStatus,
) {
  const result = await prisma.organization.updateMany({
    where: { id: organizationId },
    data: { storeStatus },
  });
  if (result.count === 0) throw new Error('Estabelecimento não encontrado.');
  return { ok: true, storeStatus };
}

/** Slug livre? Usado no onboarding e ao renomear a loja. */
export async function slugExists(slug: string, exceptOrganizationId?: string): Promise<boolean> {
  const found = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!found) return false;
  return found.id !== exceptOrganizationId;
}

export function buildSlug(name: string): string {
  return slugify(name);
}

/** Quantos usuários/entregadores/lojas a organização já tem (limites de plano). */
export async function getOrganizationUsage(organizationId: string) {
  const [users, drivers, orders, products] = await Promise.all([
    prisma.organizationUser.count({ where: { organizationId, active: true } }),
    prisma.driver.count({ where: { organizationId, active: true } }),
    prisma.order.count({ where: { organizationId } }),
    prisma.product.count({ where: { organizationId } }),
  ]);
  return { users, drivers, orders, products };
}

/** Organização tem ao menos um produto? Decide o que mostrar no onboarding. */
export async function organizationHasCatalog(organizationId: string): Promise<boolean> {
  const count = await prisma.product.count({ where: { organizationId } });
  return count > 0;
}

