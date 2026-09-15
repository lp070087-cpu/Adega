import type { BusinessType } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TAXONOMIA DO CATÁLOGO GLOBAL
 * -----------------------------------------------------------------------
 * Esta é a espinha dorsal da BIBLIOTECA DA PLATAFORMA: as categorias e
 * subcategorias que toda loja enxerga no passo "escolher produtos".
 *
 * Importante: isto NÃO é o catálogo de nenhuma loja. É o vocabulário
 * comum. O que a loja vende nasce depois, como Product.
 *
 * A árvore aqui espelha exatamente a estrutura de pastas de
 * public/catalog/ — `path` é o caminho da imagem dentro do acervo.
 * ═══════════════════════════════════════════════════════════════════════
 */

type GlobalLeafSeed = {
  readonly slug: string;
  readonly name: string;
  readonly icon: string;
};

export type GlobalCategorySeed = {
  readonly slug: string;
  readonly name: string;
  /** Caminho no acervo: "bebidas/cervejas". Vazio na raiz. */
  readonly path: string;
  readonly icon: string;
  readonly children?: readonly GlobalLeafSeed[];
};

/**
 * A árvore é `as const` de propósito.
 *
 * Isso preserva os slugs como tipos literais, e é o que permite ao
 * compilador recusar um produto gravado numa pasta que não existe: o
 * campo `c` de cada produto da biblioteca é tipado como a união dos
 * slugs-folha desta árvore. Errar o nome aqui vira erro de compilação,
 * não um card com emoji em produção.
 */
export const GLOBAL_CATEGORY_TREE = [
  {
    slug: 'bebidas',
    name: 'Bebidas',
    path: 'bebidas',
    icon: '🥤',
    children: [
      { slug: 'cervejas', name: 'Cervejas', icon: '🍺' },
      { slug: 'refrigerantes', name: 'Refrigerantes', icon: '🥤' },
      { slug: 'energeticos', name: 'Energéticos', icon: '⚡' },
      { slug: 'aguas', name: 'Águas', icon: '💧' },
      { slug: 'sucos', name: 'Sucos', icon: '🧃' },
      { slug: 'drinks-prontos', name: 'Drinks prontos', icon: '🍹' },
      { slug: 'whisky', name: 'Whisky', icon: '🥃' },
      { slug: 'vodka', name: 'Vodka', icon: '🍸' },
      { slug: 'gin', name: 'Gin', icon: '🍸' },
      { slug: 'vinho', name: 'Vinhos', icon: '🍷' },
      { slug: 'espumantes', name: 'Espumantes', icon: '🍾' },
      { slug: 'cachaca', name: 'Cachaça', icon: '🥃' },
      { slug: 'chopp', name: 'Chopp', icon: '🍺' },
    ],
  },
  {
    slug: 'alimentos',
    name: 'Alimentos',
    path: 'alimentos',
    icon: '🍔',
    children: [
      { slug: 'hamburgueres', name: 'Hambúrgueres', icon: '🍔' },
      { slug: 'pizzas', name: 'Pizzas', icon: '🍕' },
      { slug: 'hot-dog', name: 'Hot dog', icon: '🌭' },
      { slug: 'porcoes', name: 'Porções', icon: '🍟' },
      { slug: 'salgados', name: 'Salgados', icon: '🥟' },
      { slug: 'sobremesas', name: 'Sobremesas', icon: '🍨' },
      { slug: 'combos', name: 'Combos', icon: '🎁' },
      { slug: 'acompanhamentos', name: 'Acompanhamentos', icon: '🍚' },
    ],
  },
  {
    slug: 'conveniencia',
    name: 'Conveniência',
    path: 'conveniencia',
    icon: '🛒',
    children: [
      { slug: 'chocolates', name: 'Chocolates', icon: '🍫' },
      { slug: 'salgadinhos', name: 'Salgadinhos', icon: '🍿' },
      { slug: 'doces', name: 'Doces', icon: '🍬' },
      { slug: 'gelo', name: 'Gelo', icon: '🧊' },
      { slug: 'mercearia', name: 'Mercearia', icon: '🥫' },
      { slug: 'outros', name: 'Outros', icon: '📦' },
    ],
  },
] as const satisfies readonly GlobalCategorySeed[];

