import { leafFolderPath, type GlobalLeafSlug } from './global-catalog';

/**
 * Slug local, sem dependência externa.
 *
 * Este arquivo é lido pelo seed (`tsx prisma/seed.ts`), que roda fora do
 * bundler do Next. Importar `@/lib/utils` aqui arrastaria clsx e
 * tailwind-merge — e o alias `@/` — para dentro de um script de linha de
 * comando, sem necessidade. São sete linhas de código; o custo de repetir
 * é menor que o de amarrar dado puro a duas bibliotecas de UI.
 */
function slug(input: string): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ºª]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BIBLIOTECA GLOBAL — conteúdo
 * -----------------------------------------------------------------------
 * Os produtos que a plataforma oferece para TODOS os segmentos.
 *
 * ── Sobre as imagens ──
 * Nenhum arquivo de imagem é criado ou baixado por este código. O campo
 * `image` fica `null` em quase tudo de propósito: o acervo real está
 * sendo montado à parte (public/catalog/...).
 *
 * Quando `image` é null, o sistema procura o arquivo pela CONVENÇÃO:
 *
 *     public/catalog/<categoria>/<slug-do-produto>.{webp,jpg,jpeg,png}
 *
 * Ou seja: baixar "skol-lata-350ml.webp" para
 * public/catalog/bebidas/cervejas/ já faz a foto aparecer, sem rodar
 * nenhuma migração. Enquanto o arquivo não existe, o item mostra o emoji.
 *
 * Se o arquivo tiver nome fora do padrão, aí sim preencha `image` com o
 * caminho relativo exato — é o único caso em que o banco precisa saber.
 *
 * ── Sobre a duplicação entre segmentos ──
 * Cada produto aparece UMA vez, com a lista de segmentos onde é
 * recomendado. Coca-Cola 350ml vale para hamburgueria, pizzaria,
 * restaurante, mercado e conveniência — e continua sendo uma linha só.
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Segmento de estabelecimento.
 *
 * Espelha o enum BusinessType do Prisma. Declarado aqui como união de
 * strings literais, e não importado de @prisma/client, para que este
 * arquivo continue sendo dado puro — importável por seed, script de
 * auditoria ou qualquer ferramenta sem arrastar o client do banco.
 * A checagem de que os dois lados batem fica no seed, em tempo de
 * compilação, via `satisfies`.
 */
export type Segment =
  | 'BEVERAGE'
  | 'BURGER'
  | 'SNACK_BAR'
  | 'PIZZA'
  | 'ACAI'
  | 'RESTAURANT'
  | 'CONVENIENCE'
  | 'BAKERY'
  | 'MARKET'
  | 'DARK_KITCHEN';

/** Atalhos de segmento, para não repetir a lista inteira em cada linha. */
const S = {
  /** Bebidas em geral — o que praticamente todo mundo vende. */
  TODOS: [
    'BURGER', 'PIZZA', 'SNACK_BAR', 'RESTAURANT', 'BEVERAGE',
    'CONVENIENCE', 'ACAI', 'BAKERY', 'MARKET', 'DARK_KITCHEN',
  ],
  /** Bebida gelada: bar, conveniência, mercado, hamburgueria. */
  BEBIDA: [
    'BURGER', 'PIZZA', 'SNACK_BAR', 'RESTAURANT',
    'BEVERAGE', 'CONVENIENCE', 'MARKET', 'DARK_KITCHEN',
  ],
  /** Álcool: onde existe venda de bebida. */
  ALCOOL: ['BEVERAGE', 'CONVENIENCE', 'MARKET', 'RESTAURANT', 'PIZZA', 'BURGER'],
  /** Destilado premium — loja de bebidas e mercado. */
  DESTILADO: ['BEVERAGE', 'MARKET', 'CONVENIENCE'],
  /** Vinho e espumante. */
  VINHO: ['BEVERAGE', 'MARKET', 'RESTAURANT'],
  /** Comida de bar. */
  PETISCO: ['BEVERAGE', 'CONVENIENCE', 'MARKET', 'SNACK_BAR', 'BURGER'],
  /** Conveniência pura. */
  CONV: ['CONVENIENCE', 'BEVERAGE', 'MARKET'],
  /** Padaria / lanchonete / conveniência. */
  PADARIA: ['BAKERY', 'SNACK_BAR', 'CONVENIENCE', 'MARKET'],
  /** Açaiteria — e quem vende açaí de sobremesa. */
  ACAI: ['ACAI', 'SNACK_BAR', 'CONVENIENCE', 'DARK_KITCHEN'],
  /** Restaurante e afins. */
  COMIDA: ['RESTAURANT', 'BURGER', 'SNACK_BAR', 'PIZZA', 'DARK_KITCHEN', 'MARKET'],
} satisfies Record<string, Segment[]>;

export type GlobalProductSeed = {
  /**
   * Slug da categoria-folha do acervo: 'cervejas', 'refrigerantes'...
   * Tipado pela árvore real — pasta inexistente não compila.
   */
  c: GlobalLeafSlug;
  /** Nome comercial, como o cliente conhece. */
  n: string;
  /** Marca/fabricante. */
  b: string;
  /** Reserva visual enquanto não há arquivo no acervo. */
  e: string;
  /** Volume/quantidade. */
  v?: number;
  /** Unidade do volume: ml, L, g, kg, un. */
  u?: string;
  /** Fardo/lastro. 1 = unidade solta. */
  k?: number;
  /** Preço apenas SUGERIDO — quem define o preço é cada loja. */
  p?: number;
  /** Segmentos recomendados. */
  s: Segment[];
  /**
   * Caminho exato da imagem, SÓ quando o nome do arquivo foge da
   * convenção <categoria>/<slug>.{ext}. Caso contrário, deixe de fora.
   */
  i?: string;
};

/**
 * ═══ CERVEJAS ═══
 * Presentes em praticamente todo segmento que vende bebida gelada.
 */
