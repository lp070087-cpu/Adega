import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { setStock } from '@/lib/data/inventory';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * COMBOS — leitura e escrita (Fase 4.15)
 * -----------------------------------------------------------------------
 * Um combo é um Product com uma linha Combo apontando para ele. Todo
 * `where` carrega `organizationId` como PRIMEIRO filtro — inclusive nas
 * consultas por id, porque é aí que o IDOR nasce: `findUnique({ id })`
 * sozinho devolve o combo de qualquer loja.
 *
 * Os itens são sempre Products da MESMA organização. A checagem não é
 * opcional: sem ela, o corpo da requisição poderia apontar para o produto
 * de outra loja e o combo passaria a exibir nome e preço alheios.
 *
 * Por que Combo e não um modelo paralelo: sendo o combo um Product, ele
 * herda carrinho, pedido, destaque, estoque e promoção sem uma linha nova
 * em cada um. Criar um "modelo de combo" separado obrigaria a ensinar
 * todas essas telas a lidar com duas coisas vendáveis.
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Categoria informada é desta loja?
 *
 * Mesma razão do guard em `catalog.ts`: o schema valida o `categoryId`
 * apenas pela forma, e a chave estrangeira só exige que a categoria
 * exista — inclusive a de outra organização. Aceita o client da transação
 * porque as duas escritas de combo acontecem dentro de `$transaction`.
 */
async function assertCategoryOfOrg(
  tx: Prisma.TransactionClient,
  organizationId: string,
  categoryId: string | null | undefined,
): Promise<string | null> {
  if (!categoryId) return null;

  const found = await tx.category.findFirst({
    where: { id: categoryId, organizationId },
    select: { id: true },
  });
  if (!found) throw new Error('Categoria não encontrada.');
  return found.id;
}

export type ComboItemInput = { productId: string; quantity: number };

export type ComboWriteInput = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  promotionalPrice?: number | null;
  categoryId?: string | null;
  active?: boolean;
  featured?: boolean;
  trackStock?: boolean;
  stock?: number;
  items: ComboItemInput[];
};

/** Combos da loja, com os itens resolvidos para exibição. */
export async function getCombos(organizationId: string) {
  const combos = await prisma.combo.findMany({
    where: { organizationId },
    orderBy: { product: { position: 'asc' } },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          description: true,
          customImageUrl: true,
          emoji: true,
          price: true,
          promotionalPrice: true,
          active: true,
          available: true,
          featured: true,
          stock: true,
          trackStock: true,
          position: true,
          categoryId: true,
          globalProduct: { select: { defaultImageUrl: true } },
        },
      },
      items: {
        orderBy: { position: 'asc' },
        include: {
          product: { select: { id: true, name: true, emoji: true, price: true, active: true } },
        },
      },
    },
  });

  return combos.map((combo) => {
    // Soma dos componentes vendidos separados. Serve para a tela mostrar
    // ao lojista quanto o conjunto economiza — é informação de decisão,
    // não o preço do combo (esse é o `price` do Product).
    const separateTotal = combo.items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0,
    );

    return {
      id: combo.product.id,
      comboId: combo.id,
      name: combo.product.name,
      description: combo.product.description,
      emoji: combo.product.emoji,
      customImageUrl: combo.product.customImageUrl,
      globalImageUrl: combo.product.globalProduct?.defaultImageUrl ?? null,
      price: Number(combo.product.price),
      promotionalPrice:
        combo.product.promotionalPrice === null ? null : Number(combo.product.promotionalPrice),
      active: combo.product.active,
      available: combo.product.available,
      featured: combo.product.featured,
      stock: combo.product.stock,
      trackStock: combo.product.trackStock,
      position: combo.product.position,
      categoryId: combo.product.categoryId,
      separateTotal: Math.round(separateTotal * 100) / 100,
      items: combo.items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        emoji: item.product.emoji,
        unitPrice: Number(item.product.price),
        quantity: item.quantity,
        active: item.product.active,
      })),
    };
  });
}

export type ComboView = Awaited<ReturnType<typeof getCombos>>[number];

/**
 * Confere que TODOS os ids pertencem à organização.
 *
 * Lança em vez de ignorar: um id de outra loja não é "não encontrado
 * silencioso", é tentativa de atravessar tenant — e silenciar esconderia
 * exatamente o que interessa saber.
 */
export async function assertProductsInOrganization(
  organizationId: string,
  productIds: string[],
): Promise<number> {
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  if (unique.length === 0) return 0;

  const found = await prisma.product.count({
    where: { organizationId, id: { in: unique } },
  });

  if (found !== unique.length) {
    throw new Error('Um dos produtos escolhidos não pertence a este estabelecimento.');
  }
  return found;
}

