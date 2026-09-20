import 'server-only';
import type { BusinessType, Prisma } from '@prisma/client';
import { prisma, toNumber } from '@/lib/db';
import { slugify } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BIBLIOTECA GLOBAL DA PLATAFORMA
 * -----------------------------------------------------------------------
 * Camada de leitura e de cópia do catálogo-mestre. Nada aqui tem
 * organizationId — são dados da PLATAFORMA, compartilhados por todas as
 * lojas.
 *
 * A única função que ESCREVE em nome de uma loja é
 * `addGlobalProductsToCatalog`, e ela sempre recebe organizationId como
 * primeiro parâmetro, vindo da sessão.
 *
 * Regra de ouro: o global é MODELO. A imagem global nunca é copiada para
 * o disco. O Product criado aponta para o global (`globalProductId`) e
 * deixa `customImageUrl` nulo — assim 500 hamburguerias vendendo a mesma
 * Coca-Cola 350ml compartilham um único arquivo.
 * ═══════════════════════════════════════════════════════════════════════
 */

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
export async function getGlobalCategoryTree(): Promise<GlobalCategoryNode[]> {
  const rows = await prisma.globalCategory.findMany({
    where: { active: true },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: { active: true } } } } },
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

  return roots;
}

/** Versão achatada — para selects e validação. */
export async function getGlobalCategories(onlyWithProducts = false) {
  const rows = await prisma.globalCategory.findMany({
    where: { active: true },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      _count: { select: { products: { where: { active: true } } } },
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
    where: { active: true, brand: { not: null } },
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
    ...(businessType ? { businessTypes: { some: { businessType } } } : {}),
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

export type AddToCatalogOptions = {
  /** Preço informado na tela para cada global. Ausente = preço sugerido. */
  prices?: Record<string, number>;
  /** Só cria o que ainda não existe. Padrão: true. */
  skipExisting?: boolean;
  /** Categoria da loja onde colocar. Ausente = deduz pela categoria global. */
  categoryId?: string;
  /** Marca os recém-criados como destaque do Hero. */
  featured?: boolean;
};

export type AddToCatalogResult = {
  created: number;
  skipped: number;
  categoriesCreated: number;
  /**
   * Ids dos Products criados, na ordem em que os produtos foram pedidos.
   *
   * Os produtos entram em UMA escrita (`createManyAndReturn`), então os
   * ids vêm do banco e são reordenados por `globalProductId` antes de sair
   * — o histórico dependia da ordem de inserção das linhas.
   */
  productIds: string[];
};

/**
 * Copia produtos da biblioteca para o catálogo de UMA organização.
 *
 * O que é copiado: nome, marca (descrição), emoji, código de barras e o
 * vínculo `globalProductId`. O que NÃO é copiado: o arquivo de imagem. O
 * Product nasce com `customImageUrl` nulo, e a loja pública resolve a
 * imagem pelo global — é isso que impede 500 arquivos iguais no disco.
 *
 * Idempotente: chamar duas vezes com os mesmos ids não duplica nada.
 */
export async function addGlobalProductsToCatalog(
  organizationId: string,
  globalProductIds: string[],
  options: AddToCatalogOptions = {},
): Promise<AddToCatalogResult> {
  return prisma.$transaction((tx) =>
    copyGlobalProductsTx(tx, organizationId, globalProductIds, options),
  );
}

/**
 * Núcleo da cópia, recebendo a transação de fora.
 *
 * Existe separado porque o ONBOARDING precisa copiar os produtos dentro
 * da MESMA transação que cria a organização — senão uma falha no meio
 * deixaria uma loja criada e vazia depois de o lojista ter escolhido 60
 * produtos.
 */
export async function copyGlobalProductsTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  globalProductIds: string[],
  options: AddToCatalogOptions = {},
): Promise<AddToCatalogResult> {
  const { prices = {}, skipExisting = true, categoryId, featured = false } = options;

  const unique = Array.from(new Set(globalProductIds.filter(Boolean)));
  if (unique.length === 0) {
    return { created: 0, skipped: 0, categoriesCreated: 0, productIds: [] };
  }

  const globals = await tx.globalProduct.findMany({
    where: { id: { in: unique }, active: true },
    include: { globalCategory: { select: { id: true, name: true, icon: true } } },
  });

  /** Ignora id inexistente ou inativo: não é erro, é item fora do ar. */
  const missing = unique.length - globals.length;

  // Vínculo já existente: nada a fazer. Só consultamos se vamos pular.
  const existing = skipExisting
    ? await tx.product.findMany({
        where: { organizationId, globalProductId: { in: globals.map((g) => g.id) } },
        select: { globalProductId: true },
      })
    : [];
  const alreadyThere = new Set(existing.map((e) => e.globalProductId));

  const toCreate = globals.filter((g) => !alreadyThere.has(g.id));

  // ── Categorias da loja ──
  // O nome da categoria global é o mesmo que o lojista vê; usamos ele
  // para achar (ou criar) a categoria equivalente no catálogo dela.
  const storeCategories = await tx.category.findMany({
    where: { organizationId },
    select: { id: true, name: true, slug: true },
  });
  // ── Chave da categoria ──
  //
  // UMA normalização só — sem espaço nas pontas, sem diferença entre
  // maiúscula e minúscula — usada para as TRÊS coisas: achar a categoria
  // que a loja já tem, decidir quais criar e ler de volta o mapa.
  //
  // O motivo de existir uma função em vez de comparar `name === name`:
  // no meio do caminho convivem dois nomes que podem não ser o mesmo
  // texto — o que está gravado na loja e o que veio do catálogo global.
  // Enquanto a ESCRITA e a LEITURA do mapa usarem chaves diferentes, a
  // busca devolve `undefined` e o produto importado entra com
  // `categoryId: null`, sem categoria e em silêncio.
  //
  // Hoje o acervo não tem nenhum nome com espaço nas pontas (conferido:
  // 27 folhas e 356 produtos, zero casos), então isto é garantia de
  // consistência, não correção de dado existente. Custa nada e fecha a
  // porta para um defeito que só apareceria como "produto sem categoria".
  const categoryKeyOf = (name: string) => name.trim().toLowerCase();

  /**
   * Nome normalizado → id da categoria da loja. Guarda tanto as que já
   * existiam quanto as que esta cópia acabou de criar.
   */
  const categoryIdByKey = new Map<string, string>(
    storeCategories.map((c) => [categoryKeyOf(c.name), c.id]),
  );
  let categoriesCreated = 0;

  // ── Slug da categoria nova, SEM ir ao banco ──
  // A versão anterior perguntava ao banco, uma vez por colisão, dentro do
  // laço (`findFirst` com slug candidato). Agora as duas fontes de verdade
  // são montadas em memória antes de qualquer escrita: `categoryIdByKey`
  // (nomes) e `usedCategorySlugs` (slugs). Como depois de cada criação os
  // dois são atualizados, o resultado é o mesmo — só que sem N+1.
  const usedCategorySlugs = new Set(storeCategories.map((c) => c.slug));

  // ── Nomes de categoria global usados pelos produtos ──
  // Calculado ANTES de criar categoria: o conjunto de categorias novas sai
  // de uma passada só, e não de uma decisão por produto (era daí que vinha
  // o N+1 — cada produto com categoria nova segurava a transação por mais
  // duas idas ao Neon).
  const ownsCategoryName = new Set(
    storeCategories.map((c) => categoryKeyOf(c.name)),
  );
  const claimedCategoryNames = new Set<string>();
  const categoriesToCreate = new Map<string, { name: string; icon: string | null }>();
  for (const global of toCreate) {
    const category = global.globalCategory;
    if (!category) continue;
    const key = categoryKeyOf(category.name);
    if (ownsCategoryName.has(key) || claimedCategoryNames.has(key)) continue;
    claimedCategoryNames.add(key);
    categoriesToCreate.set(key, { name: category.name, icon: category.icon });
  }

  /**
   * `createManyAndReturn` é uma ida ao banco, não N. Importa porque a
   * transação é interativa: o relógio dela corre desde a primeira query, e
   * o Neon está do outro lado da rede.
   *
   * A ordem das linhas que voltam NÃO é a ordem enviada, então o laço
   * abaixo não usa posição nenhuma: cada linha volta com o próprio `name`,
   * que é o que identifica a categoria aqui (nome + organização é único).
   * Se voltasse um nome não previsto, é melhor derrubar a transação do que
   * pendurar produto em categoria inventada.
   */
  const rowsByPosition = [...categoriesToCreate.values()].map(({ name, icon }, index) => {
    const slug = uniqueSlugFrom(usedCategorySlugs, name, 'categoria');
    // Reserva o slug imediatamente: duas categorias novas de nomes
    // parecidos não podem sair daqui com o mesmo slug.
    usedCategorySlugs.add(slug);
    return {
      organizationId,
      name,
      slug,
      emoji: icon,
      position: storeCategories.length + index,
    };
  });

  const createdRows =
    rowsByPosition.length > 0
      ? await tx.category.createManyAndReturn({
          data: rowsByPosition,
          select: { id: true, name: true },
        })
      : [];

  for (const row of createdRows) {
    const planned = categoriesToCreate.get(categoryKeyOf(row.name));
    // Rede de segurança: sem isto, um nome inesperado viraria chave
    // `undefined` no mapa e o produto cairia em categoria errada.
    if (!planned) throw new Error(`Categoria "${row.name}" não estava prevista na cópia.`);
    // Mesma chave da leitura (`categoryIdFor`) e do teste de existência
    // (`ownsCategoryName`) — é isso que garante que o produto recém-copiado
    // ache a categoria que acabou de nascer.
    categoryIdByKey.set(categoryKeyOf(planned.name), row.id);
    categoriesCreated++;
  }

  /**
   * Categoria escolhida à mão pelo lojista. Precisa ser DESTA loja: o id
   * chega do formulário e nem o schema (que valida só a forma) nem a
   * chave estrangeira (que exige apenas que a linha exista) impedem o id
   * de outra organização. Sem a conferência, os produtos importados
   * ficariam pendurados na categoria alheia e o catálogo serializaria
   * nome, slug e emoji dela.
   *
   * Uma consulta só, antes do laço — e nenhuma escrita. É aqui que a
   * variável é validada, não em cada produto.
   */
  let destinationCategoryId: string | null = null;
  if (categoryId) {
    const own = await tx.category.findFirst({
      where: { id: categoryId, organizationId },
      select: { id: true },
    });
    if (!own) throw new Error('Categoria não encontrada.');
    destinationCategoryId = own.id;
  }

  const categoryIdFor = (globalCategory: { name: string } | null): string | null => {
    if (destinationCategoryId) return destinationCategoryId;
    if (!globalCategory) return null;
    // Mesma chave usada para montar o mapa — ver `categoryKeyOf`.
    return categoryIdByKey.get(categoryKeyOf(globalCategory.name)) ?? null;
  };

  // ── Produtos ──
  // Sem `count` nem `findMany` de slugs: a lista de produtos já está sendo
  // carregada para descobrir os slugs livres, e `length` responde o que o
  // `count` responderia. Eram duas idas ao banco para dizer o que uma já
  // dizia.
  const existingProducts = await tx.product.findMany({
    where: { organizationId },
    select: { slug: true, position: true },
  });
  const usedSlugs = new Set(existingProducts.map((p) => p.slug));
  let position =
    existingProducts.reduce((max, p) => Math.max(max, p.position + 1), 0);

  /**
   * Os produtos vão em UMA escrita. Antes era um `create` por produto —
   * 300 produtos significavam 300 idas ao Neon dentro da mesma transação
   * interativa, e era isso que estourava os 5 s.
   *
   * O `id` fica com o banco (`@default(cuid())`). Foi tentador gerar aqui
   * para devolver `productIds` na ordem, mas o cliente Prisma não expõe o
   * gerador de cuid, e inventar um id com `randomUUID()` mudaria o formato
   * dos ids desta tabela só quando inserida em lote — o tipo de detalhe que
   * ninguém lembra depois. O `globalProductId` devolve a mesma informação:
   * é único por loja, e todo produto criado aqui tem um.
   */
  const data: Prisma.ProductCreateManyInput[] = toCreate.map((global) => ({
    organizationId,
    categoryId: categoryIdFor(global.globalCategory),
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

    price: prices[global.id] ?? toNumber(global.suggestedPrice),
    promotionalPrice: null,
    cost: null,

    // Entra zerado: estoque é saldo real, não se presume no cadastro.
    stock: 0,
    minimumStock: 0,
    trackStock: true,

    active: true,
    available: true,
    type: global.suggestedType,
    position: position++,
    featured,
  }));

  // `skipDuplicates` fica no padrão (false) de propósito. O par
  // `@@unique([organizationId, slug])` já foi respeitado em memória por
  // `uniqueSlugFrom`; pular em silêncio esconderia uma colisão real,
  // devolvendo "criado" para um produto que não entrou. Assim, colisão
  // inesperada derruba a transação e a tela mostra o erro.
  const created =
    data.length > 0
      ? await tx.product.createManyAndReturn({
          data,
          select: { id: true, globalProductId: true },
        })
      : [];

  // Ordem normalizada pelo `globalProductId` — a mesma sequência de
  // `toCreate`, sem depender de o banco devolver as linhas na ordem em que
  // foram enviadas.
  const productIdByGlobalId = new Map(
    created.map((row) => [row.globalProductId, row.id] as const),
  );
  const productIds = toCreate
    .map((global) => productIdByGlobalId.get(global.id))
    .filter((id): id is string => Boolean(id));

  return {
    created: productIds.length,
    skipped: alreadyThere.size + missing,
    categoriesCreated,
    productIds,
  };
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
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}-${i}`) && i < 500) i++;
  return `${base}-${i}`;
}

/**
 * Quais dos globais escolhidos a loja já tem. A UI usa para marcar
 * "já no seu catálogo" em vez de deixar o lojista clicar e não acontecer
 * nada.
 */
export async function getOwnedGlobalProductIds(
  organizationId: string,
  globalProductIds: string[],
): Promise<string[]> {
  if (globalProductIds.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { organizationId, globalProductId: { in: globalProductIds } },
    select: { globalProductId: true },
  });
  return rows.map((r) => r.globalProductId).filter((id): id is string => Boolean(id));
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


