import { stockDefaults } from '@/lib/stock-policy';
import 'server-only';
import type { BusinessType, Prisma } from '@prisma/client';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { prisma, toNumber } from '@/lib/db';
import { slugify } from '@/lib/utils';

/** Shared beverage catalog. Store products reference the original photo. */
// ── CATEGORIAS GLOBAIS ─────────────────────────────────────────────────

export type GlobalCategoryNode = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  imagePath: string | null;
  position: number;
  parentId: string | null;
  productCount: number;
  children: GlobalCategoryNode[];
};

/**
 * Árvore de categorias globais (dois níveis), com contagem de produtos
 * ativos em cada nó. É o que popula a navegação lateral do seletor de
 * biblioteca.
 */
/**
 * Nicho da plataforma: adega e depósito de bebidas. A biblioteca global
 * ainda guarda itens de outros segmentos (pizza, hambúrguer, porções), mas
 * só o que serve a uma loja de bebidas — bebidas e conveniência (gelo,
 * carvão, petiscos, tabacaria) — aparece para o lojista.
 */
export const NICHE_BUSINESS_TYPES: BusinessType[] = ['BEVERAGE', 'CONVENIENCE'];
const nicheProducts = { active: true, businessTypes: { some: { businessType: { in: NICHE_BUSINESS_TYPES } } } } satisfies Prisma.GlobalProductWhereInput;

export async function getGlobalCategoryTree(): Promise<GlobalCategoryNode[]> {
  const rows = await prisma.globalCategory.findMany({
    where: { active: true },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: nicheProducts } } } },
  });

  const nodes = new Map<string, GlobalCategoryNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      imagePath: row.imagePath,
      position: row.position,
      parentId: row.parentId,
      productCount: row._count.products,
      children: [],
    });
  }

  const roots: GlobalCategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // A contagem do pai soma os filhos: o lojista precisa saber que
  // "Bebidas" tem 180 itens, e não 0 porque os produtos estão nas folhas.
  for (const root of roots) {
    root.productCount += root.children.reduce((sum, child) => sum + child.productCount, 0);
  }

  // Categorias sem nenhum item do nicho (Pizzas, Hambúrgueres…) somem.
  return roots
    .map((root) => ({ ...root, children: root.children.filter((child) => child.productCount > 0) }))
    .filter((root) => root.productCount > 0);
}

/** Versão achatada — para selects e validação. */
export async function getGlobalCategories(onlyWithProducts = false) {
  const rows = await prisma.globalCategory.findMany({
    where: { active: true },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      _count: { select: { products: { where: nicheProducts } } },
    },
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      imagePath: row.imagePath,
      parentId: row.parentId,
      parentName: row.parent?.name ?? null,
      parentSlug: row.parent?.slug ?? null,
      /** Nome completo para exibição: "Bebidas › Cervejas". */
      fullName: row.parent ? `${row.parent.name} › ${row.name}` : row.name,
      productCount: row._count.products,
    }))
    .filter((row) => (onlyWithProducts ? row.productCount > 0 : true));
}

/** Marcas distintas da biblioteca — alimenta o filtro de marca. */
export async function getGlobalBrands(): Promise<string[]> {
  const rows = await prisma.globalProduct.findMany({
    where: { ...nicheProducts, brand: { not: null } },
    distinct: ['brand'],
    select: { brand: true },
    orderBy: { brand: 'asc' },
  });
  return rows.map((r) => r.brand).filter((b): b is string => Boolean(b));
}

// ── PRODUTOS GLOBAIS ───────────────────────────────────────────────────


export function serializeGlobalProduct<T extends {
  volume?: unknown;
  suggestedPrice?: unknown;
  [key: string]: unknown;
}>(product: T) {
  return {
    ...product,
    volume: product.volume === null || product.volume === undefined ? null : toNumber(product.volume),
    suggestedPrice:
      product.suggestedPrice === null || product.suggestedPrice === undefined
        ? null
        : toNumber(product.suggestedPrice),
  };
}
export type GlobalProductFilters = {
  search?: string;
  /** Slug da categoria global (folha ou raiz — a raiz inclui as filhas). */
  categorySlug?: string;
  globalCategoryId?: string;
  brand?: string;
  businessType?: BusinessType;
  /** Só itens que já têm arquivo no acervo. */
  withImage?: boolean;
  page?: number;
  perPage?: number;
};

/**
 * Busca na biblioteca. É o que alimenta tanto o passo de produtos do
 * onboarding quanto o modal "+ Adicionar da biblioteca".
 */