/** Slug de uma categoria-folha do acervo: "cervejas", "refrigerantes"... */
export type GlobalLeafSlug = (typeof GLOBAL_CATEGORY_TREE)[number]['children'][number]['slug'];

/** Lista achatada de subcategorias — atalho para busca e validação. */
export const GLOBAL_SUBCATEGORIES = GLOBAL_CATEGORY_TREE.flatMap((root) =>
  (root.children ?? []).map((child) => ({
    ...child,
    path: `${root.slug}/${child.slug}`,
    parentSlug: root.slug,
    parentName: root.name,
  })),
);

export type GlobalSubcategory = (typeof GLOBAL_SUBCATEGORIES)[number];

/**
 * Caminho da pasta no acervo, a partir do slug da categoria — aceita
 * tanto raiz ("bebidas") quanto folha ("cervejas").
 */
export function globalCategoryPathBySlug(slug: string): string | null {
  const root = GLOBAL_CATEGORY_TREE.find((c) => c.slug === slug);
  if (root) return root.path;
  const child = GLOBAL_SUBCATEGORIES.find((c) => c.slug === slug);
  return child ? child.path : null;
}

/** Índice slug-folha → "bebidas/cervejas". Montado uma vez. */
const LEAF_PATH_BY_SLUG: Record<string, string> = Object.fromEntries(
  GLOBAL_SUBCATEGORIES.map((c) => [c.slug, c.path]),
);

/**
 * Caminho da pasta de uma categoria-folha, com o tipo garantido.
 *
 * É esta função que o seed usa para montar o caminho da imagem. Como o
 * parâmetro é `GlobalLeafSlug`, um produto gravado em `c: 'cerveja'`
 * (singular) não compila — em vez de gerar um card sem foto.
 */
export function leafFolderPath(slug: GlobalLeafSlug): string {
  return LEAF_PATH_BY_SLUG[slug];
}

// ─────────────────────────────────────────────────────────────────────
// CATEGORIAS DA LOJA SUGERIDAS POR SEGMENTO
// ─────────────────────────────────────────────────────────────────────
//
// No onboarding o lojista escolhe quais categorias trabalha. Estas são as
// sugestões que já vêm marcadas — ele pode desmarcar e adicionar outras.
//
// `globalPath` liga a categoria da loja à pasta do acervo de onde vêm as
// imagens sugeridas daquele grupo. Sem ele a sugestão mostraria emoji em
// vez de foto.

export type SuggestedCategory = {
  name: string;
  emoji: string;
  /** Pasta do acervo global: "bebidas/cervejas". */
  globalPath?: string;
  /** Marcada por padrão no onboarding. */
  recommended: boolean;
};