/** Cria o Product do combo e a linha Combo numa transação. */
export async function createCombo(organizationId: string, input: ComboWriteInput) {
  await assertProductsInOrganization(
    organizationId,
    input.items.map((i) => i.productId),
  );

  return prisma.$transaction(async (tx) => {
    const position = await tx.product.count({ where: { organizationId } });
    const categoryId = await assertCategoryOfOrg(tx, organizationId, input.categoryId);

    const product = await tx.product.create({
      data: {
        organizationId,
        categoryId,
        name: input.name,
        slug: await uniqueProductSlug(tx, organizationId, input.name),
        description: input.description || null,
        customImageUrl: input.imageUrl || null,
        imageUrl: input.imageUrl || null,
        emoji: '🎁',
        price: input.price,
        promotionalPrice: input.promotionalPrice ?? null,
        stock: input.stock ?? 0,
        minimumStock: 0,
        trackStock: input.trackStock ?? false,
        active: input.active ?? true,
        available: true,
        // SIMPLE de propósito: o combo tem preço próprio e não usa as
        // variações do produto — a escolha acontece nos itens.
        type: 'SIMPLE',
        position,
        featured: input.featured ?? false,
      },
      select: { id: true },
    });

    const combo = await tx.combo.create({
      data: { organizationId, productId: product.id },
      select: { id: true },
    });

    await tx.comboItem.createMany({
      data: input.items.map((item, index) => ({
        comboId: combo.id,
        productId: item.productId,
        quantity: item.quantity,
        position: index,
      })),
    });

    return { comboId: combo.id, productId: product.id };
  });
}

/** Atualiza o combo e SUBSTITUI os itens pelos informados. */
export async function updateCombo(
  organizationId: string,
  productId: string,
  input: ComboWriteInput,
) {
  // O combo tem de ser desta loja. `findFirst` com organizationId — nunca
  // `findUnique({ productId })`, que atravessaria tenants.
  const combo = await prisma.combo.findFirst({
    where: { organizationId, productId },
    select: { id: true },
  });
  if (!combo) throw new Error('Combo não encontrado neste estabelecimento.');

  await assertProductsInOrganization(
    organizationId,
    input.items.map((i) => i.productId),
  );

  return prisma.$transaction(async (tx) => {
    const categoryId = await assertCategoryOfOrg(tx, organizationId, input.categoryId);

    await tx.product.updateMany({
      where: { id: productId, organizationId },
      data: {
        name: input.name,
        description: input.description || null,
        customImageUrl: input.imageUrl || null,
        imageUrl: input.imageUrl || null,
        price: input.price,
        promotionalPrice: input.promotionalPrice ?? null,
        categoryId,
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.featured !== undefined ? { featured: input.featured } : {}),
        ...(input.trackStock !== undefined ? { trackStock: input.trackStock } : {}),
        ...(input.stock !== undefined ? { stock: input.stock } : {}),
      },
    });

    // Substituir é mais simples e mais seguro que diferenciar: o combo tem
    // poucos itens, e um diff mal calculado deixaria item órfão.
    await tx.comboItem.deleteMany({ where: { comboId: combo.id } });
    await tx.comboItem.createMany({
      data: input.items.map((item, index) => ({
        comboId: combo.id,
        productId: item.productId,
        quantity: item.quantity,
        position: index,
      })),
    });

    return { comboId: combo.id, productId };
  });
}

/** Remove o combo apagando o Product (Cascade leva Combo e itens). */
export async function deleteCombo(organizationId: string, productId: string) {
  const combo = await prisma.combo.findFirst({
    where: { organizationId, productId },
    select: { id: true },
  });
  if (!combo) throw new Error('Combo não encontrado neste estabelecimento.');

  // Apagar só a linha Combo deixaria o Product vendável sem composição —
  // pior que não existir.
  const result = await prisma.product.deleteMany({ where: { id: productId, organizationId } });
  if (result.count === 0) throw new Error('Combo não encontrado neste estabelecimento.');
  return { ok: true as const };
}

/**
 * PRODUTOS QUE PODEM ENTRAR NUM COMBO.
 *
 * Exclui a si mesmo (ao editar) e os produtos que JÁ SÃO combos: combo
 * dentro de combo multiplicaria a confusão de estoque sem ninguém pedir.
 */
export async function getComboCandidates(organizationId: string, excludeProductId?: string) {
  return prisma.product.findMany({
    where: {
      organizationId,
      active: true,
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      combo: null,
    },
    orderBy: [{ name: 'asc' }],
    select: { id: true, name: true, emoji: true, price: true, customImageUrl: true, categoryId: true },
  });
}

/* ═══════════════════════════════════════════════════════════════════════
 * ORDENAÇÃO (Fase 4.9)
 * -----------------------------------------------------------------------
 * A tela manda a LISTA COMPLETA na ordem final e o servidor grava
 * 0,1,2… numa transação. Reescrever a lista inteira custa N updates,
 * mas é idempotente: dois cliques rápidos não deixam posições repetidas
 * nem buracos, situação em que a ordenação da vitrine fica imprevisível.
 *
 * Os ids são conferidos por posse antes: se um deles não for desta loja,
 * a lista inteira é recusada. Reordenar "o que der" seria pior que não
 * reordenar — o lojista veria a ordem mudar sozinha depois.
 * ═══════════════════════════════════════════════════════════════════════ */

