import 'server-only';
import type { ProductType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { toNumber } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { buildTemplateProducts } from '@/lib/data/template-copy';

/**
 * Acesso a Category e Product.
 *
 * Toda função recebe organizationId primeiro e o usa no `where`. Um
 * produto de outra loja não é "encontrado", não é "negado" — ele
 * simplesmente não existe para esta consulta.
 */

/**
 * Categoria informada realmente pertence a esta loja?
 *
 * O `categoryId` chega do formulário e o schema valida apenas a FORMA
 * (string de tamanho plausível). A chave estrangeira do banco também não
 * protege: ela só exige que a linha exista — e uma categoria de OUTRA loja
 * existe. Sem esta conferência, um id adivinhado (ou copiado) vincularia o
 * produto à categoria alheia, e a listagem do catálogo serializa a
 * categoria junto (`include: { category: true }`), vazando nome, slug e
 * emoji de outra organização.
 *
 * Devolve null para "sem categoria" e o próprio id quando é desta loja.
 */
async function assertCategoryOfOrg(
  organizationId: string,
  categoryId: string | null | undefined,
): Promise<string | null> {
  if (!categoryId) return null;

  const found = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
    select: { id: true },
  });
  if (!found) throw new Error('Categoria não encontrada.');
  return found.id;
}

// ── CATEGORIAS ─────────────────────────────────────────────────────────