const CAT = {
  hamburgueres: { name: 'Hambúrgueres', emoji: '🍔', globalPath: 'alimentos/hamburgueres' },
  combos: { name: 'Combos', emoji: '🎁', globalPath: 'alimentos/combos' },
  porcoes: { name: 'Porções', emoji: '🍟', globalPath: 'alimentos/porcoes' },
  batatas: { name: 'Batatas', emoji: '🍟', globalPath: 'alimentos/porcoes' },
  bebidas: { name: 'Bebidas', emoji: '🥤', globalPath: 'bebidas/refrigerantes' },
  refrigerantes: { name: 'Refrigerantes', emoji: '🥤', globalPath: 'bebidas/refrigerantes' },
  cervejas: { name: 'Cervejas', emoji: '🍺', globalPath: 'bebidas/cervejas' },
  drinks: { name: 'Drinks', emoji: '🍹', globalPath: 'bebidas/drinks-prontos' },
  energeticos: { name: 'Energéticos', emoji: '⚡', globalPath: 'bebidas/energeticos' },
  aguas: { name: 'Águas', emoji: '💧', globalPath: 'bebidas/aguas' },
  sucos: { name: 'Sucos', emoji: '🧃', globalPath: 'bebidas/sucos' },
  vinhos: { name: 'Vinhos', emoji: '🍷', globalPath: 'bebidas/vinho' },
  destilados: { name: 'Destilados', emoji: '🥃', globalPath: 'bebidas/whisky' },
  pizzas: { name: 'Pizzas', emoji: '🍕', globalPath: 'alimentos/pizzas' },
  hotdog: { name: 'Hot dog', emoji: '🌭', globalPath: 'alimentos/hot-dog' },
  sobremesas: { name: 'Sobremesas', emoji: '🍨', globalPath: 'alimentos/sobremesas' },
  salgados: { name: 'Salgados', emoji: '🥟', globalPath: 'alimentos/salgados' },
  acompanhamentos: {
    name: 'Acompanhamentos',
    emoji: '🍚',
    globalPath: 'alimentos/acompanhamentos',
  },
  chocolates: { name: 'Chocolates', emoji: '🍫', globalPath: 'conveniencia/chocolates' },
  salgadinhos: { name: 'Salgadinhos', emoji: '🍿', globalPath: 'conveniencia/salgadinhos' },
  doces: { name: 'Doces', emoji: '🍬', globalPath: 'conveniencia/doces' },
  gelo: { name: 'Gelo', emoji: '🧊', globalPath: 'conveniencia/gelo' },
  mercearia: { name: 'Mercearia', emoji: '🥫', globalPath: 'conveniencia/mercearia' },
  acai: { name: 'Açaí', emoji: '🍇', globalPath: 'alimentos/sobremesas' },
  padaria: { name: 'Padaria', emoji: '🥖', globalPath: 'alimentos/salgados' },
  pratos: { name: 'Pratos', emoji: '🍽️', globalPath: 'alimentos/acompanhamentos' },
  massas: { name: 'Massas', emoji: '🍝', globalPath: 'alimentos/acompanhamentos' },
  japonesa: { name: 'Japonesa', emoji: '🍣', globalPath: 'alimentos/acompanhamentos' },
} as const satisfies Record<string, Omit<SuggestedCategory, 'recommended'>>;

function withRecommendation(
  items: Array<Omit<SuggestedCategory, 'recommended'>>,
  recommendedNames: string[],
): SuggestedCategory[] {
  return items.map((item) => ({ ...item, recommended: recommendedNames.includes(item.name) }));
}

/**
 * Sugestões por segmento.
 *
 * A ordem importa: as primeiras aparecem primeiro. As marcadas como
 * `recommended` já vêm assinaladas no onboarding — o lojista pode
 * desmarcar qualquer uma e acrescentar categorias fora da lista.
 */