const CERVEJAS: GlobalProductSeed[] = [
  { c: 'cervejas', n: 'Skol Lata 350ml', b: 'Skol', e: '🍺', v: 350, u: 'ml', p: 4.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Skol Garrafa 600ml', b: 'Skol', e: '🍺', v: 600, u: 'ml', p: 8.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Skol Litrão 1L', b: 'Skol', e: '🍺', v: 1, u: 'L', p: 12.9, s: S.BEBIDA },
  { c: 'cervejas', n: 'Skol Fardo 12 Latas 350ml', b: 'Skol', e: '🍺', v: 350, u: 'ml', k: 12, p: 47.9, s: S.CONV },
  { c: 'cervejas', n: 'Brahma Chopp Lata 350ml', b: 'Brahma', e: '🍺', v: 350, u: 'ml', p: 4.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Brahma Chopp Garrafa 600ml', b: 'Brahma', e: '🍺', v: 600, u: 'ml', p: 8.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Brahma Duplo Malte Lata 350ml', b: 'Brahma', e: '🍺', v: 350, u: 'ml', p: 5.29, s: S.BEBIDA },
  { c: 'cervejas', n: 'Brahma Fardo 12 Latas 350ml', b: 'Brahma', e: '🍺', v: 350, u: 'ml', k: 12, p: 47.9, s: S.CONV },
  { c: 'cervejas', n: 'Antarctica Pilsen Lata 350ml', b: 'Antarctica', e: '🍺', v: 350, u: 'ml', p: 4.29, s: S.BEBIDA },
  { c: 'cervejas', n: 'Antarctica Boa Lata 350ml', b: 'Antarctica', e: '🍺', v: 350, u: 'ml', p: 5.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Antarctica Sub Zero Lata 350ml', b: 'Antarctica', e: '🍺', v: 350, u: 'ml', p: 5.19, s: S.BEBIDA },
  { c: 'cervejas', n: 'Original Lata 350ml', b: 'Original', e: '🍺', v: 350, u: 'ml', p: 5.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Original Garrafa 600ml', b: 'Original', e: '🍺', v: 600, u: 'ml', p: 10.9, s: S.BEBIDA },
  { c: 'cervejas', n: 'Heineken Lata 350ml', b: 'Heineken', e: '🍺', v: 350, u: 'ml', p: 6.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Heineken Long Neck 330ml', b: 'Heineken', e: '🍺', v: 330, u: 'ml', p: 8.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Heineken Garrafa 600ml', b: 'Heineken', e: '🍺', v: 600, u: 'ml', p: 14.9, s: S.BEBIDA },
  { c: 'cervejas', n: 'Heineken Fardo 12 Long Neck', b: 'Heineken', e: '🍺', v: 330, u: 'ml', k: 12, p: 84.9, s: S.CONV },
  { c: 'cervejas', n: 'Heineken 0.0 Lata 350ml', b: 'Heineken', e: '🍺', v: 350, u: 'ml', p: 6.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Budweiser Lata 350ml', b: 'Budweiser', e: '🍺', v: 350, u: 'ml', p: 5.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Budweiser Long Neck 330ml', b: 'Budweiser', e: '🍺', v: 330, u: 'ml', p: 7.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Stella Artois Long Neck 275ml', b: 'Stella Artois', e: '🍺', v: 275, u: 'ml', p: 8.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Stella Artois Lata 350ml', b: 'Stella Artois', e: '🍺', v: 350, u: 'ml', p: 7.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Corona Extra Long Neck 330ml', b: 'Corona', e: '🍺', v: 330, u: 'ml', p: 9.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Corona Extra Lata 350ml', b: 'Corona', e: '🍺', v: 350, u: 'ml', p: 8.29, s: S.BEBIDA },
  { c: 'cervejas', n: 'Spaten Long Neck 355ml', b: 'Spaten', e: '🍺', v: 355, u: 'ml', p: 8.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Spaten Lata 350ml', b: 'Spaten', e: '🍺', v: 350, u: 'ml', p: 6.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Colorado Appia 600ml', b: 'Colorado', e: '🍺', v: 600, u: 'ml', p: 24.9, s: S.ALCOOL },
  { c: 'cervejas', n: 'Colorado Ribeirão Lager 600ml', b: 'Colorado', e: '🍺', v: 600, u: 'ml', p: 24.9, s: S.ALCOOL },
  { c: 'cervejas', n: 'Colorado Demoiselle 600ml', b: 'Colorado', e: '🍺', v: 600, u: 'ml', p: 26.9, s: S.ALCOOL },
  { c: 'cervejas', n: 'Eisenbahn Pilsen 355ml', b: 'Eisenbahn', e: '🍺', v: 355, u: 'ml', p: 9.9, s: S.ALCOOL },
  { c: 'cervejas', n: 'Eisenbahn Weizenbier 500ml', b: 'Eisenbahn', e: '🍺', v: 500, u: 'ml', p: 14.9, s: S.ALCOOL },
  { c: 'cervejas', n: 'Baden Baden Cristal 355ml', b: 'Baden Baden', e: '🍺', v: 355, u: 'ml', p: 12.9, s: S.ALCOOL },
  { c: 'cervejas', n: 'Devassa Puro Malte Lata 350ml', b: 'Devassa', e: '🍺', v: 350, u: 'ml', p: 5.29, s: S.BEBIDA },
  { c: 'cervejas', n: 'Itaipava Lata 350ml', b: 'Itaipava', e: '🍺', v: 350, u: 'ml', p: 3.79, s: S.BEBIDA },
  { c: 'cervejas', n: 'Itaipava Garrafa 600ml', b: 'Itaipava', e: '🍺', v: 600, u: 'ml', p: 7.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Crystal Lata 350ml', b: 'Crystal', e: '🍺', v: 350, u: 'ml', p: 3.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Crystal Garrafa 600ml', b: 'Crystal', e: '🍺', v: 600, u: 'ml', p: 6.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Petra Lata 350ml', b: 'Petra', e: '🍺', v: 350, u: 'ml', p: 3.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Amstel Lata 350ml', b: 'Amstel', e: '🍺', v: 350, u: 'ml', p: 4.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Amstel Ultra Lata 350ml', b: 'Amstel', e: '🍺', v: 350, u: 'ml', p: 5.49, s: S.BEBIDA },
  { c: 'cervejas', n: 'Pepsi Lata 350ml', b: 'Pepsi', e: '🍺', v: 350, u: 'ml', p: 4.99, s: S.BEBIDA },
  { c: 'cervejas', n: 'Michelob Ultra Lata 350ml', b: 'Michelob', e: '🍺', v: 350, u: 'ml', p: 7.49, s: S.ALCOOL },
  { c: 'cervejas', n: 'Therezópolis Gold 355ml', b: 'Therezópolis', e: '🍺', v: 355, u: 'ml', p: 13.9, s: S.ALCOOL },
  { c: 'cervejas', n: 'Patagonia Amber Lager 355ml', b: 'Patagonia', e: '🍺', v: 355, u: 'ml', p: 12.9, s: S.ALCOOL },
  { c: 'cervejas', n: 'Blue Moon 355ml', b: 'Blue Moon', e: '🍺', v: 355, u: 'ml', p: 14.9, s: S.ALCOOL },
  { c: 'cervejas', n: 'Goose Island IPA 355ml', b: 'Goose Island', e: '🍺', v: 355, u: 'ml', p: 15.9, s: S.ALCOOL },
];

/** ═══ REFRIGERANTES ═══ */
const REFRIGERANTES: GlobalProductSeed[] = [
  { c: 'refrigerantes', n: 'Coca-Cola Lata 350ml', b: 'Coca-Cola', e: '🥤', v: 350, u: 'ml', p: 5.49, s: S.TODOS },
  { c: 'refrigerantes', n: 'Coca-Cola Garrafa 600ml', b: 'Coca-Cola', e: '🥤', v: 600, u: 'ml', p: 7.49, s: S.TODOS },
  { c: 'refrigerantes', n: 'Coca-Cola Garrafa 1L', b: 'Coca-Cola', e: '🥤', v: 1, u: 'L', p: 9.49, s: S.TODOS },
  { c: 'refrigerantes', n: 'Coca-Cola Garrafa 2L', b: 'Coca-Cola', e: '🥤', v: 2, u: 'L', p: 12.49, s: S.TODOS },
  { c: 'refrigerantes', n: 'Coca-Cola Zero Lata 350ml', b: 'Coca-Cola', e: '🥤', v: 350, u: 'ml', p: 5.49, s: S.TODOS },
  { c: 'refrigerantes', n: 'Coca-Cola Zero Garrafa 2L', b: 'Coca-Cola', e: '🥤', v: 2, u: 'L', p: 12.49, s: S.TODOS },
  { c: 'refrigerantes', n: 'Coca-Cola Fardo 12 Latas 350ml', b: 'Coca-Cola', e: '🥤', v: 350, u: 'ml', k: 12, p: 56.9, s: S.CONV },
  { c: 'refrigerantes', n: 'Guaraná Antarctica Lata 350ml', b: 'Antarctica', e: '🥤', v: 350, u: 'ml', p: 5.29, s: S.TODOS },
  { c: 'refrigerantes', n: 'Guaraná Antarctica Garrafa 2L', b: 'Antarctica', e: '🥤', v: 2, u: 'L', p: 11.9, s: S.TODOS },
  { c: 'refrigerantes', n: 'Guaraná Antarctica Zero Lata 350ml', b: 'Antarctica', e: '🥤', v: 350, u: 'ml', p: 5.29, s: S.TODOS },
  { c: 'refrigerantes', n: 'Guaraná Kuat Lata 350ml', b: 'Kuat', e: '🥤', v: 350, u: 'ml', p: 4.99, s: S.TODOS },
  { c: 'refrigerantes', n: 'Fanta Laranja Lata 350ml', b: 'Fanta', e: '🥤', v: 350, u: 'ml', p: 5.29, s: S.TODOS },
  { c: 'refrigerantes', n: 'Fanta Laranja Garrafa 2L', b: 'Fanta', e: '🥤', v: 2, u: 'L', p: 11.9, s: S.TODOS },
  { c: 'refrigerantes', n: 'Fanta Uva Lata 350ml', b: 'Fanta', e: '🥤', v: 350, u: 'ml', p: 5.29, s: S.TODOS },
  { c: 'refrigerantes', n: 'Sprite Lata 350ml', b: 'Sprite', e: '🥤', v: 350, u: 'ml', p: 5.29, s: S.TODOS },
  { c: 'refrigerantes', n: 'Sprite Garrafa 2L', b: 'Sprite', e: '🥤', v: 2, u: 'L', p: 11.9, s: S.TODOS },
  { c: 'refrigerantes', n: 'Schweppes Tônica Lata 350ml', b: 'Schweppes', e: '🥤', v: 350, u: 'ml', p: 6.29, s: S.BEBIDA },
  { c: 'refrigerantes', n: 'Schweppes Citrus Lata 350ml', b: 'Schweppes', e: '🥤', v: 350, u: 'ml', p: 6.29, s: S.BEBIDA },
  { c: 'refrigerantes', n: 'Pepsi Lata 350ml', b: 'Pepsi', e: '🥤', v: 350, u: 'ml', p: 5.29, s: S.TODOS },
  { c: 'refrigerantes', n: 'Pepsi Garrafa 2L', b: 'Pepsi', e: '🥤', v: 2, u: 'L', p: 11.9, s: S.TODOS },
  { c: 'refrigerantes', n: 'Sukita Laranja Lata 350ml', b: 'Sukita', e: '🥤', v: 350, u: 'ml', p: 4.99, s: S.TODOS },
  { c: 'refrigerantes', n: 'Dolly Guaraná Lata 350ml', b: 'Dolly', e: '🥤', v: 350, u: 'ml', p: 3.99, s: S.TODOS },
  { c: 'refrigerantes', n: 'Dolly Limão Lata 350ml', b: 'Dolly', e: '🥤', v: 350, u: 'ml', p: 3.99, s: S.TODOS },
  { c: 'refrigerantes', n: 'Tubaína Lata 350ml', b: 'Tubaína', e: '🥤', v: 350, u: 'ml', p: 4.49, s: S.TODOS },
  { c: 'refrigerantes', n: 'Guaraná Jesus Lata 350ml', b: 'Guaraná Jesus', e: '🥤', v: 350, u: 'ml', p: 5.49, s: S.TODOS },
];

/** ═══ ENERGÉTICOS ═══ */
const ENERGETICOS: GlobalProductSeed[] = [
  { c: 'energeticos', n: 'Red Bull Lata 250ml', b: 'Red Bull', e: '⚡', v: 250, u: 'ml', p: 10.9, s: S.CONV },
  { c: 'energeticos', n: 'Red Bull Lata 355ml', b: 'Red Bull', e: '⚡', v: 355, u: 'ml', p: 13.9, s: S.CONV },
  { c: 'energeticos', n: 'Red Bull Sugarfree 250ml', b: 'Red Bull', e: '⚡', v: 250, u: 'ml', p: 10.9, s: S.CONV },
  { c: 'energeticos', n: 'Red Bull Tropical 250ml', b: 'Red Bull', e: '⚡', v: 250, u: 'ml', p: 10.9, s: S.CONV },
  { c: 'energeticos', n: 'Monster Energy Lata 473ml', b: 'Monster', e: '⚡', v: 473, u: 'ml', p: 12.9, s: S.CONV },
  { c: 'energeticos', n: 'Monster Ultra Lata 473ml', b: 'Monster', e: '⚡', v: 473, u: 'ml', p: 12.9, s: S.CONV },
  { c: 'energeticos', n: 'Monster Mango Loco 473ml', b: 'Monster', e: '⚡', v: 473, u: 'ml', p: 12.9, s: S.CONV },
  { c: 'energeticos', n: 'TNT Energy Drink Lata 269ml', b: 'TNT', e: '⚡', v: 269, u: 'ml', p: 6.49, s: S.CONV },
  { c: 'energeticos', n: 'Vibez Energy Drink 269ml', b: 'Vibez', e: '⚡', v: 269, u: 'ml', p: 5.99, s: S.CONV },
  { c: 'energeticos', n: 'Fusion Energy Drink 269ml', b: 'Fusion', e: '⚡', v: 269, u: 'ml', p: 5.49, s: S.CONV },
  { c: 'energeticos', n: 'Baly Energy Drink 500ml', b: 'Baly', e: '⚡', v: 500, u: 'ml', p: 7.99, s: S.CONV },
  { c: 'energeticos', n: 'Speed Energy Drink 269ml', b: 'Speed', e: '⚡', v: 269, u: 'ml', p: 5.29, s: S.CONV },
];

/** ═══ ÁGUAS ═══ */
const AGUAS: GlobalProductSeed[] = [
  { c: 'aguas', n: 'Água Mineral Crystal 500ml', b: 'Crystal', e: '💧', v: 500, u: 'ml', p: 2.99, s: S.TODOS },
  { c: 'aguas', n: 'Água Mineral Crystal 1,5L', b: 'Crystal', e: '💧', v: 1.5, u: 'L', p: 4.49, s: S.TODOS },
  { c: 'aguas', n: 'Água Mineral Crystal 5L', b: 'Crystal', e: '💧', v: 5, u: 'L', p: 9.9, s: S.CONV },
  { c: 'aguas', n: 'Água com Gás Crystal 500ml', b: 'Crystal', e: '💧', v: 500, u: 'ml', p: 3.49, s: S.TODOS },
  { c: 'aguas', n: 'Água Mineral Bonafont 500ml', b: 'Bonafont', e: '💧', v: 500, u: 'ml', p: 3.29, s: S.TODOS },
  { c: 'aguas', n: 'Água Mineral Bonafont 1,5L', b: 'Bonafont', e: '💧', v: 1.5, u: 'L', p: 5.29, s: S.TODOS },
  { c: 'aguas', n: 'Água Tônica Antarctica Lata 350ml', b: 'Antarctica', e: '💧', v: 350, u: 'ml', p: 5.29, s: S.BEBIDA },
  { c: 'aguas', n: 'Água de Coco Sococo 200ml', b: 'Sococo', e: '🥥', v: 200, u: 'ml', p: 6.49, s: S.TODOS },
  { c: 'aguas', n: 'Água de Coco Kero 1L', b: 'Kero', e: '🥥', v: 1, u: 'L', p: 13.9, s: S.CONV },
];

/** ═══ SUCOS ═══ */
const SUCOS: GlobalProductSeed[] = [
  { c: 'sucos', n: 'Suco Del Valle Uva 1L', b: 'Del Valle', e: '🧃', v: 1, u: 'L', p: 8.49, s: S.TODOS },
  { c: 'sucos', n: 'Suco Del Valle Laranja 1L', b: 'Del Valle', e: '🧃', v: 1, u: 'L', p: 8.49, s: S.TODOS },
  { c: 'sucos', n: 'Suco Del Valle Maracujá 1L', b: 'Del Valle', e: '🧃', v: 1, u: 'L', p: 8.49, s: S.TODOS },
  { c: 'sucos', n: 'Suco Del Valle Pêssego 1L', b: 'Del Valle', e: '🧃', v: 1, u: 'L', p: 8.49, s: S.TODOS },
  { c: 'sucos', n: 'Suco Del Valle Kapo Uva 200ml', b: 'Kapo', e: '🧃', v: 200, u: 'ml', p: 2.49, s: S.TODOS },
  { c: 'sucos', n: 'Suco Kapo Laranja 200ml', b: 'Kapo', e: '🧃', v: 200, u: 'ml', p: 2.49, s: S.TODOS },
  { c: 'sucos', n: 'Suco Natural One Laranja 900ml', b: 'Natural One', e: '🧃', v: 900, u: 'ml', p: 14.9, s: S.TODOS },
  { c: 'sucos', n: 'Suco Natural One Limão 900ml', b: 'Natural One', e: '🧃', v: 900, u: 'ml', p: 14.9, s: S.TODOS },
  { c: 'sucos', n: 'Suco Prats Uva 900ml', b: 'Prats', e: '🧃', v: 900, u: 'ml', p: 15.9, s: S.TODOS },
  { c: 'sucos', n: 'Suco Maguary Maracujá 1L', b: 'Maguary', e: '🧃', v: 1, u: 'L', p: 9.49, s: S.TODOS },
  { c: 'sucos', n: 'Néctar Sufresh Pêssego 1L', b: 'Sufresh', e: '🧃', v: 1, u: 'L', p: 7.49, s: S.TODOS },
  { c: 'sucos', n: 'Limonada Pronta Natural One 900ml', b: 'Natural One', e: '🍋', v: 900, u: 'ml', p: 15.9, s: S.TODOS },
];

/** ═══ DRINKS PRONTOS ═══ */
const DRINKS: GlobalProductSeed[] = [
  { c: 'drinks-prontos', n: 'Ice Smirnoff Original 275ml', b: 'Smirnoff', e: '🍹', v: 275, u: 'ml', p: 8.49, s: S.CONV },
  { c: 'drinks-prontos', n: 'Ice Smirnoff Green Apple 275ml', b: 'Smirnoff', e: '🍹', v: 275, u: 'ml', p: 8.49, s: S.CONV },
  { c: 'drinks-prontos', n: 'Ice Smirnoff Pink 275ml', b: 'Smirnoff', e: '🍹', v: 275, u: 'ml', p: 8.49, s: S.CONV },
  { c: 'drinks-prontos', n: 'Ice Smirnoff Mango 275ml', b: 'Smirnoff', e: '🍹', v: 275, u: 'ml', p: 8.49, s: S.CONV },
  { c: 'drinks-prontos', n: 'Ice Smirnoff Fardo 6 Unidades', b: 'Smirnoff', e: '🍹', v: 275, u: 'ml', k: 6, p: 47.9, s: S.CONV },
  { c: 'drinks-prontos', n: 'Skol Beats Senses 269ml', b: 'Skol', e: '🍹', v: 269, u: 'ml', p: 7.49, s: S.CONV },
  { c: 'drinks-prontos', n: 'Skol Beats Tropical 269ml', b: 'Skol', e: '🍹', v: 269, u: 'ml', p: 7.49, s: S.CONV },
  { c: 'drinks-prontos', n: 'Skol Beats Senorial 269ml', b: 'Skol', e: '🍹', v: 269, u: 'ml', p: 7.49, s: S.CONV },
  { c: 'drinks-prontos', n: 'Corona Sun Brew 330ml', b: 'Corona', e: '🍹', v: 330, u: 'ml', p: 9.9, s: S.ALCOOL },
  { c: 'drinks-prontos', n: 'Stella Artois Cidra 275ml', b: 'Stella Artois', e: '🍹', v: 275, u: 'ml', p: 9.49, s: S.ALCOOL },
  { c: 'drinks-prontos', n: 'Vinho Branco Suave Cantinho 750ml', b: 'Cantinho', e: '🍹', v: 750, u: 'ml', p: 14.9, s: S.VINHO },
  { c: 'drinks-prontos', n: 'Caipirinha Pronta Sagatiba 275ml', b: 'Sagatiba', e: '🍹', v: 275, u: 'ml', p: 9.9, s: S.CONV },
  { c: 'drinks-prontos', n: 'Gin Tônica Pronta Bombay 275ml', b: 'Bombay', e: '🍸', v: 275, u: 'ml', p: 12.9, s: S.CONV },
  { c: 'drinks-prontos', n: 'Whisky Cola Pronto Jack 275ml', b: 'Jack Daniel’s', e: '🥃', v: 275, u: 'ml', p: 14.9, s: S.CONV },
];

/** ═══ WHISKY ═══ */
const WHISKY: GlobalProductSeed[] = [
  { c: 'whisky', n: 'Whisky Red Label 1L', b: 'Johnnie Walker', e: '🥃', v: 1, u: 'L', p: 129.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Red Label 750ml', b: 'Johnnie Walker', e: '🥃', v: 750, u: 'ml', p: 99.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Black Label 1L', b: 'Johnnie Walker', e: '🥃', v: 1, u: 'L', p: 219.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Black Label 750ml', b: 'Johnnie Walker', e: '🥃', v: 750, u: 'ml', p: 179.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Jack Daniel’s Old No.7 1L', b: 'Jack Daniel’s', e: '🥃', v: 1, u: 'L', p: 189.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Jack Daniel’s 750ml', b: 'Jack Daniel’s', e: '🥃', v: 750, u: 'ml', p: 159.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Jack Daniel’s Honey 1L', b: 'Jack Daniel’s', e: '🥃', v: 1, u: 'L', p: 199.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky White Horse 1L', b: 'White Horse', e: '🥃', v: 1, u: 'L', p: 89.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Chivas Regal 12 Anos 1L', b: 'Chivas', e: '🥃', v: 1, u: 'L', p: 259.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Buchanan’s Deluxe 1L', b: 'Buchanan’s', e: '🥃', v: 1, u: 'L', p: 179.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Ballantines Finest 1L', b: 'Ballantines', e: '🥃', v: 1, u: 'L', p: 119.9, s: S.DESTILADO },
  { c: 'whisky', n: 'Whisky Natu Nobilis 1L', b: 'Natu Nobilis', e: '🥃', v: 1, u: 'L', p: 39.9, s: S.DESTILADO },
];

/** ═══ VODKA ═══ */
const VODKA: GlobalProductSeed[] = [
  { c: 'vodka', n: 'Vodka Absolut Original 1L', b: 'Absolut', e: '🍸', v: 1, u: 'L', p: 119.9, s: S.DESTILADO },
  { c: 'vodka', n: 'Vodka Absolut Original 750ml', b: 'Absolut', e: '🍸', v: 750, u: 'ml', p: 99.9, s: S.DESTILADO },
  { c: 'vodka', n: 'Vodka Smirnoff 998ml', b: 'Smirnoff', e: '🍸', v: 998, u: 'ml', p: 49.9, s: S.DESTILADO },
  { c: 'vodka', n: 'Vodka Smirnoff 600ml', b: 'Smirnoff', e: '🍸', v: 600, u: 'ml', p: 36.9, s: S.DESTILADO },
  { c: 'vodka', n: 'Vodka Skyy 1L', b: 'Skyy', e: '🍸', v: 1, u: 'L', p: 89.9, s: S.DESTILADO },
  { c: 'vodka', n: 'Vodka Ciroc 750ml', b: 'Ciroc', e: '🍸', v: 750, u: 'ml', p: 219.9, s: S.DESTILADO },
  { c: 'vodka', n: 'Vodka Grey Goose 750ml', b: 'Grey Goose', e: '🍸', v: 750, u: 'ml', p: 239.9, s: S.DESTILADO },
  { c: 'vodka', n: 'Vodka Orloff 1L', b: 'Orloff', e: '🍸', v: 1, u: 'L', p: 39.9, s: S.DESTILADO },
];

/** ═══ GIN ═══ */
const GIN: GlobalProductSeed[] = [
  { c: 'gin', n: 'Gin Tanqueray London Dry 750ml', b: 'Tanqueray', e: '🍸', v: 750, u: 'ml', p: 149.9, s: S.DESTILADO },
  { c: 'gin', n: 'Gin Bombay Sapphire 750ml', b: 'Bombay Sapphire', e: '🍸', v: 750, u: 'ml', p: 139.9, s: S.DESTILADO },
  { c: 'gin', n: 'Gin Beefeater 750ml', b: 'Beefeater', e: '🍸', v: 750, u: 'ml', p: 119.9, s: S.DESTILADO },
  { c: 'gin', n: 'Gin Gordon’s London Dry 750ml', b: 'Gordon’s', e: '🍸', v: 750, u: 'ml', p: 89.9, s: S.DESTILADO },
  { c: 'gin', n: 'Gin Hendrick’s 750ml', b: 'Hendrick’s', e: '🍸', v: 750, u: 'ml', p: 249.9, s: S.DESTILADO },
  { c: 'gin', n: 'Gin Bulldog 750ml', b: 'Bulldog', e: '🍸', v: 750, u: 'ml', p: 129.9, s: S.DESTILADO },
  { c: 'gin', n: 'Gin Amázzoni 750ml', b: 'Amázzoni', e: '🍸', v: 750, u: 'ml', p: 159.9, s: S.DESTILADO },
  { c: 'gin', n: 'Gin Tônica Lata 350ml', b: 'Schweppes', e: '🍸', v: 350, u: 'ml', p: 7.49, s: S.CONV },
];

/** ═══ VINHOS ═══ */
const VINHOS: GlobalProductSeed[] = [
  { c: 'vinho', n: 'Vinho Tinto Periquita 750ml', b: 'Periquita', e: '🍷', v: 750, u: 'ml', p: 59.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Tinto Concha y Toro Reservado 750ml', b: 'Concha y Toro', e: '🍷', v: 750, u: 'ml', p: 44.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Tinto Casillero del Diablo 750ml', b: 'Casillero del Diablo', e: '🍷', v: 750, u: 'ml', p: 69.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Tinto Miolo Seleção 750ml', b: 'Miolo', e: '🍷', v: 750, u: 'ml', p: 39.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Tinto Salton Talento 750ml', b: 'Salton', e: '🍷', v: 750, u: 'ml', p: 54.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Tinto Pérgola 750ml', b: 'Pérgola', e: '🍷', v: 750, u: 'ml', p: 24.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Branco Casal Garcia 750ml', b: 'Casal Garcia', e: '🍷', v: 750, u: 'ml', p: 49.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Branco Concha y Toro 750ml', b: 'Concha y Toro', e: '🍷', v: 750, u: 'ml', p: 42.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Rosé Periquita 750ml', b: 'Periquita', e: '🍷', v: 750, u: 'ml', p: 54.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Rosé Miolo 750ml', b: 'Miolo', e: '🍷', v: 750, u: 'ml', p: 39.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Suave Sangue de Boi 750ml', b: 'Sangue de Boi', e: '🍷', v: 750, u: 'ml', p: 19.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Suave Quinta do Morgado 750ml', b: 'Quinta do Morgado', e: '🍷', v: 750, u: 'ml', p: 22.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Tinto Chileno Gato Negro 750ml', b: 'Gato Negro', e: '🍷', v: 750, u: 'ml', p: 39.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Português Vinho Verde 750ml', b: 'Casal Garcia', e: '🍷', v: 750, u: 'ml', p: 52.9, s: S.VINHO },
  { c: 'vinho', n: 'Vinho Tinto Argentino Trapiche 750ml', b: 'Trapiche', e: '🍷', v: 750, u: 'ml', p: 47.9, s: S.VINHO },
];

/** ═══ ESPUMANTES ═══ */
const ESPUMANTES: GlobalProductSeed[] = [
  { c: 'espumantes', n: 'Espumante Chandon Brut 750ml', b: 'Chandon', e: '🍾', v: 750, u: 'ml', p: 89.9, s: S.VINHO },
  { c: 'espumantes', n: 'Espumante Chandon Rosé 750ml', b: 'Chandon', e: '🍾', v: 750, u: 'ml', p: 94.9, s: S.VINHO },
  { c: 'espumantes', n: 'Espumante Salton Brut 750ml', b: 'Salton', e: '🍾', v: 750, u: 'ml', p: 44.9, s: S.VINHO },
  { c: 'espumantes', n: 'Espumante Salton Rosé 750ml', b: 'Salton', e: '🍾', v: 750, u: 'ml', p: 46.9, s: S.VINHO },
  { c: 'espumantes', n: 'Espumante Miolo Brut 750ml', b: 'Miolo', e: '🍾', v: 750, u: 'ml', p: 49.9, s: S.VINHO },
  { c: 'espumantes', n: 'Espumante Perrier-Jouët 750ml', b: 'Perrier-Jouët', e: '🍾', v: 750, u: 'ml', p: 499.9, s: S.VINHO },
  { c: 'espumantes', n: 'Espumante Freixenet Cordon Negro 750ml', b: 'Freixenet', e: '🍾', v: 750, u: 'ml', p: 79.9, s: S.VINHO },
  { c: 'espumantes', n: 'Espumante Prosecco Italiano 750ml', b: 'Villa Sandi', e: '🍾', v: 750, u: 'ml', p: 109.9, s: S.VINHO },
];

/** ═══ CACHAÇA ═══ */
const CACHAÇA: GlobalProductSeed[] = [
  { c: 'cachaca', n: 'Cachaça 51 965ml', b: '51', e: '🥃', v: 965, u: 'ml', p: 24.9, s: S.DESTILADO },
  { c: 'cachaca', n: 'Cachaça 51 600ml', b: '51', e: '🥃', v: 600, u: 'ml', p: 17.9, s: S.DESTILADO },
  { c: 'cachaca', n: 'Cachaça Velho Barreiro 965ml', b: 'Velho Barreiro', e: '🥃', v: 965, u: 'ml', p: 26.9, s: S.DESTILADO },
  { c: 'cachaca', n: 'Cachaça Ypióca Ouro 965ml', b: 'Ypióca', e: '🥃', v: 965, u: 'ml', p: 32.9, s: S.DESTILADO },
  { c: 'cachaca', n: 'Cachaça Salinas 965ml', b: 'Salinas', e: '🥃', v: 965, u: 'ml', p: 49.9, s: S.DESTILADO },
  { c: 'cachaca', n: 'Cachaça Seleta 965ml', b: 'Seleta', e: '🥃', v: 965, u: 'ml', p: 39.9, s: S.DESTILADO },
  { c: 'cachaca', n: 'Cachaça Leblon 750ml', b: 'Leblon', e: '🥃', v: 750, u: 'ml', p: 89.9, s: S.DESTILADO },
  { c: 'cachaca', n: 'Cachaça Artesanal Copa 750ml', b: 'Cachaça Copa', e: '🥃', v: 750, u: 'ml', p: 44.9, s: S.DESTILADO },
];

/** ═══ CHOPP ═══ */
const CHOPP: GlobalProductSeed[] = [
  { c: 'chopp', n: 'Chopp Brahma Barril 5L', b: 'Brahma', e: '🍺', v: 5, u: 'L', p: 89.9, s: S.BEBIDA },
  { c: 'chopp', n: 'Chopp Skol Barril 5L', b: 'Skol', e: '🍺', v: 5, u: 'L', p: 84.9, s: S.BEBIDA },
  { c: 'chopp', n: 'Chopp Heineken Barril 5L', b: 'Heineken', e: '🍺', v: 5, u: 'L', p: 139.9, s: S.BEBIDA },
  { c: 'chopp', n: 'Chopp Artesanal IPA Growler 1L', b: 'Artesanal', e: '🍺', v: 1, u: 'L', p: 34.9, s: S.BEBIDA },
  { c: 'chopp', n: 'Chopp Artesanal Pilsen Growler 1L', b: 'Artesanal', e: '🍺', v: 1, u: 'L', p: 29.9, s: S.BEBIDA },
];

/**
 * ═══ GELO ═══
 * Catálogo de gelo para adega e conveniência. Os pesos sobem de 1kg a
 * 10kg — o lojista escolhe o que faz sentido no delivery dele — e há
 * triturado (para drinks) e saborizado (para quem vende gelo como
 * produto de festa). O segmento BEVERAGE entra em TODAS as linhas: adega
 * é o principal canal de venda de gelo.
 */
const GELO: GlobalProductSeed[] = [
  { c: 'gelo', n: 'Gelo Tradicional 1kg', b: 'Gelo Norte', e: '🧊', v: 1, u: 'kg', p: 7.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo Tradicional 2kg', b: 'Gelo Norte', e: '🧊', v: 2, u: 'kg', p: 12.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo Tradicional 3kg', b: 'Gelo Norte', e: '🧊', v: 3, u: 'kg', p: 16.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo Tradicional 5kg', b: 'Gelo Norte', e: '🧊', v: 5, u: 'kg', p: 24.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo Tradicional 10kg', b: 'Gelo Norte', e: '🧊', v: 10, u: 'kg', p: 44.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo em Cubos 2kg', b: 'Gelo Norte', e: '🧊', v: 2, u: 'kg', p: 13.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo em Cubos 5kg', b: 'Gelo Norte', e: '🧊', v: 5, u: 'kg', p: 26.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo Triturado 2kg', b: 'Gelo Norte', e: '🧊', v: 2, u: 'kg', p: 13.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo Triturado 5kg', b: 'Gelo Norte', e: '🧊', v: 5, u: 'kg', p: 26.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo de Coco 1kg', b: 'Gelo Norte', e: '🧊', v: 1, u: 'kg', p: 9.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo Saborizado Limão 1kg', b: 'Gelo Norte', e: '🍋', v: 1, u: 'kg', p: 11.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo Saborizado Morango 1kg', b: 'Gelo Norte', e: '🍓', v: 1, u: 'kg', p: 11.9, s: S.CONV },
  { c: 'gelo', n: 'Gelo Saborizado Uva 1kg', b: 'Gelo Norte', e: '🍇', v: 1, u: 'kg', p: 11.9, s: S.CONV },
];

/** ═══ CHOCOLATES ═══ */
const CHOCOLATES: GlobalProductSeed[] = [
  { c: 'chocolates', n: 'Chocolate Lacta Ao Leite 80g', b: 'Lacta', e: '🍫', v: 80, u: 'g', p: 8.49, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Lacta Oreo 80g', b: 'Lacta', e: '🍫', v: 80, u: 'g', p: 8.99, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Lacta Diamante Negro 80g', b: 'Lacta', e: '🍫', v: 80, u: 'g', p: 8.49, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Lacta Shot 40g', b: 'Lacta', e: '🍫', v: 40, u: 'g', p: 5.49, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Nestlé Alpino 85g', b: 'Nestlé', e: '🍫', v: 85, u: 'g', p: 8.99, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Nestlé Prestígio 75g', b: 'Nestlé', e: '🍫', v: 75, u: 'g', p: 7.99, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Nestlé Crunch 85g', b: 'Nestlé', e: '🍫', v: 85, u: 'g', p: 7.99, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Garoto Talento Castanha 85g', b: 'Garoto', e: '🍫', v: 85, u: 'g', p: 8.99, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Garoto Serenata de Amor 80g', b: 'Garoto', e: '🍫', v: 80, u: 'g', p: 7.49, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Garoto Baton 80g', b: 'Garoto', e: '🍫', v: 80, u: 'g', p: 7.49, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Hershey’s Cookies 92g', b: 'Hershey’s', e: '🍫', v: 92, u: 'g', p: 9.49, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Ferrero Rocher 3 Unidades', b: 'Ferrero Rocher', e: '🍫', k: 3, p: 19.9, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Kinder Ovo 20g', b: 'Kinder', e: '🍫', v: 20, u: 'g', p: 9.9, s: S.CONV },
  { c: 'chocolates', n: 'Chocolate Bis Laka 100g', b: 'Lacta', e: '🍫', v: 100, u: 'g', p: 9.49, s: S.CONV },
];

/** ═══ SALGADINHOS ═══ */
const SALGADINHOS: GlobalProductSeed[] = [
  { c: 'salgadinhos', n: 'Batata Ruffles Original 100g', b: 'Ruffles', e: '🍿', v: 100, u: 'g', p: 11.9, s: S.CONV },
  { c: 'salgadinhos', n: 'Batata Ruffles Churrasco 100g', b: 'Ruffles', e: '🍿', v: 100, u: 'g', p: 11.9, s: S.CONV },
  { c: 'salgadinhos', n: 'Batata Pringles Original 104g', b: 'Pringles', e: '🍿', v: 104, u: 'g', p: 16.9, s: S.CONV },
  { c: 'salgadinhos', n: 'Batata Pringles Cheddar 104g', b: 'Pringles', e: '🍿', v: 104, u: 'g', p: 16.9, s: S.CONV },
  { c: 'salgadinhos', n: 'Salgadinho Doritos Queijo 140g', b: 'Doritos', e: '🍿', v: 140, u: 'g', p: 13.9, s: S.CONV },
  { c: 'salgadinhos', n: 'Salgadinho Cheetos Requeijão 140g', b: 'Cheetos', e: '🍿', v: 140, u: 'g', p: 12.9, s: S.CONV },
  { c: 'salgadinhos', n: 'Salgadinho Cheetos Parmesão 45g', b: 'Cheetos', e: '🍿', v: 45, u: 'g', p: 6.49, s: S.CONV },
  { c: 'salgadinhos', n: 'Salgadinho Fandangos Presunto 140g', b: 'Fandangos', e: '🍿', v: 140, u: 'g', p: 12.9, s: S.CONV },
  { c: 'salgadinhos', n: 'Amendoim Dori Torrado 100g', b: 'Dori', e: '🥜', v: 100, u: 'g', p: 7.49, s: S.CONV },
  { c: 'salgadinhos', n: 'Amendoim Japônes Dori 100g', b: 'Dori', e: '🥜', v: 100, u: 'g', p: 7.99, s: S.CONV },
  { c: 'salgadinhos', n: 'Castanha de Caju Dori 100g', b: 'Dori', e: '🥜', v: 100, u: 'g', p: 18.9, s: S.CONV },
  { c: 'salgadinhos', n: 'Pipoca de Micro-ondas Yoki 100g', b: 'Yoki', e: '🍿', v: 100, u: 'g', p: 8.49, s: S.CONV },
];

/** ═══ DOCES ═══ */
const DOCES: GlobalProductSeed[] = [
  { c: 'doces', n: 'Bala Fini Beijos 500g', b: 'Fini', e: '🍬', v: 500, u: 'g', p: 14.9, s: S.CONV },
  { c: 'doces', n: 'Bala Fini Ursinhos 80g', b: 'Fini', e: '🍬', v: 80, u: 'g', p: 5.99, s: S.CONV },
  { c: 'doces', n: 'Bala Fini Tubes 80g', b: 'Fini', e: '🍬', v: 80, u: 'g', p: 6.49, s: S.CONV },
  { c: 'doces', n: 'Bala Halls Menta 26g', b: 'Halls', e: '🍬', v: 26, u: 'g', p: 3.49, s: S.CONV },
  { c: 'doces', n: 'Chiclete Trident Menta 8g', b: 'Trident', e: '🍬', v: 8, u: 'g', p: 3.99, s: S.CONV },
  { c: 'doces', n: 'Chiclete Mentos Fruit 30g', b: 'Mentos', e: '🍬', v: 30, u: 'g', p: 4.49, s: S.CONV },
  { c: 'doces', n: 'Paçoca Amor 20g', b: 'Amor', e: '🍬', v: 20, u: 'g', p: 2.49, s: S.CONV },
  { c: 'doces', n: 'Pé de Moleque Yoki 30g', b: 'Yoki', e: '🍬', v: 30, u: 'g', p: 3.49, s: S.CONV },
  { c: 'doces', n: 'Doce de Leite Marilan 400g', b: 'Marilan', e: '🍬', v: 400, u: 'g', p: 12.9, s: S.CONV },
];

/** ═══ MERCEARIA ═══ */
const MERCEARIA: GlobalProductSeed[] = [
  { c: 'mercearia', n: 'Arroz Tio João Tipo 1 5kg', b: 'Tio João', e: '🥫', v: 5, u: 'kg', p: 27.9, s: S.CONV },
  { c: 'mercearia', n: 'Feijão Carioca Camil 1kg', b: 'Camil', e: '🥫', v: 1, u: 'kg', p: 8.49, s: S.CONV },
  { c: 'mercearia', n: 'Açúcar Refinado União 1kg', b: 'União', e: '🥫', v: 1, u: 'kg', p: 5.49, s: S.CONV },
  { c: 'mercearia', n: 'Café Torrado Melitta 500g', b: 'Melitta', e: '☕', v: 500, u: 'g', p: 21.9, s: S.CONV },
  { c: 'mercearia', n: 'Óleo de Soja Liza 900ml', b: 'Liza', e: '🥫', v: 900, u: 'ml', p: 8.99, s: S.CONV },
  { c: 'mercearia', n: 'Macarrão Instantâneo Nissin 80g', b: 'Nissin', e: '🍜', v: 80, u: 'g', p: 4.49, s: S.CONV },
  { c: 'mercearia', n: 'Molho de Tomate Quero 340g', b: 'Quero', e: '🥫', v: 340, u: 'g', p: 4.99, s: S.CONV },
  { c: 'mercearia', n: 'Leite Integral Italac 1L', b: 'Italac', e: '🥛', v: 1, u: 'L', p: 5.99, s: S.CONV },
  { c: 'mercearia', n: 'Pão de Forma Pullman 500g', b: 'Pullman', e: '🍞', v: 500, u: 'g', p: 9.49, s: S.CONV },
  { c: 'mercearia', n: 'Ovos Brancos Dúzia', b: 'Granja', e: '🥚', k: 12, p: 12.9, s: S.CONV },
  { c: 'mercearia', n: 'Papel Higiênico Neve 4 Rolos', b: 'Neve', e: '🧻', k: 4, p: 12.9, s: S.CONV },
  { c: 'mercearia', n: 'Guardanapo de Papel 50 Unidades', b: 'Scott', e: '🧻', k: 50, p: 4.99, s: S.CONV },
];

/** ═══ HAMBÚRGUERES ═══ */
const HAMBURGUERES: GlobalProductSeed[] = [
  { c: 'hamburgueres', n: 'X-Burger', b: 'Cozinha', e: '🍔', p: 24.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'X-Salada', b: 'Cozinha', e: '🍔', p: 26.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'X-Bacon', b: 'Cozinha', e: '🥓', p: 29.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'X-Tudo', b: 'Cozinha', e: '🍔', p: 34.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'X-Calabresa', b: 'Cozinha', e: '🍔', p: 28.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'X-Frango', b: 'Cozinha', e: '🍗', p: 25.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'X-Egg', b: 'Cozinha', e: '🍳', p: 27.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'X-Cheddar', b: 'Cozinha', e: '🧀', p: 30.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'Smash Burger Duplo', b: 'Cozinha', e: '🍔', p: 32.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'Veggie Burger', b: 'Cozinha', e: '🥬', p: 29.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'Hambúrguer Artesanal Costela', b: 'Cozinha', e: '🍔', p: 39.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'Hambúrguer Artesanal Picanha', b: 'Cozinha', e: '🍔', p: 42.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'X-Salada Duplo', b: 'Cozinha', e: '🍔', p: 36.9, s: S.COMIDA },
  { c: 'hamburgueres', n: 'X-Bacon Duplo', b: 'Cozinha', e: '🥓', p: 39.9, s: S.COMIDA },
];

/** ═══ PIZZAS ═══ */
const PIZZAS: GlobalProductSeed[] = [
  { c: 'pizzas', n: 'Pizza Calabresa', b: 'Cozinha', e: '🍕', p: 49.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Portuguesa', b: 'Cozinha', e: '🍕', p: 54.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Quatro Queijos', b: 'Cozinha', e: '🍕', p: 57.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Marguerita', b: 'Cozinha', e: '🍕', p: 49.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Mussarela', b: 'Cozinha', e: '🍕', p: 44.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Frango com Catupiry', b: 'Cozinha', e: '🍕', p: 56.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Pepperoni', b: 'Cozinha', e: '🍕', p: 57.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Bacon', b: 'Cozinha', e: '🍕', p: 56.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Vegetariana', b: 'Cozinha', e: '🥬', p: 52.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Doce Chocolate', b: 'Cozinha', e: '🍫', p: 44.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Dois Sabores', b: 'Cozinha', e: '🍕', p: 59.9, s: S.COMIDA },
  { c: 'pizzas', n: 'Pizza Napolitana', b: 'Cozinha', e: '🍕', p: 52.9, s: S.COMIDA },
];

/** ═══ HOT DOG ═══ */
const HOTDOG: GlobalProductSeed[] = [
  { c: 'hot-dog', n: 'Hot Dog Simples', b: 'Cozinha', e: '🌭', p: 15.9, s: S.COMIDA },
  { c: 'hot-dog', n: 'Hot Dog Completo', b: 'Cozinha', e: '🌭', p: 21.9, s: S.COMIDA },
  { c: 'hot-dog', n: 'Hot Dog com Cheddar', b: 'Cozinha', e: '🌭', p: 23.9, s: S.COMIDA },
  { c: 'hot-dog', n: 'Hot Dog Duplo', b: 'Cozinha', e: '🌭', p: 27.9, s: S.COMIDA },
  { c: 'hot-dog', n: 'Dogão na Chapa', b: 'Cozinha', e: '🌭', p: 25.9, s: S.COMIDA },
];

/** ═══ PORÇÕES ═══ */
const PORCOES: GlobalProductSeed[] = [
  { c: 'porcoes', n: 'Batata Frita Simples', b: 'Cozinha', e: '🍟', p: 19.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Batata Frita com Cheddar e Bacon', b: 'Cozinha', e: '🍟', p: 32.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Batata Frita Rústica', b: 'Cozinha', e: '🍟', p: 27.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Onion Rings', b: 'Cozinha', e: '🧅', p: 26.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Frango a Passarinho', b: 'Cozinha', e: '🍗', p: 44.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Isca de Frango Empanada', b: 'Cozinha', e: '🍗', p: 39.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Calabresa Acebolada', b: 'Cozinha', e: '🌭', p: 34.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Polenta Frita', b: 'Cozinha', e: '🍟', p: 24.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Mandioca Frita', b: 'Cozinha', e: '🍟', p: 27.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Picanha na Chapa', b: 'Cozinha', e: '🥩', p: 89.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Filé de Tilápia Empanado', b: 'Cozinha', e: '🐟', p: 59.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Camarão Empanado', b: 'Cozinha', e: '🍤', p: 79.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Bolinho de Bacalhau 6 Unidades', b: 'Cozinha', e: '🍤', k: 6, p: 44.9, s: S.COMIDA },
  { c: 'porcoes', n: 'Torresmo', b: 'Cozinha', e: '🥓', p: 34.9, s: S.COMIDA },
];

/** ═══ SALGADOS ═══ */
const SALGADOS: GlobalProductSeed[] = [
  { c: 'salgados', n: 'Coxinha de Frango', b: 'Cozinha', e: '🥟', p: 8.9, s: S.PADARIA },
  { c: 'salgados', n: 'Risoles de Carne', b: 'Cozinha', e: '🥟', p: 8.9, s: S.PADARIA },
  { c: 'salgados', n: 'Pastel de Carne', b: 'Cozinha', e: '🥟', p: 9.9, s: S.PADARIA },
  { c: 'salgados', n: 'Pastel de Queijo', b: 'Cozinha', e: '🧀', p: 9.9, s: S.PADARIA },
  { c: 'salgados', n: 'Pastel de Pizza', b: 'Cozinha', e: '🥟', p: 10.9, s: S.PADARIA },
  { c: 'salgados', n: 'Empada de Frango', b: 'Cozinha', e: '🥟', p: 9.9, s: S.PADARIA },
  { c: 'salgados', n: 'Esfiha de Carne', b: 'Cozinha', e: '🥟', p: 8.9, s: S.PADARIA },
  { c: 'salgados', n: 'Pão de Queijo', b: 'Cozinha', e: '🧀', p: 6.9, s: S.PADARIA },
  { c: 'salgados', n: 'Enroladinho de Salsicha', b: 'Cozinha', e: '🌭', p: 8.9, s: S.PADARIA },
  { c: 'salgados', n: 'Kibe Frito', b: 'Cozinha', e: '🥟', p: 9.9, s: S.PADARIA },
];

/** ═══ ACOMPANHAMENTOS ═══ */
const ACOMPANHAMENTOS: GlobalProductSeed[] = [
  { c: 'acompanhamentos', n: 'Arroz Branco', b: 'Cozinha', e: '🍚', p: 9.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Feijão Carioca', b: 'Cozinha', e: '🍚', p: 9.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Arroz com Feijão', b: 'Cozinha', e: '🍚', p: 14.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Farofa', b: 'Cozinha', e: '🍚', p: 7.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Salada Verde', b: 'Cozinha', e: '🥗', p: 12.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Vinagrete', b: 'Cozinha', e: '🥗', p: 6.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Purê de Batata', b: 'Cozinha', e: '🥔', p: 12.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Legumes Refogados', b: 'Cozinha', e: '🥦', p: 13.9, s: S.COMIDA },
];

/** ═══ MASSAS E PRATOS ═══ */
const PRATOS: GlobalProductSeed[] = [
  { c: 'acompanhamentos', n: 'Marmitex P', b: 'Cozinha', e: '🥡', p: 18.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Marmitex M', b: 'Cozinha', e: '🥡', p: 22.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Marmitex G', b: 'Cozinha', e: '🥡', p: 27.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Prato Executivo', b: 'Cozinha', e: '🍽️', p: 29.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Feijoada Completa', b: 'Cozinha', e: '🍲', p: 39.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Bife a Cavalo', b: 'Cozinha', e: '🥩', p: 44.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Frango Grelhado com Legumes', b: 'Cozinha', e: '🍗', p: 36.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Parmegiana de Frango', b: 'Cozinha', e: '🍗', p: 44.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Lasanha Bolonhesa', b: 'Cozinha', e: '🍝', p: 42.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Espaguete a Bolonhesa', b: 'Cozinha', e: '🍝', p: 36.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Fettuccine Alfredo', b: 'Cozinha', e: '🍝', p: 39.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Nhoque ao Sugo', b: 'Cozinha', e: '🍝', p: 37.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Temaki Salmão', b: 'Cozinha', e: '🍣', p: 29.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Combinado Sushi 20 Peças', b: 'Cozinha', e: '🍣', k: 20, p: 79.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Yakisoba de Frango', b: 'Cozinha', e: '🍜', p: 39.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Kafta com Arroz', b: 'Cozinha', e: '🥙', p: 36.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Escondidinho de Carne', b: 'Cozinha', e: '🍲', p: 39.9, s: S.COMIDA },
  { c: 'acompanhamentos', n: 'Strogonoff de Frango', b: 'Cozinha', e: '🍲', p: 37.9, s: S.COMIDA },
];

/** ═══ COMBOS ═══ */
const COMBOS: GlobalProductSeed[] = [
  { c: 'combos', n: 'Combo X-Burger + Batata + Refrigerante', b: 'Cozinha', e: '🎁', p: 39.9, s: S.COMIDA },
  { c: 'combos', n: 'Combo X-Bacon + Batata + Refrigerante', b: 'Cozinha', e: '🎁', p: 44.9, s: S.COMIDA },
  { c: 'combos', n: 'Combo X-Tudo + Batata + Refrigerante', b: 'Cozinha', e: '🎁', p: 49.9, s: S.COMIDA },
  { c: 'combos', n: 'Combo Casal 2 Burgers + Batata Grande', b: 'Cozinha', e: '🎁', p: 74.9, s: S.COMIDA },
  { c: 'combos', n: 'Combo Família 4 Burgers + 2 Batatas', b: 'Cozinha', e: '🎁', p: 129.9, s: S.COMIDA },
  { c: 'combos', n: 'Combo Pizza Grande + Refrigerante 2L', b: 'Cozinha', e: '🎁', p: 69.9, s: S.COMIDA },
  { c: 'combos', n: 'Combo 2 Pizzas Grandes', b: 'Cozinha', e: '🎁', p: 99.9, s: S.COMIDA },
  { c: 'combos', n: 'Combo Hot Dog + Batata + Refrigerante', b: 'Cozinha', e: '🎁', p: 32.9, s: S.COMIDA },
  { c: 'combos', n: 'Combo Porção de Frango + 4 Cervejas', b: 'Cozinha', e: '🎁', p: 79.9, s: S.COMIDA },
  { c: 'combos', n: 'Combo Açaí 500ml + Toppings', b: 'Cozinha', e: '🎁', p: 29.9, s: S.ACAI },
];

/** ═══ SOBREMESAS / AÇAÍ ═══ */
const SOBREMESAS: GlobalProductSeed[] = [
  { c: 'sobremesas', n: 'Açaí 300ml', b: 'Cozinha', e: '🍇', v: 300, u: 'ml', p: 17.9, s: S.ACAI },
  { c: 'sobremesas', n: 'Açaí 500ml', b: 'Cozinha', e: '🍇', v: 500, u: 'ml', p: 24.9, s: S.ACAI },
  { c: 'sobremesas', n: 'Açaí 700ml', b: 'Cozinha', e: '🍇', v: 700, u: 'ml', p: 31.9, s: S.ACAI },
  { c: 'sobremesas', n: 'Açaí 1L', b: 'Cozinha', e: '🍇', v: 1, u: 'L', p: 39.9, s: S.ACAI },
  { c: 'sobremesas', n: 'Açaí com Granola e Banana', b: 'Cozinha', e: '🍇', p: 26.9, s: S.ACAI },
  { c: 'sobremesas', n: 'Açaí com Morango', b: 'Cozinha', e: '🍓', p: 28.9, s: S.ACAI },
  { c: 'sobremesas', n: 'Tigela de Açaí Completa', b: 'Cozinha', e: '🍇', p: 32.9, s: S.ACAI },
  { c: 'sobremesas', n: 'Pudim de Leite', b: 'Cozinha', e: '🍮', p: 12.9, s: S.COMIDA },
  { c: 'sobremesas', n: 'Petit Gateau', b: 'Cozinha', e: '🍫', p: 22.9, s: S.COMIDA },
  { c: 'sobremesas', n: 'Brownie com Sorvete', b: 'Cozinha', e: '🍫', p: 21.9, s: S.COMIDA },
  { c: 'sobremesas', n: 'Mousse de Maracujá', b: 'Cozinha', e: '🍨', p: 12.9, s: S.COMIDA },
  { c: 'sobremesas', n: 'Sorvete 1L', b: 'Kibon', e: '🍨', v: 1, u: 'L', p: 24.9, s: S.CONV },
  { c: 'sobremesas', n: 'Sorvete Pote 2L', b: 'Kibon', e: '🍨', v: 2, u: 'L', p: 39.9, s: S.CONV },
  { c: 'sobremesas', n: 'Açaí na Tigela 200ml', b: 'Cozinha', e: '🍇', v: 200, u: 'ml', p: 14.9, s: S.ACAI },
];

/** ═══ PADARIA ═══ */
const PADARIA: GlobalProductSeed[] = [
  { c: 'salgados', n: 'Pão Francês 1kg', b: 'Padaria', e: '🥖', v: 1, u: 'kg', p: 18.9, s: S.PADARIA },
  { c: 'salgados', n: 'Pão de Queijo Congelado 1kg', b: 'Forno de Minas', e: '🧀', v: 1, u: 'kg', p: 34.9, s: S.PADARIA },
  { c: 'doces', n: 'Bolo de Cenoura Fatia', b: 'Padaria', e: '🍰', p: 9.9, s: S.PADARIA },
  { c: 'doces', n: 'Bolo de Chocolate Fatia', b: 'Padaria', e: '🍰', p: 9.9, s: S.PADARIA },
  { c: 'doces', n: 'Sonho de Creme', b: 'Padaria', e: '🍩', p: 7.9, s: S.PADARIA },
  { c: 'doces', n: 'Croissant', b: 'Padaria', e: '🥐', p: 10.9, s: S.PADARIA },
  { c: 'doces', n: 'Rosquinha de Coco 400g', b: 'Marilan', e: '🍪', v: 400, u: 'g', p: 8.99, s: S.CONV },
  { c: 'doces', n: 'Biscoito Recheado Oreo 90g', b: 'Oreo', e: '🍪', v: 90, u: 'g', p: 5.49, s: S.CONV },
  { c: 'doces', n: 'Biscoito Passatempo 130g', b: 'Nestlé', e: '🍪', v: 130, u: 'g', p: 6.49, s: S.CONV },
  { c: 'doces', n: 'Wafer Bauducco Chocolate 140g', b: 'Bauducco', e: '🍪', v: 140, u: 'g', p: 7.49, s: S.CONV },
];

/** Tudo junto. A ordem aqui define a ordem dentro de cada categoria. */
export const GLOBAL_PRODUCT_SEEDS: GlobalProductSeed[] = [
  ...CERVEJAS,
  ...REFRIGERANTES,
  ...ENERGETICOS,
  ...AGUAS,
  ...SUCOS,
  ...DRINKS,
  ...WHISKY,
  ...VODKA,
  ...GIN,
  ...VINHOS,
  ...ESPUMANTES,
  ...CACHAÇA,
  ...CHOPP,
  ...GELO,
  ...CHOCOLATES,
  ...SALGADINHOS,
  ...DOCES,
  ...MERCEARIA,
  ...HAMBURGUERES,
  ...PIZZAS,
  ...HOTDOG,
  ...PORCOES,
  ...SALGADOS,
  ...ACOMPANHAMENTOS,
  ...PRATOS,
  ...COMBOS,
  ...SOBREMESAS,
  ...PADARIA,
];

/** Segmentos recomendados, já sem repetição. */
export function seedSegments(seed: GlobalProductSeed): Segment[] {
  return Array.from(new Set(seed.s));
}

/**
 * Caminho da imagem no acervo, seguindo a convenção.
 *
 * Não é gravado no banco como verdade: é DERIVADO. Isso significa que
 * baixar a imagem para o lugar certo já basta para ela aparecer — nenhuma
 * migração, nenhum UPDATE. Só quando o arquivo tem nome fora do padrão é
 * que `defaultImageUrl` precisa ser preenchido à mão (campo `i`).
 *
 * `folderPath` é o caminho da categoria-folha, no formato
 * "bebidas/cervejas" — resolvido pelo seed a partir de `global-catalog.ts`,
 * que é a fonte única da árvore de pastas.
 */
export function seedImagePath(seed: GlobalProductSeed): string {
  if (seed.i) return seed.i;
  return `${leafFolderPath(seed.c)}/${seedSlug(seed)}`;
}

/** Chave estável para importação idempotente. */
export function seedSlug(seed: GlobalProductSeed): string {
  // O nome já carrega marca e volume ("Coca-Cola Lata 350ml"), então o
  // slug sozinho já é único dentro do acervo. Ex.: coca-cola-lata-350ml.
  return slug(seed.n);
}

/**
 * Caminhos repetidos seriam um problema silencioso: dois produtos
 * apontando para o mesmo arquivo fariam os dois cards mostrarem a foto
 * errada, e o seed marcaria ambos como importados. Exposto aqui para o
 * seed poder recusar a carga.
 */
export function findDuplicateSlugs(): string[] {
  const seen = new Map<string, number>();
  for (const seed of GLOBAL_PRODUCT_SEEDS) {
    const key = seedSlug(seed);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

/** Quantos produtos a biblioteca oferece hoje. Usado no relatório. */
export const GLOBAL_PRODUCT_COUNT = GLOBAL_PRODUCT_SEEDS.length;