export async function getCategories(organizationId: string, onlyActive = false) {
  return prisma.category.findMany({
    where: { organizationId, ...(onlyActive ? { active: true } : {}) },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
}

export async function createCategory(
  organizationId: string,
  data: { name: string; emoji?: string; position?: number; active?: boolean },
) {
  const slug = await uniqueCategorySlug(organizationId, data.name);
  const count = await prisma.category.count({ where: { organizationId } });
  return prisma.category.create({
    data: {
      organizationId,
      name: data.name,
      slug,
      emoji: data.emoji ?? null,
      position: data.position ?? count,
      active: data.active ?? true,
    },
  });
}

async function uniqueCategorySlug(organizationId: string, name: string): Promise<string> {
  const base = slugify(name) || 'categoria';
  let candidate = base;
  let i = 2;
  while (
    await prisma.category.findFirst({
      where: { organizationId, slug: candidate },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${i++}`;
    if (i > 200) return `${base}-${Date.now()}`;
  }
  return candidate;
}

export async function updateCategory(
  organizationId: string,
  categoryId: string,
  data: { name?: string; emoji?: string | null; position?: number; active?: boolean },
) {
  // updateMany com organizationId no where garante que ninguém edite
  // categoria de outra loja passando um id adivinhado.
  const result = await prisma.category.updateMany({
    where: { id: categoryId, organizationId },
    data,
  });
  if (result.count === 0) throw new Error('Categoria não encontrada.');
  // Leitura de volta já escopada: findUnique por id sozinho devolveria a
  // linha de outra loja se o id viesse de lá (o update acima barra, mas a
  // releitura não herda esse filtro).
  return prisma.category.findFirst({ where: { id: categoryId, organizationId } });
}

export async function deleteCategory(organizationId: string, categoryId: string) {
  const result = await prisma.category.deleteMany({
    where: { id: categoryId, organizationId },
  });
  if (result.count === 0) throw new Error('Categoria não encontrada.');
  return { ok: true };
}

// ── PRODUTOS ───────────────────────────────────────────────────────────

export type ProductFilters = {
  search?: string;
  categoryId?: string;
  active?: boolean;
  available?: boolean;
  lowStock?: boolean;
  page?: number;
  perPage?: number;
};

export async function getProducts(organizationId: string, filters: ProductFilters = {}) {
  const {
    search,
    categoryId,
    active,
    available,
    lowStock,
    page = 1,
    perPage = 50,
  } = filters;

  const where: Prisma.ProductWhereInput = {
    organizationId,
    ...(categoryId ? { categoryId } : {}),
    ...(active !== undefined ? { active } : {}),
    ...(available !== undefined ? { available } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
            { barcode: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    // Estoque baixo: só faz sentido em produto que controla estoque.
    ...(lowStock
      ? { trackStock: true, stock: { lte: prisma.product.fields.minimumStock } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        category: { select: { id: true, name: true, emoji: true } },
        // Necessário para a miniatura: produto vindo da biblioteca tem
        // imageUrl nulo de propósito (a foto é compartilhada), então a
        // imagem só é encontrada pelo vínculo com o global.
        globalProduct: {
          select: { id: true, defaultImageUrl: true, emoji: true, brand: true },
        },
        variations: { orderBy: { position: 'asc' } },
        addonGroups: {
          orderBy: { position: 'asc' },
          include: { addons: { orderBy: { position: 'asc' } } },
        },
        _count: { select: { orderItems: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map(serializeProduct),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Um produto, com a fronteira de organização aplicada. */
export async function getProductById(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    include: {
      category: true,
      variations: { orderBy: { position: 'asc' } },
      addonGroups: {
        orderBy: { position: 'asc' },
        include: { addons: { orderBy: { position: 'asc' } } },
      },
    },
  });
  return product ? serializeProduct(product) : null;
}

/** Decimal → number, para os componentes não lidarem com Prisma.Decimal. */
export function serializeProduct<T extends {
  price: unknown;
  promotionalPrice: unknown;
  cost: unknown;
  variations?: Array<{ priceAdjustment: unknown; [key: string]: unknown }>;
  addonGroups?: Array<{ addons: Array<{ price: unknown; [key: string]: unknown }>; [key: string]: unknown }>;
}>(product: T) {
  return {
    ...product,
    price: toNumber(product.price),
    promotionalPrice: product.promotionalPrice === null ? null : toNumber(product.promotionalPrice),
    cost: product.cost === null ? null : toNumber(product.cost),
    effectivePrice:
      product.promotionalPrice !== null && product.promotionalPrice !== undefined
        ? toNumber(product.promotionalPrice)
        : toNumber(product.price),
    variations: (product.variations ?? []).map((v) => ({
      ...v,
      priceAdjustment: toNumber(v.priceAdjustment),
    })),
    addonGroups: (product.addonGroups ?? []).map((g) => ({
      ...g,
      addons: g.addons.map((a) => ({ ...a, price: toNumber(a.price) })),
    })),
  };
}

export type ProductWriteInput = {
  name: string;
  slug?: string;
  categoryId?: string;
  description?: string;
  imageUrl?: string;
  emoji?: string;
  sku?: string;
  barcode?: string;
  price: number;
  promotionalPrice?: number;
  cost?: number;
  stock: number;
  minimumStock: number;
  trackStock: boolean;
  active: boolean;
  available: boolean;
  type: ProductType;
  variations?: Array<{ name: string; priceAdjustment: number; active: boolean; position: number }>;
  addonGroups?: Array<{
    name: string;
    minSelections: number;
    maxSelections: number;
    required: boolean;
    position: number;
    addons: Array<{ name: string; price: number; active: boolean; position: number }>;
  }>;
};

/**
 * Cria produto. Se vier com estoque inicial, registra a entrada no
 * livro-razão de estoque — o saldo em Product.stock nunca aparece do
 * nada, ele sempre tem um movimento que o explica.
 */
export async function createProduct(
  organizationId: string,
  input: ProductWriteInput,
  userId?: string,
) {
  const slug = await uniqueProductSlug(organizationId, input.slug || input.name);
  const count = await prisma.product.count({ where: { organizationId } });
  const categoryId = await assertCategoryOfOrg(organizationId, input.categoryId);

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        organizationId,
        categoryId,
        name: input.name,
        slug,
        description: input.description || null,
        imageUrl: input.imageUrl || null,
        emoji: input.emoji || null,
        sku: input.sku || null,
        barcode: input.barcode || null,
        price: input.price,
        promotionalPrice: input.promotionalPrice ?? null,
        cost: input.cost ?? null,
        stock: input.stock,
        minimumStock: input.minimumStock,
        trackStock: input.trackStock,
        active: input.active,
        available: input.available,
        type: input.type,
        position: count,
        ...(input.variations?.length
          ? { variations: { create: input.variations } }
          : {}),
        ...(input.addonGroups?.length
          ? {
              addonGroups: {
                create: input.addonGroups.map((g) => ({
                  name: g.name,
                  minSelections: g.minSelections,
                  maxSelections: g.maxSelections,
                  required: g.required,
                  position: g.position,
                  addons: { create: g.addons },
                })),
              },
            }
          : {}),
      },
      include: { variations: true, addonGroups: { include: { addons: true } } },
    });

    if (input.trackStock && input.stock > 0) {
      await tx.inventoryMovement.create({
        data: {
          organizationId,
          productId: product.id,
          type: 'IN',
          quantity: input.stock,
          previousStock: 0,
          newStock: input.stock,
          reason: 'Estoque inicial do cadastro',
          userId: userId ?? null,
        },
      });
    }

    return serializeProduct(product);
  });
}

export async function updateProduct(
  organizationId: string,
  productId: string,
  input: ProductWriteInput,
) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, organizationId },
  });
  if (!existing) throw new Error('Produto não encontrado.');

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueProductSlug(organizationId, input.slug, productId)
      : existing.slug;
  const categoryId = await assertCategoryOfOrg(organizationId, input.categoryId);

  return prisma.$transaction(async (tx) => {
    // Variações e adicionais são substituídos por completo: a tela manda
    // o conjunto final. Recriar é mais simples e seguro do que diff.
    await tx.productVariation.deleteMany({ where: { productId } });
    await tx.productAddonGroup.deleteMany({ where: { productId } });

    const product = await tx.product.update({
      where: { id: productId },
      data: {
        categoryId,
        name: input.name,
        slug,
        description: input.description || null,
        imageUrl: input.imageUrl || null,
        emoji: input.emoji || null,
        sku: input.sku || null,
        barcode: input.barcode || null,
        price: input.price,
        promotionalPrice: input.promotionalPrice ?? null,
        cost: input.cost ?? null,
        minimumStock: input.minimumStock,
        trackStock: input.trackStock,
        active: input.active,
        available: input.available,
        type: input.type,
        ...(input.variations?.length
          ? { variations: { create: input.variations } }
          : {}),
        ...(input.addonGroups?.length
          ? {
              addonGroups: {
                create: input.addonGroups.map((g) => ({
                  name: g.name,
                  minSelections: g.minSelections,
                  maxSelections: g.maxSelections,
                  required: g.required,
                  position: g.position,
                  addons: { create: g.addons },
                })),
              },
            }
          : {}),
      },
      include: { variations: true, addonGroups: { include: { addons: true } } },
    });

    // Estoque NÃO muda por aqui: alteração de saldo passa por
    // adjustStock/setStock, que registram movimento. Editar o cadastro
    // não pode movimentar estoque silenciosamente.
    return serializeProduct(product);
  });
}

async function uniqueProductSlug(
  organizationId: string,
  name: string,
  exceptId?: string,
): Promise<string> {
  const base = slugify(name) || 'produto';
  let candidate = base;
  let i = 2;
  for (;;) {
    const found = await prisma.product.findFirst({
      where: { organizationId, slug: candidate, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (!found) return candidate;
    candidate = `${base}-${i++}`;
    if (i > 500) return `${base}-${Date.now()}`;
  }
}

export async function deleteProduct(organizationId: string, productId: string) {
  // O histórico de pedidos é preservado: OrderItem guarda o nome e o
  // preço do produto, então apagar o cadastro não reescreve o passado.
  const result = await prisma.product.deleteMany({
    where: { id: productId, organizationId },
  });
  if (result.count === 0) throw new Error('Produto não encontrado.');
  return { ok: true };
}

/** Duplicar: copia o produto e seus complementos como inativo. */
export async function duplicateProduct(organizationId: string, productId: string) {
  const original = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    include: {
      variations: { orderBy: { position: 'asc' } },
      addonGroups: { include: { addons: { orderBy: { position: 'asc' } } } },
    },
  });
  if (!original) throw new Error('Produto não encontrado.');

  const slug = await uniqueProductSlug(organizationId, `${original.name} copia`);

  return prisma.product.create({
    data: {
      organizationId,
      categoryId: original.categoryId,
      name: `${original.name} (cópia)`,
      slug,
      description: original.description,
      imageUrl: original.imageUrl,
      emoji: original.emoji,
      sku: null, // SKU duplicado causaria conflito de inventário.
      barcode: null,
      price: original.price,
      promotionalPrice: original.promotionalPrice,
      cost: original.cost,
      stock: 0,
      minimumStock: original.minimumStock,
      trackStock: original.trackStock,
      // Nasce desligado: cópia não deve aparecer na vitrine sozinha.
      active: false,
      available: original.available,
      type: original.type,
      variations: {
        create: original.variations.map((v) => ({
          name: v.name,
          priceAdjustment: v.priceAdjustment,
          active: v.active,
          position: v.position,
        })),
      },
      addonGroups: {
        create: original.addonGroups.map((g) => ({
          name: g.name,
          minSelections: g.minSelections,
          maxSelections: g.maxSelections,
          required: g.required,
          position: g.position,
          addons: {
            create: g.addons.map((a) => ({
              name: a.name,
              price: a.price,
              active: a.active,
              position: a.position,
            })),
          },
        })),
      },
    },
  });
}

/** Edição rápida de preço direto na tabela. */
export async function updateProductPrice(
  organizationId: string,
  productId: string,
  price: number,
  promotionalPrice?: number | null,
) {
  if (promotionalPrice != null && promotionalPrice >= price) {
    throw new Error('O preço promocional deve ser menor que o preço normal.');
  }
  const result = await prisma.product.updateMany({
    where: { id: productId, organizationId },
    data: {
      price,
      promotionalPrice: promotionalPrice === undefined ? undefined : promotionalPrice,
    },
  });
  if (result.count === 0) throw new Error('Produto não encontrado.');
  return { ok: true };
}

export async function toggleProduct(
  organizationId: string,
  productId: string,
  field: 'active' | 'available',
  value: boolean,
) {
  const result = await prisma.product.updateMany({
    where: { id: productId, organizationId },
    data: { [field]: value },
  });
  if (result.count === 0) throw new Error('Produto não encontrado.');
  return { ok: true };
}

/** Contadores do topo do catálogo. */
export async function getCatalogSummary(organizationId: string) {
  const [total, active, inactive, lowStock, outOfStock, categories] = await Promise.all([
    prisma.product.count({ where: { organizationId } }),
    prisma.product.count({ where: { organizationId, active: true } }),
    prisma.product.count({ where: { organizationId, active: false } }),
    prisma.product.count({
      where: { organizationId, trackStock: true, stock: { lte: prisma.product.fields.minimumStock, gt: 0 } },
    }),
    prisma.product.count({ where: { organizationId, trackStock: true, stock: 0 } }),
    prisma.category.count({ where: { organizationId } }),
  ]);
  return { total, active, inactive, lowStock, outOfStock, categories };
}

/**
 * Copia o catálogo-modelo do segmento para Product.
 * A partir daqui o catálogo pertence só a esta organização — editar o
 * template no código não muda mais nada para ela.
 */
export async function applySegmentTemplate(
  organizationId: string,
  businessType: Parameters<typeof buildTemplateProducts>[0],
  options: { replaceExisting?: boolean } = {},
) {
  const { categories, products } = buildTemplateProducts(businessType);

  return prisma.$transaction(async (tx) => {
    if (options.replaceExisting) {
      // Só apaga o que nunca foi vendido, para não quebrar histórico.
      await tx.product.deleteMany({
        where: { organizationId, orderItems: { none: {} } },
      });
      await tx.category.deleteMany({ where: { organizationId } });
    }

    const existingCategories = await tx.category.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(existingCategories.map((c) => [c.name, c.id]));

    let position = existingCategories.length;
    for (const cat of categories) {
      if (!categoryMap.has(cat.name)) {
        const created = await tx.category.create({
          data: {
            organizationId,
            name: cat.name,
            slug: slugify(cat.name) || `cat-${position}`,
            emoji: cat.emoji,
            position: position++,
          },
        });
        categoryMap.set(cat.name, created.id);
      }
    }

    const existingProducts = await tx.product.findMany({
      where: { organizationId },
      select: { name: true },
    });
    const existingNames = new Set(existingProducts.map((p) => p.name));
    const toCreate = products.filter((p) => !existingNames.has(p.name));

    let created = 0;
    for (const p of toCreate) {
      await tx.product.create({
        data: {
          organizationId,
          categoryId: categoryMap.get(p.categoryName) ?? null,
          name: p.name,
          slug: await uniqueProductSlug(organizationId, p.name),
          description: p.description ?? null,
          imageUrl: p.imageUrl ?? null,
          emoji: p.emoji ?? null,
          price: p.price,
          promotionalPrice: p.promotionalPrice ?? null,
          cost: p.cost ?? null,
          stock: p.stock ?? 0,
          minimumStock: p.minimumStock ?? 0,
          trackStock: true,
          active: true,
          available: true,
          type: p.type ?? 'SIMPLE',
          position: created,
          variations: p.type === 'VARIATION' && p.variations?.length
            ? {
                create: p.variations.map((v, i) => ({
                  name: v.name,
                  priceAdjustment: v.priceAdjustment,
                  position: i,
                })),
              }
            : undefined,
          addonGroups: p.type === 'ADDONS' && p.addons?.length
            ? {
                create: [
                  {
                    name: 'Adicionais',
                    minSelections: 0,
                    maxSelections: p.addons.length,
                    required: false,
                    position: 0,
                    addons: {
                      create: p.addons.map((a, i) => ({
                        name: a.name,
                        price: a.price,
                        position: i,
                      })),
                    },
                  },
                ],
              }
            : undefined,
        },
      });
      created++;
    }

    return { categories: categoryMap.size, products: created };
  });
}