export const SEGMENT_CATEGORIES: Record<BusinessType, SuggestedCategory[]> = {
  BURGER: withRecommendation(
    [
      CAT.hamburgueres,
      CAT.combos,
      CAT.batatas,
      CAT.porcoes,
      CAT.bebidas,
      CAT.sobremesas,
      // Extras que a hamburgueria costuma acabar adicionando:
      CAT.cervejas,
      CAT.drinks,
      CAT.energeticos,
      CAT.hotdog,
      CAT.pizzas,
    ],
    ['Hambúrgueres', 'Combos', 'Batatas', 'Bebidas'],
  ),

  PIZZA: withRecommendation(
    [
      CAT.pizzas,
      CAT.combos,
      CAT.refrigerantes,
      CAT.sucos,
      CAT.aguas,
      CAT.sobremesas,
      CAT.cervejas,
      CAT.vinhos,
      CAT.drinks,
      CAT.porcoes,
      CAT.hotdog,
    ],
    ['Pizzas', 'Combos', 'Refrigerantes', 'Sobremesas'],
  ),

  SNACK_BAR: withRecommendation(
    [
      CAT.hamburgueres,
      CAT.hotdog,
      CAT.salgados,
      CAT.porcoes,
      CAT.refrigerantes,
      CAT.sucos,
      CAT.cervejas,
      CAT.energeticos,
      CAT.sobremesas,
    ],
    ['Hambúrgueres', 'Hot dog', 'Porções', 'Refrigerantes'],
  ),

  RESTAURANT: withRecommendation(
    [
      CAT.pratos,
      CAT.massas,
      CAT.acompanhamentos,
      CAT.porcoes,
      CAT.refrigerantes,
      CAT.sucos,
      CAT.aguas,
      CAT.sobremesas,
      CAT.cervejas,
      CAT.vinhos,
      CAT.destilados,
      CAT.japonesa,
    ],
    ['Pratos', 'Acompanhamentos', 'Refrigerantes', 'Sobremesas'],
  ),

  BEVERAGE: withRecommendation(
    [
      CAT.cervejas,
      CAT.destilados,
      CAT.vinhos,
      CAT.drinks,
      CAT.energeticos,
      CAT.refrigerantes,
      CAT.aguas,
      CAT.gelo,
      CAT.salgadinhos,
      CAT.chocolates,
    ],
    ['Cervejas', 'Destilados', 'Refrigerantes', 'Gelo'],
  ),

  CONVENIENCE: withRecommendation(
    [
      CAT.refrigerantes,
      CAT.cervejas,
      CAT.energeticos,
      CAT.aguas,
      CAT.salgadinhos,
      CAT.chocolates,
      CAT.doces,
      CAT.gelo,
      CAT.mercearia,
      CAT.destilados,
    ],
    ['Refrigerantes', 'Cervejas', 'Salgadinhos', 'Chocolates'],
  ),

  ACAI: withRecommendation(
    [
      CAT.acai,
      CAT.sobremesas,
      CAT.porcoes,
      CAT.aguas,
      CAT.sucos,
      CAT.refrigerantes,
      CAT.energeticos,
      CAT.combos,
    ],
    ['Açaí', 'Sobremesas', 'Águas'],
  ),

  BAKERY: withRecommendation(
    [
      CAT.padaria,
      CAT.salgados,
      CAT.doces,
      CAT.sobremesas,
      CAT.refrigerantes,
      CAT.sucos,
      CAT.aguas,
      CAT.mercearia,
      CAT.chocolates,
    ],
    ['Padaria', 'Salgados', 'Refrigerantes'],
  ),

  MARKET: withRecommendation(
    [
      CAT.mercearia,
      CAT.refrigerantes,
      CAT.cervejas,
      CAT.destilados,
      CAT.aguas,
      CAT.sucos,
      CAT.energeticos,
      CAT.salgadinhos,
      CAT.chocolates,
      CAT.doces,
      CAT.gelo,
    ],
    ['Mercearia', 'Refrigerantes', 'Cervejas', 'Águas'],
  ),

  DARK_KITCHEN: withRecommendation(
    [
      CAT.hamburgueres,
      CAT.pizzas,
      CAT.porcoes,
      CAT.combos,
      CAT.sobremesas,
      CAT.refrigerantes,
      CAT.sucos,
      CAT.cervejas,
    ],
    ['Hambúrgueres', 'Pizzas', 'Porções', 'Refrigerantes'],
  ),
};

export function suggestedCategories(businessType: BusinessType): SuggestedCategory[] {
  return SEGMENT_CATEGORIES[businessType] ?? SEGMENT_CATEGORIES.SNACK_BAR;
}

/**
 * Categorias sugeridas com o estilo do restaurante JÁ aplicado.
 *
 * O estilo ACRESCENTA, nunca remove: a pergunta do passo 3.3 é para afinar
 * a sugestão, não para limitar o cardápio. Vive aqui — e não na action nem
 * na tela — para os dois lados usarem a mesma regra; quando cada um tinha
 * a sua cópia, a lista mostrada e a lista gravada podiam divergir.
 */