async function applyReorder(
  organizationId: string,
  ids: string[],
  model: 'product' | 'category',
): Promise<{ updated: number }> {
  const unique = Array.from(new Set(ids.filter(Boolean)));

  const owned =
    model === 'product'
      ? await prisma.product.count({ where: { organizationId, id: { in: unique } } })
      : await prisma.category.count({ where: { organizationId, id: { in: unique } } });

  if (owned !== unique.length) {
    throw new Error('A lista enviada contém itens que não pertencem a este estabelecimento.');
  }

  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < unique.length; index++) {
      // updateMany com { id, organizationId } — um id chutado não acha linha.
      if (model === 'product') {
        await tx.product.updateMany({
          where: { id: unique[index]!, organizationId },
          data: { position: index },
        });
      } else {
        await tx.category.updateMany({
          where: { id: unique[index]!, organizationId },
          data: { position: index },
        });
      }
    }
  });

  return { updated: unique.length };
}

/** Ordena os produtos do catálogo (e, com eles, os combos). */
export async function reorderProducts(organizationId: string, ids: string[]) {
  return applyReorder(organizationId, ids, 'product');
}

/** Ordena as categorias — a vitrine usa esta ordem, não a alfabética. */
export async function reorderCategories(organizationId: string, ids: string[]) {
  return applyReorder(organizationId, ids, 'category');
}

/**
 * Ordena os produtos em destaque.
 *
 * `featuredPosition` é separado de `position` de propósito: o lojista pode
 * querer o hambúrguer em 3º no cardápio e em 1º no carrossel. Usar o mesmo
 * campo obrigaria a escolher entre as duas ordens.
 */
export async function reorderFeaturedProducts(organizationId: string, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));

  if (unique.length > 0) {
    const owned = await prisma.product.count({
      where: { organizationId, id: { in: unique }, featured: true },
    });
    if (owned !== unique.length) {
      throw new Error('Só é possível ordenar produtos que estão em destaque.');
    }
  }

  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < unique.length; index++) {
      await tx.product.updateMany({
        where: { id: unique[index]!, organizationId },
        data: { featuredPosition: index },
      });
    }
  });

  return { updated: unique.length };
}

/* ═══════════════════════════════════════════════════════════════════════
 * DISPONIBILIDADE, DESTAQUE E ESTOQUE RÁPIDO (Fases 4.10 / 4.12 / 4.13)
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Disponível / Indisponível — o "acabou hoje".
 *
 * É um campo diferente de `active`: desativar tira o produto da vitrine e
 * some com ele; indisponibilizar mantém a ficha visível com o aviso de
 * esgotado. O lojista precisa dos dois.
 */
export async function setProductAvailability(
  organizationId: string,
  productId: string,
  available: boolean,
) {
  const result = await prisma.product.updateMany({
    where: { id: productId, organizationId },
    data: { available },
  });
  if (result.count === 0) throw new Error('Produto não encontrado neste estabelecimento.');
  return { available };
}

/**
 * Destaque no carrossel do topo.
 *
 * Ao entrar em destaque, o produto vai para o FIM da ordem de destaque —
 * a posição que ele já ocupava no catálogo não diz nada sobre onde ele
 * deve aparecer no carrossel. Ao sair, `featuredPosition` volta a null
 * para não guardar ordem de algo que não está mais lá.
 */
export async function setProductFeatured(
  organizationId: string,
  productId: string,
  featured: boolean,
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: { id: true, active: true, available: true },
  });
  if (!product) throw new Error('Produto não encontrado neste estabelecimento.');

  if (featured && (!product.active || !product.available)) {
    throw new Error(
      'Só produtos ativos e disponíveis podem ser destacados — destaque com produto fora do ar não aparece para ninguém.',
    );
  }

  const featuredPosition = featured
    ? await prisma.product.count({ where: { organizationId, featured: true } })
    : 0;

  await prisma.product.updateMany({
    where: { id: productId, organizationId },
    data: { featured, featuredPosition },
  });

  return { featured, featuredPosition };
}

/**
 * Ajuste rápido de estoque — o lojista digita o número que está na
 * prateleira, não a diferença.
 *
 * Delega para `setStock` de inventory.ts em vez de escrever o
 * InventoryMovement aqui: o saldo nunca muda sem rastro, e existe UM lugar
 * que grava movimento. Duas implementações dariam dois históricos.
 */
export async function quickSetStock(
  organizationId: string,
  productId: string,
  stock: number,
  userId?: string,
) {
  return setStock(organizationId, productId, stock, 'Ajuste rápido pelo catálogo', userId);
}

/** Slug de produto único dentro da loja. */
async function uniqueProductSlug(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name: string,
): Promise<string> {
  const base = slugify(name) || 'combo';
  const taken = new Set(
    (await tx.product.findMany({ where: { organizationId }, select: { slug: true } })).map(
      (p) => p.slug,
    ),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