export async function searchGlobalProducts(filters: GlobalProductFilters = {}) {
  const {
    search,
    categorySlug,
    globalCategoryId,
    brand,
    businessType,
    withImage,
    page = 1,
    perPage = 60,
  } = filters;

  // Uma raiz selecionada precisa trazer também os produtos das filhas.
  let categoryIds: string[] | undefined;
  if (categorySlug) {
    const root = await prisma.globalCategory.findUnique({
      where: { slug: categorySlug },
      select: { id: true, children: { select: { id: true } } },
    });
    categoryIds = root ? [root.id, ...root.children.map((c) => c.id)] : [];
  } else if (globalCategoryId) {
    categoryIds = [globalCategoryId];
  }

  const where: Prisma.GlobalProductWhereInput = {
    active: true,
    ...(categoryIds ? { globalCategoryId: { in: categoryIds } } : {}),
    ...(brand ? { brand } : {}),
    ...(withImage ? { NOT: { defaultImageUrl: null } } : {}),
    // Sempre dentro do nicho; o filtro "recomendados" afina dentro dele.
    AND: [
      { businessTypes: { some: { businessType: { in: NICHE_BUSINESS_TYPES } } } },
      ...(businessType ? [{ businessTypes: { some: { businessType } } }] : []),
    ],
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { brand: { contains: search, mode: 'insensitive' as const } },
            { barcode: { contains: search, mode: 'insensitive' as const } },
            // `aliases` casa com o nome que o lojista conhece ("Coca lata").
            { aliases: { has: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.globalProduct.findMany({
      where,
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        globalCategory: { select: { id: true, name: true, slug: true, icon: true, imagePath: true } },
        businessTypes: { select: { businessType: true, weight: true } },
      },
    }),
    prisma.globalProduct.count({ where }),
  ]);

  return {
    items: items.map(serializeGlobalProduct),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * Produtos recomendados para um segmento. Usado no passo "escolher
 * produtos" do onboarding, já pré-filtrado pelo tipo do estabelecimento.
 */
export async function getRecommendedGlobalProducts(
  businessType: BusinessType,
  options: { limit?: number; perPage?: number; search?: string; categorySlug?: string } = {},
) {
  const { limit, ...rest } = options;
  const result = await searchGlobalProducts({
    businessType,
    perPage: limit ?? rest.perPage ?? 60,
    search: rest.search,
    categorySlug: rest.categorySlug,
  });

  // Quem tem peso maior no segmento aparece primeiro.
  const ordered = [...result.items].sort((a, b) => {
    const wa = (a.businessTypes ?? []).find((t) => t.businessType === businessType)?.weight ?? 0;
    const wb = (b.businessTypes ?? []).find((t) => t.businessType === businessType)?.weight ?? 0;
    return wb - wa;
  });

  return { ...result, items: ordered };
}

export async function getGlobalProductById(id: string) {
  const product = await prisma.globalProduct.findUnique({
    where: { id },
    include: {
      globalCategory: { select: { id: true, name: true, slug: true, icon: true, imagePath: true } },
      businessTypes: { select: { businessType: true, weight: true } },
    },
  });
  return product ? serializeGlobalProduct(product) : null;
}

/** Contadores do topo do seletor de biblioteca. */
export async function getGlobalCatalogSummary() {
  const [products, withImage, categories, brands] = await Promise.all([
    prisma.globalProduct.count({ where: { active: true } }),
    prisma.globalProduct.count({ where: { active: true, NOT: { defaultImageUrl: null } } }),
    prisma.globalCategory.count({ where: { active: true } }),
    getGlobalBrands(),
  ]);
  return { products, withImage, withoutImage: products - withImage, categories, brands: brands.length };
}

// ── CÓPIA PARA O CATÁLOGO DA LOJA ──────────────────────────────────────

export async function getBeverageLibrary(organizationId: string) {
  const products = await prisma.globalProduct.findMany({
    where: nicheProducts,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      brand: true,
      emoji: true,
      defaultImageUrl: true,
      suggestedPrice: true,
      globalCategory: { select: { id: true, name: true } },
      products: { where: { organizationId }, select: { id: true }, take: 1 },
    },
  });

  return products.map(({ products: owned, ...product }) => ({
    ...product,
    suggestedPrice: product.suggestedPrice === null ? null : toNumber(product.suggestedPrice),
    inStock: owned.length > 0,
  }));
}

/** Adds selected library items as unpublished products with zero opening balance. */
export async function addGlobalProductsToStock(organizationId: string, globalProductIds: string[]) {
  return withOrganizationTransaction(organizationId, (tx) =>
    copyGlobalProductsToStock(tx, organizationId, globalProductIds),
  );
}

async function copyGlobalProductsToStock(
  tx: Prisma.TransactionClient,
  organizationId: string,
  globalProductIds: string[],
) {
  const unique = [...new Set(globalProductIds)];
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  const { minimumStock } = stockDefaults(org.settings);
  const globals = await tx.globalProduct.findMany({
    where: { ...nicheProducts, id: { in: unique } },
    include: { globalCategory: { select: { id: true, name: true, icon: true } } },
  });

  const unavailable = unique.length - globals.length;
  const existing = await tx.product.findMany({
    where: { organizationId, globalProductId: { in: globals.map((product) => product.id) } },
    select: { globalProductId: true },
  });
  const owned = new Set(existing.map((product) => product.globalProductId));
  const toCreate = globals.filter((product) => !owned.has(product.id));
  if (!toCreate.length) return { created: 0, skipped: owned.size, unavailable };

  const categories = await tx.category.findMany({
    where: { organizationId },
    select: { id: true, name: true, slug: true, position: true },
  });
  const categoryKey = (name: string) => name.trim().toLowerCase();
  const categoryIds = new Map(categories.map(({ name, id }) => [categoryKey(name), id]));
  const usedCategorySlugs = new Set(categories.map(({ slug }) => slug));
  const missingCategories = new Map<string, { name: string; icon: string | null }>();
  for (const { globalCategory } of toCreate) {
    if (globalCategory && !categoryIds.has(categoryKey(globalCategory.name))) {
      missingCategories.set(categoryKey(globalCategory.name), globalCategory);
    }
  }

  if (missingCategories.size) {
    const start = categories.reduce((next, category) => Math.max(next, category.position + 1), 0);
    const created = await tx.category.createManyAndReturn({
      data: [...missingCategories.values()].map(({ name, icon }, index) => ({
        organizationId, name, slug: uniqueSlugFrom(usedCategorySlugs, name, 'categoria'),
        emoji: icon, position: start + index,
      })),
      select: { id: true, name: true },
    });
    for (const { id, name } of created) categoryIds.set(categoryKey(name), id);
  }

  const existingProducts = await tx.product.findMany({
    where: { organizationId },
    select: { slug: true, position: true },
  });
  const usedSlugs = new Set(existingProducts.map((p) => p.slug));
  let position =
    existingProducts.reduce((max, p) => Math.max(max, p.position + 1), 0);

  const data: Prisma.ProductCreateManyInput[] = toCreate.map((global) => ({
    organizationId,
    categoryId: global.globalCategory ? categoryIds.get(categoryKey(global.globalCategory.name)) ?? null : null,
    globalProductId: global.id,

    name: global.name,
    slug: uniqueSlugFrom(usedSlugs, global.slug || global.name),
    description: global.description ?? buildDescription(global.brand, global.volume, global.unit),
    emoji: global.emoji,

    // A imagem NÃO é copiada. `imageUrl` e `customImageUrl` ficam nulos de
    // propósito — a resolução cai no global.
    imageUrl: null,
    customImageUrl: null,

    barcode: global.barcode,
    // SKU nasce vazio: o lojista define o código dele, se quiser.
    sku: null,

    price: toNumber(global.suggestedPrice),
    promotionalPrice: null,
    cost: null,

    stock: 0,
    minimumStock,
    trackStock: true,

    active: false,
    available: false,
    type: global.suggestedType,
    position: position++,
  }));

  const created = data.length > 0 ? (await tx.product.createMany({ data })).count : 0;
  return { created, skipped: owned.size, unavailable };
}

function buildDescription(
  brand: string | null,
  volume: unknown,
  unit: string | null,
): string | null {
  const parts: string[] = [];
  if (brand) parts.push(brand);
  const vol = toNumber(volume);
  if (vol > 0) parts.push(`${vol}${unit ? ` ${unit}` : ''}`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Evita colisão de slug sem ir ao banco: já temos todos em memória.
 *
 * Vale para produtos e para categorias — a chave única é a mesma nos dois
 * casos (`organizationId` + `slug`), então a regra de desempate também é.
 * O `fallback` só muda o nome quando a `slugify` devolve vazio ("???" vira
 * "produto", categoria sem letra nenhuma vira "categoria").
 */
function uniqueSlugFrom(used: Set<string>, name: string, fallback = 'produto'): string {
  const base = slugify(name) || fallback;
  let slug = base;
  for (let suffix = 2; used.has(slug); suffix++) slug = `${base}-${suffix}`;
  used.add(slug);
  return slug;
}

// ── BANNERS ────────────────────────────────────────────────────────────

/**
 * Banners que a loja pública deve mostrar: os próprios da loja quando
 * existem, senão os padrões da plataforma para o segmento.
 *
 * Nunca devolve banner de outra organização.
 */
export async function getBannersForStore(
  organizationId: string,
  businessType: BusinessType | null,
  placement = 'hero',
) {
  const own = await prisma.storeBanner.findMany({
    where: { organizationId, active: true, placement },
    orderBy: { position: 'asc' },
  });
  if (own.length > 0) return own;

  return prisma.storeBanner.findMany({
    where: {
      organizationId: null,
      active: true,
      placement,
      // Vazio = serve qualquer segmento.
      OR: [
        { businessTypes: { isEmpty: true } },
        ...(businessType ? [{ businessTypes: { has: businessType } }] : []),
      ],
    },
    orderBy: { position: 'asc' },
  });
}