export function suggestedCategoriesFor(
  businessType: BusinessType | null | undefined,
  restaurantStyle?: RestaurantStyle | null,
): SuggestedCategory[] {
  if (!businessType) return [];

  const base = suggestedCategories(businessType);
  if (businessType !== 'RESTAURANT' || !restaurantStyle) return base;

  const seen = new Set(base.map((c) => c.name));
  const merged = [...base];
  for (const item of styleExtraCategories(restaurantStyle)) {
    if (seen.has(item.name)) continue;
    merged.push(item);
    seen.add(item.name);
  }
  return merged;
}

// ─────────────────────────────────────────────────────────────────────
// ESTILO DO RESTAURANTE
// ─────────────────────────────────────────────────────────────────────
//
// Pergunta extra só para RESTAURANT. Serve para afinar a sugestão de
// categorias e produtos — não limita nada: o lojista continua livre para
// vender o que quiser. Guardado em Organization.settings.

export type RestaurantStyle =
  | 'BRASILEIRA'
  | 'MARMITEX'
  | 'EXECUTIVO'
  | 'CHURRASCO'
  | 'MASSAS'
  | 'JAPONESA'
  | 'ARABE'
  | 'MEXICANA'
  | 'SAUDAVEL'
  | 'VARIADO'
  | 'OUTRO';

export const RESTAURANT_STYLES: Array<{
  value: RestaurantStyle;
  label: string;
  emoji: string;
  /** Categorias extras que este estilo costuma pedir. */
  extraCategories: string[];
}> = [
  { value: 'BRASILEIRA', label: 'Brasileira', emoji: '🍛', extraCategories: ['Pratos', 'Acompanhamentos'] },
  { value: 'MARMITEX', label: 'Marmitex', emoji: '🥡', extraCategories: ['Pratos', 'Acompanhamentos'] },
  { value: 'EXECUTIVO', label: 'Executivo', emoji: '🍱', extraCategories: ['Pratos', 'Acompanhamentos'] },
  { value: 'CHURRASCO', label: 'Churrasco', emoji: '🥩', extraCategories: ['Pratos', 'Porções'] },
  { value: 'MASSAS', label: 'Massas', emoji: '🍝', extraCategories: ['Massas', 'Pratos'] },
  { value: 'JAPONESA', label: 'Japonesa', emoji: '🍣', extraCategories: ['Japonesa', 'Porções'] },
  { value: 'ARABE', label: 'Árabe', emoji: '🥙', extraCategories: ['Pratos', 'Porções'] },
  { value: 'MEXICANA', label: 'Mexicana', emoji: '🌮', extraCategories: ['Pratos', 'Porções'] },
  { value: 'SAUDAVEL', label: 'Saudável', emoji: '🥗', extraCategories: ['Pratos', 'Sucos'] },
  { value: 'VARIADO', label: 'Variado', emoji: '🍽️', extraCategories: ['Pratos', 'Massas'] },
  { value: 'OUTRO', label: 'Outro', emoji: '✳️', extraCategories: [] },
];

export const RESTAURANT_STYLE_LABEL: Record<RestaurantStyle, string> = RESTAURANT_STYLES.reduce(
  (acc, style) => ({ ...acc, [style.value]: style.label }),
  {} as Record<RestaurantStyle, string>,
);

/** Categorias extras do estilo escolhido, já no formato de sugestão. */
export function styleExtraCategories(style: RestaurantStyle | null): SuggestedCategory[] {
  if (!style) return [];
  const found = RESTAURANT_STYLES.find((s) => s.value === style);
  if (!found) return [];

  const all = SEGMENT_CATEGORIES.RESTAURANT;
  return found.extraCategories
    .map((name) => all.find((c) => c.name === name))
    .filter((c): c is SuggestedCategory => Boolean(c))
    .map((c) => ({ ...c, recommended: true }));
}
