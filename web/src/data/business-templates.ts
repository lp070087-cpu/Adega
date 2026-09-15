/**
 * ═══════════════════════════════════════════════════════════════════════
 * TEMPLATES DE NEGÓCIO — portados de loja-data.js (BUSINESS_TEMPLATES)
 * -----------------------------------------------------------------------
 * Estes templates NÃO são catálogo global. São modelos de partida: no
 * onboarding o estabelecimento escolhe um segmento, os itens são COPIADOS
 * para a tabela Product e, a partir daí, pertencem só àquela organização.
 *
 * Nada aqui vira nome, logo ou texto padrão do sistema. Os nomes de produto
 * são exemplos de catálogo — nenhum estabelecimento é identidade do produto.
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { BusinessType, ProductType } from '@prisma/client';

/**
 * Segmentos atendidos, na ordem em que aparecem no onboarding.
 *
 * Fase 2 — o onboarding de NOVOS cadastros oferece apenas estes cinco. Os
 * demais (RESTAURANT, CONVENIENCE, BAKERY, MARKET, DARK_KITCHEN) saíram da
 * experiência de primeiro cadastro, mas os templates deles continuam em
 * `BUSINESS_TEMPLATES` e nenhum registro antigo do banco é apagado — quem
 * já usa a plataforma continua operando normalmente. O enum do Prisma
 * (`BusinessType`) também não muda: é só a lista exibida que encolhe.
 */
export const BUSINESS_TYPES = [
  'BEVERAGE',
  'BURGER',
  'SNACK_BAR',
  'PIZZA',
  'ACAI',
] as const satisfies readonly BusinessType[];

/**
 * Raiz pública das imagens de exemplo.
 * Os arquivos originais vivem em `Public produtos/` na raiz do repositório.
 * Copie essa pasta para `web/public/produtos/` para que as imagens apareçam
 * (ver README → "Imagens dos templates"). Sem isso, o produto cai no emoji.
 */
const ASSET = '/produtos';

/** Imagens reais já disponíveis no repositório (usadas só como exemplo). */
const IMG = {
  heineken: `${ASSET}/keineken.jpg`,
  skol: `${ASSET}/skol.jpg`,
  brahmaLitrinho: `${ASSET}/Brahma%20litrinho.jpg`,
  ice: `${ASSET}/Ice.jpg`,
  whisky: `${ASSET}/whisky.jpg`,
  oldParr: `${ASSET}/Shisky%20old%20parr.jpg`,
  blackLabel: `${ASSET}/shisky%20clack%20lebel.jpg`,
  tanqueray: `${ASSET}/shisky%20tanqueray.jpg`,
} as const;

export type TemplateVariation = { name: string; priceAdjustment: number };

export type TemplateProduct = {
  name: string;
  category: string;
  price: number;
  /** Preço promocional, quando houver. 0/ausente = sem promoção. */
  promotionalPrice?: number;
  description?: string;
  emoji?: string;
  imageUrl?: string;
  stock?: number;
  minimumStock?: number;
  /** Custo estimado. Ausente = calculado (55% do preço) na cópia. */
  cost?: number;
  type?: ProductType;
  /** Para type=VARIATION: tamanhos. Para type=ADDONS: adicionais. */
  variations?: TemplateVariation[];
  addons?: TemplateVariation[];
};

export type BusinessTemplate = {
  label: string;
  emoji: string;
  brandColor: string;
  categories: string[];
  products: TemplateProduct[];
};

/** Emoji por categoria, usado quando o produto não define o seu. */
export const CATEGORY_EMOJI: Record<string, string> = {
  Cervejas: '🍺',
  Whisky: '🥃',
  Vodka: '🍸',
  Gin: '🍸',
  Vinhos: '🍷',
  Refrigerantes: '🥤',
  Energéticos: '⚡',
  Água: '💧',
  Gelo: '🧊',
  Combos: '📦',
  Hambúrgueres: '🍔',
  'Hot Dog': '🌭',
  Porções: '🍟',
  Batata: '🍟',
  Sobremesas: '🍰',
  Adicionais: '➕',
  Sanduíches: '🥪',
  'Pizzas Tradicionais': '🍕',
  'Pizzas Especiais': '🍕',
  'Pizzas Doces': '🍫',
  Açaí: '🍧',
  Complementos: '🍓',
  Pratos: '🍽️',
  'Pratos Executivos': '🍛',
  Marmitas: '🥡',
  Massas: '🍝',
  Lanches: '🥪',
  Salgados: '🥟',
  'Doces & Bolos': '🍰',
  Snacks: '🍿',
  Mercearia: '🛒',
  Hortifruti: '🥦',
  Açougue: '🥩',
  Padaria: '🥖',
  Higiene: '🧻',
  Bebidas: '🥤',
  Outros: '📦',
};

export function categoryEmoji(name: string): string {
  return CATEGORY_EMOJI[name] ?? '🛍️';
}

export const BUSINESS_TEMPLATES: Record<BusinessType, BusinessTemplate> = {
  // ── LOJA DE BEBIDAS ────────────────────────────────────────────────
  BEVERAGE: {
    label: 'Loja de Bebidas',
    emoji: '🍺',
    brandColor: '#F15A24',
    categories: [
      'Cervejas',
      'Whisky',
      'Vodka',
      'Gin',
      'Vinhos',
      'Refrigerantes',
      'Energéticos',
      'Água',
      'Gelo',
      'Combos',
    ],
    products: [
      { name: 'Heineken 350ml', category: 'Cervejas', price: 6.29, promotionalPrice: 5.49, description: 'Pack 12 un. Puro malte, sabor inconfundível.', imageUrl: IMG.heineken, emoji: '🍺', stock: 248, minimumStock: 50 },
      { name: 'Skol 350ml', category: 'Cervejas', price: 4.49, promotionalPrice: 3.99, description: 'Pack 12 latas. A cerveja que desce redondo.', imageUrl: IMG.skol, emoji: '🍺', stock: 312, minimumStock: 50 },
      { name: 'Brahma Litrão 1L', category: 'Cervejas', price: 9.9, description: 'Garrafa 1 litro, a número 1 pra dividir.', emoji: '🍺', stock: 156, minimumStock: 30, type: 'VARIATION', variations: [{ name: '300ml', priceAdjustment: -5.41 }, { name: '1L', priceAdjustment: 0 }] },
      { name: 'Brahma Litrinho 300ml', category: 'Cervejas', price: 3.29, promotionalPrice: 2.99, description: 'Pack 15 garrafinhas.', imageUrl: IMG.brahmaLitrinho, emoji: '🍺', stock: 189, minimumStock: 30 },
      { name: 'Corona Extra 330ml', category: 'Cervejas', price: 8.9, description: 'Long neck premium.', emoji: '🍺', stock: 120, minimumStock: 20 },
      { name: 'Budweiser 350ml', category: 'Cervejas', price: 5.49, description: 'A americana mais pedida.', emoji: '🍺', stock: 140, minimumStock: 25 },
      { name: 'Antarctica Original 350ml', category: 'Cervejas', price: 4.29, description: 'O sabor tradicional.', emoji: '🍺', stock: 90, minimumStock: 20 },
      { name: "Jack Daniel's Old No.7 1L", category: 'Whisky', price: 127.9, description: 'Tennessee clássico.', imageUrl: IMG.whisky, emoji: '🥃', stock: 92, minimumStock: 15 },
      { name: 'Johnnie Walker Black Label 1L', category: 'Whisky', price: 159.9, description: 'Blend 12 anos.', imageUrl: IMG.blackLabel, emoji: '🥃', stock: 78, minimumStock: 12 },
      { name: 'Old Parr 12 Anos 1L', category: 'Whisky', price: 186.9, description: 'Escocês encorpado.', imageUrl: IMG.oldParr, emoji: '🥃', stock: 67, minimumStock: 12 },
      { name: 'Red Label 1L', category: 'Whisky', price: 89.9, description: 'Blend jovem e marcante.', emoji: '🥃', stock: 54, minimumStock: 10 },
      { name: 'Gin Tanqueray London Dry 750ml', category: 'Gin', price: 103.9, description: 'Gin inglês clássico.', imageUrl: IMG.tanqueray, emoji: '🍸', stock: 48, minimumStock: 10 },
      { name: 'Vodka Absolut 1L', category: 'Vodka', price: 89.9, description: 'Vodka sueca premium.', emoji: '🍸', stock: 55, minimumStock: 10 },
      { name: 'Vinho Tinto Chileno 750ml', category: 'Vinhos', price: 39.9, description: 'Suave e frutado.', emoji: '🍷', stock: 60, minimumStock: 8 },
      { name: 'Smirnoff Ice 275ml', category: 'Vodka', price: 7.1, description: 'Pack 6. Drink de vodka e limão.', imageUrl: IMG.ice, emoji: '🍹', stock: 134, minimumStock: 20 },
      { name: 'Coca-Cola 2L', category: 'Refrigerantes', price: 12, description: 'Gelada pra acompanhar.', emoji: '🥤', stock: 180, minimumStock: 20, type: 'VARIATION', variations: [{ name: '350ml', priceAdjustment: -7 }, { name: '2L', priceAdjustment: 0 }] },
      { name: 'Energético Red Bull 250ml', category: 'Energéticos', price: 12.9, description: 'Pra festa não parar.', emoji: '⚡', stock: 96, minimumStock: 12 },
      { name: 'Água Mineral 500ml', category: 'Água', price: 3.5, description: 'Com ou sem gás.', emoji: '💧', stock: 200, minimumStock: 30 },
      { name: 'Gelo Premium 5kg', category: 'Gelo', price: 8.9, description: 'Gelo limpo e pesado.', emoji: '🧊', stock: 60, minimumStock: 10 },
      { name: 'Combo Cerveja + Gelo', category: 'Combos', price: 59.9, promotionalPrice: 54.9, description: 'Pack 12 cervejas + gelo 5kg.', emoji: '📦', stock: 40, minimumStock: 8 },
    ],
  },

  // ── HAMBURGUERIA ───────────────────────────────────────────────────
  BURGER: {
    label: 'Hamburgueria',
    emoji: '🍔',
    brandColor: '#E11D48',
    categories: ['Hambúrgueres', 'Combos', 'Hot Dog', 'Porções', 'Batata', 'Bebidas', 'Sobremesas', 'Adicionais'],
    products: [
      { name: 'X-Burger Clássico', category: 'Hambúrgueres', price: 22.9, description: 'Pão brioche, burger 160g, queijo e molho da casa.', emoji: '🍔', stock: 80, minimumStock: 15, type: 'ADDONS', addons: [{ name: 'Bacon', priceAdjustment: 4 }, { name: 'Queijo extra', priceAdjustment: 3.5 }, { name: 'Ovo', priceAdjustment: 2.5 }, { name: 'Cheddar', priceAdjustment: 4.5 }] },
      { name: 'X-Bacon', category: 'Hambúrgueres', price: 27.9, promotionalPrice: 24.9, description: 'Burger 160g, bacon crocante, queijo e maionese.', emoji: '🍔', stock: 70, minimumStock: 12, type: 'ADDONS', addons: [{ name: 'Bacon extra', priceAdjustment: 5 }, { name: 'Queijo extra', priceAdjustment: 3.5 }] },
      { name: 'X-Salada', category: 'Hambúrgueres', price: 24.9, description: 'Burger 160g, alface, tomate e queijo.', emoji: '🥗', stock: 75, minimumStock: 12 },
      { name: 'X-Tudo', category: 'Hambúrgueres', price: 32.9, description: 'Burger duplo, bacon, ovo, salsicha, milho e batata palha.', emoji: '🍔', stock: 50, minimumStock: 10 },
      { name: 'Cheddar Duplo', category: 'Hambúrgueres', price: 29.9, description: 'Dois burgers, muito cheddar cremoso.', emoji: '🧀', stock: 45, minimumStock: 8 },
      { name: 'Burger de Costela', category: 'Hambúrgueres', price: 36.9, description: 'Costela desfiada, queijo prato e barbecue.', emoji: '🍖', stock: 30, minimumStock: 6 },
      { name: 'Hot Dog Simples', category: 'Hot Dog', price: 14.9, description: 'Pão, salsicha e molhos.', emoji: '🌭', stock: 60, minimumStock: 10, type: 'ADDONS', addons: [{ name: 'Cheddar', priceAdjustment: 4 }, { name: 'Bacon', priceAdjustment: 4 }, { name: 'Batata palha extra', priceAdjustment: 2 }] },
      { name: 'Hot Dog Completo', category: 'Hot Dog', price: 19.9, description: 'Salsicha, purê, vinagrete, milho e batata palha.', emoji: '🌭', stock: 55, minimumStock: 10 },
      { name: 'Porção de Frango a Passarinho', category: 'Porções', price: 32.9, description: '400g com alho e limão.', emoji: '🍗', stock: 30, minimumStock: 5 },
      { name: 'Porção de Calabresa', category: 'Porções', price: 28.9, description: 'Calabresa acebolada 400g.', emoji: '🥓', stock: 30, minimumStock: 5 },
      { name: 'Batata Frita Média', category: 'Batata', price: 12.9, description: 'Porção média crocante.', emoji: '🍟', stock: 120, minimumStock: 20 },
      { name: 'Batata Frita Grande', category: 'Batata', price: 16.9, promotionalPrice: 14.9, description: 'Porção grande + cheddar e bacon.', emoji: '🍟', stock: 110, minimumStock: 20, type: 'ADDONS', addons: [{ name: 'Cheddar', priceAdjustment: 4 }, { name: 'Bacon', priceAdjustment: 4 }] },
      { name: 'Batata Rústica', category: 'Batata', price: 18.9, description: 'Com alecrim e parmesão.', emoji: '🍟', stock: 60, minimumStock: 10 },
      { name: 'Coca-Cola Lata', category: 'Bebidas', price: 6, description: 'Lata 350ml gelada.', emoji: '🥤', stock: 200, minimumStock: 30, type: 'VARIATION', variations: [{ name: 'Lata 350ml', priceAdjustment: 0 }, { name: '2L', priceAdjustment: 6 }] },
      { name: 'Guaraná Antarctica Lata', category: 'Bebidas', price: 5.5, description: 'Lata 350ml.', emoji: '🥤', stock: 180, minimumStock: 30 },
      { name: 'Milkshake de Chocolate', category: 'Sobremesas', price: 18.9, description: '300ml com chantilly.', emoji: '🥤', stock: 40, minimumStock: 8 },
      { name: 'Adicional Bacon', category: 'Adicionais', price: 4, description: 'Fatias de bacon crocante.', emoji: '🥓', stock: 200, minimumStock: 30, type: 'ADDONS', addons: [{ name: '1 porção', priceAdjustment: 0 }, { name: '2 porções', priceAdjustment: 3 }] },
      { name: 'Adicional Cheddar Cremoso', category: 'Adicionais', price: 4.5, description: 'Cheddar derretido.', emoji: '🧀', stock: 200, minimumStock: 30 },
      { name: 'Combo X-Burger + Batata + Coca', category: 'Combos', price: 34.9, promotionalPrice: 31.9, description: 'O clássico completo.', emoji: '🍔', stock: 60, minimumStock: 10 },
      { name: 'Combo 2 Burgers + 2 Batatas', category: 'Combos', price: 59.9, promotionalPrice: 54.9, description: 'Pra dividir com alguém.', emoji: '📦', stock: 40, minimumStock: 8 },
    ],
  },

  // ── LANCHONETE ─────────────────────────────────────────────────────
  SNACK_BAR: {
    label: 'Lanchonete',
    emoji: '🥪',
    brandColor: '#EA580C',
    categories: ['Lanches', 'Salgados', 'Acompanhamentos', 'Bebidas', 'Sobremesas'],
    products: [
      { name: 'Misto Quente', category: 'Lanches', price: 12.9, description: 'Pão de forma, presunto e queijo na chapa.', emoji: '🥪', stock: 60, minimumStock: 10 },
      { name: 'Bauru', category: 'Lanches', price: 16.9, description: 'Pão francês, rosbife, queijo, tomate e picles.', emoji: '🥖', stock: 55, minimumStock: 10 },
      { name: 'Americano', category: 'Lanches', price: 18.9, description: 'Pão francês, ovo, presunto, queijo e alface.', emoji: '🥪', stock: 50, minimumStock: 8 },
      { name: 'X-Egg', category: 'Lanches', price: 21.9, description: 'Hambúrguer, ovo, queijo e alface.', emoji: '🍔', stock: 45, minimumStock: 8 },
      { name: 'Pão na Chapa', category: 'Lanches', price: 6.9, description: 'Com manteiga, na chapa.', emoji: '🍞', stock: 120, minimumStock: 20 },
      { name: 'Coxinha', category: 'Salgados', price: 7.5, description: 'Frango com catupiry.', emoji: '🍗', stock: 150, minimumStock: 20 },
      { name: 'Pastel de Queijo', category: 'Salgados', price: 9.9, description: 'Pastel frito na hora.', emoji: '🥟', stock: 80, minimumStock: 15 },
      { name: 'Empada de Frango', category: 'Salgados', price: 8.5, description: 'Empada artesanal.', emoji: '🥧', stock: 70, minimumStock: 12 },
      { name: 'Batata Frita', category: 'Acompanhamentos', price: 13.9, description: 'Porção individual.', emoji: '🍟', stock: 90, minimumStock: 15 },
      { name: 'Suco de Laranja', category: 'Bebidas', price: 8.9, description: 'Laranja espremida na hora.', emoji: '🍊', stock: 40, minimumStock: 6, type: 'VARIATION', variations: [{ name: '300ml', priceAdjustment: 0 }, { name: '500ml', priceAdjustment: 3 }] },
      { name: 'Refrigerante Lata', category: 'Bebidas', price: 5.5, description: 'Coca / Guaraná.', emoji: '🥤', stock: 150, minimumStock: 25 },
      { name: 'Café Coado', category: 'Bebidas', price: 4.9, description: 'Café fresquinho.', emoji: '☕', stock: 200, minimumStock: 30 },
      { name: 'Torta de Frango', category: 'Sobremesas', price: 12.9, description: 'Fatia generosa.', emoji: '🥧', stock: 25, minimumStock: 5 },
    ],
  },

  // ── PIZZARIA ───────────────────────────────────────────────────────
  PIZZA: {
    label: 'Pizzaria',
    emoji: '🍕',
    brandColor: '#7C3AED',
    categories: ['Pizzas Tradicionais', 'Pizzas Especiais', 'Pizzas Doces', 'Bebidas', 'Combos'],
    products: [
      { name: 'Pizza Margherita', category: 'Pizzas Tradicionais', price: 39.9, description: 'Molho, muçarela e manjericão.', emoji: '🍕', stock: 40, minimumStock: 5, type: 'VARIATION', variations: [{ name: 'Média', priceAdjustment: 0 }, { name: 'Grande', priceAdjustment: 13 }] },
      { name: 'Pizza Pepperoni', category: 'Pizzas Especiais', price: 49.9, description: 'Pepperoni e muçarela.', emoji: '🍕', stock: 35, minimumStock: 5, type: 'VARIATION', variations: [{ name: 'Média', priceAdjustment: 0 }, { name: 'Grande', priceAdjustment: 13 }] },
      { name: 'Pizza Calabresa', category: 'Pizzas Tradicionais', price: 44.9, description: 'Calabresa fatiada e cebola.', emoji: '🍕', stock: 38, minimumStock: 5, type: 'VARIATION', variations: [{ name: 'Média', priceAdjustment: 0 }, { name: 'Grande', priceAdjustment: 13 }] },
      { name: 'Pizza Frango com Catupiry', category: 'Pizzas Tradicionais', price: 49.9, description: 'Frango desfiado e catupiry.', emoji: '🍕', stock: 32, minimumStock: 4, type: 'VARIATION', variations: [{ name: 'Média', priceAdjustment: 0 }, { name: 'Grande', priceAdjustment: 13 }] },
      { name: 'Pizza Quatro Queijos', category: 'Pizzas Especiais', price: 54.9, description: 'Muçarela, provolone, gorgonzola e parmesão.', emoji: '🧀', stock: 28, minimumStock: 4, type: 'VARIATION', variations: [{ name: 'Média', priceAdjustment: 0 }, { name: 'Grande', priceAdjustment: 13 }] },
      { name: 'Pizza Portuguesa', category: 'Pizzas Tradicionais', price: 52.9, description: 'Presunto, ovo, cebola, azeitona e ervilha.', emoji: '🍕', stock: 25, minimumStock: 4, type: 'VARIATION', variations: [{ name: 'Média', priceAdjustment: 0 }, { name: 'Grande', priceAdjustment: 13 }] },
      { name: 'Pizza Bacon Supreme', category: 'Pizzas Especiais', price: 57.9, description: 'Bacon, cheddar e cebola caramelizada.', emoji: '🥓', stock: 24, minimumStock: 4, type: 'VARIATION', variations: [{ name: 'Média', priceAdjustment: 0 }, { name: 'Grande', priceAdjustment: 13 }] },
      { name: 'Pizza Vegetariana', category: 'Pizzas Especiais', price: 52.9, description: 'Abobrinha, berinjela, pimentão e tomate seco.', emoji: '🥬', stock: 20, minimumStock: 3 },
      { name: 'Pizza Chocolate', category: 'Pizzas Doces', price: 45.9, description: 'Chocolate ao leite com morango.', emoji: '🍫', stock: 20, minimumStock: 3 },
      { name: 'Pizza Brigadeiro', category: 'Pizzas Doces', price: 45.9, description: 'Brigadeiro cremoso e granulado.', emoji: '🍫', stock: 20, minimumStock: 3 },
      { name: 'Coca-Cola 2L', category: 'Bebidas', price: 13, description: 'Gelada.', emoji: '🥤', stock: 90, minimumStock: 10 },
      { name: 'Suco de Uva Integral', category: 'Bebidas', price: 9.9, description: 'Garrafa 500ml.', emoji: '🍇', stock: 45, minimumStock: 8 },
      { name: 'Combo Pizza Grande + Refri 2L', category: 'Combos', price: 64.9, promotionalPrice: 59.9, description: 'Escolha 1 sabor grande.', emoji: '🍕', stock: 30, minimumStock: 5 },
    ],
  },

  // ── AÇAÍ ───────────────────────────────────────────────────────────
  ACAI: {
    label: 'Açaí',
    emoji: '🍧',
    brandColor: '#8B5CF6',
    categories: ['Açaí', 'Combos', 'Adicionais', 'Bebidas'],
    products: [
      { name: 'Açaí 300ml', category: 'Açaí', price: 12.9, description: 'Açaí puro batido na hora.', emoji: '🍧', stock: 100, minimumStock: 15, type: 'ADDONS', addons: [{ name: 'Granola', priceAdjustment: 1.5 }, { name: 'Leite em pó', priceAdjustment: 1.5 }, { name: 'Banana', priceAdjustment: 1 }, { name: 'Morango', priceAdjustment: 2 }, { name: 'Paçoca', priceAdjustment: 1.5 }, { name: 'Leite condensado', priceAdjustment: 2 }] },
      { name: 'Açaí 500ml', category: 'Açaí', price: 17.9, description: 'Açaí puro + 1 complemento grátis.', emoji: '🍧', stock: 90, minimumStock: 12, type: 'ADDONS', addons: [{ name: 'Granola', priceAdjustment: 1.5 }, { name: 'Leite em pó', priceAdjustment: 1.5 }, { name: 'Banana', priceAdjustment: 1 }, { name: 'Morango', priceAdjustment: 2 }, { name: 'Paçoca', priceAdjustment: 1.5 }] },
      { name: 'Açaí 700ml', category: 'Açaí', price: 22.9, description: 'Açaí puro + 2 complementos grátis.', emoji: '🍧', stock: 70, minimumStock: 10, type: 'ADDONS', addons: [{ name: 'Granola', priceAdjustment: 1.5 }, { name: 'Leite em pó', priceAdjustment: 1.5 }, { name: 'Banana', priceAdjustment: 1 }, { name: 'Morango', priceAdjustment: 2 }, { name: 'Paçoca', priceAdjustment: 1.5 }, { name: 'Leite condensado', priceAdjustment: 2 }] },
      { name: 'Cupuaçu 500ml', category: 'Açaí', price: 18.9, description: 'Cupuaçu cremoso.', emoji: '🍈', stock: 40, minimumStock: 8 },
      { name: 'Vitamina de Banana', category: 'Açaí', price: 13.9, description: 'Banana com leite.', emoji: '🍌', stock: 35, minimumStock: 6 },
      { name: 'Adicional Granola', category: 'Adicionais', price: 1.5, description: 'Porção extra de granola.', emoji: '🌾', stock: 200, minimumStock: 30 },
      { name: 'Adicional Morango', category: 'Adicionais', price: 2, description: 'Morango fresco picado.', emoji: '🍓', stock: 80, minimumStock: 12 },
      { name: 'Adicional Leite Condensado', category: 'Adicionais', price: 2, description: 'Fio generoso.', emoji: '🥛', stock: 150, minimumStock: 20 },
      { name: 'Adicional Paçoca', category: 'Adicionais', price: 1.5, description: 'Paçoca esfarelada.', emoji: '🥜', stock: 150, minimumStock: 20 },
      { name: 'Caldo de Cana', category: 'Bebidas', price: 8, description: 'Copo 400ml.', emoji: '🥤', stock: 60, minimumStock: 10, type: 'VARIATION', variations: [{ name: '400ml', priceAdjustment: 0 }, { name: '600ml', priceAdjustment: 2 }] },
      { name: 'Água Mineral', category: 'Bebidas', price: 3.5, description: 'Garrafa 500ml.', emoji: '💧', stock: 150, minimumStock: 20 },
      { name: 'Combo Açaí 500ml + 2 complementos', category: 'Combos', price: 19.9, promotionalPrice: 17.9, description: 'O favorito da casa.', emoji: '🍧', stock: 50, minimumStock: 8 },
      { name: 'Combo Casal — 2 Açaís 500ml', category: 'Combos', price: 32.9, promotionalPrice: 29.9, description: 'Dois açaís com complementos.', emoji: '📦', stock: 35, minimumStock: 6 },
    ],
  },

  // ── RESTAURANTE ────────────────────────────────────────────────────
  RESTAURANT: {
    label: 'Restaurante',
    emoji: '🍽️',
    brandColor: '#B45309',
    categories: ['Pratos Executivos', 'Marmitas', 'Bebidas', 'Sobremesas'],
    products: [
      { name: 'PF Bife Acebolado', category: 'Pratos Executivos', price: 24.9, description: 'Bife acebolado, arroz, feijão, salada e fritas.', emoji: '🍛', stock: 45, minimumStock: 5 },
      { name: 'PF Frango Grelhado', category: 'Pratos Executivos', price: 22.9, description: 'Filé de frango grelhado, arroz, feijão e salada.', emoji: '🍗', stock: 45, minimumStock: 5 },
      { name: 'Filé de Frango à Parmegiana', category: 'Pratos Executivos', price: 29.9, description: 'Empanado, molho, queijo, arroz e fritas.', emoji: '🧀', stock: 30, minimumStock: 4 },
      { name: 'PF Carne de Sol', category: 'Pratos Executivos', price: 32.9, description: 'Carne de sol com macaxeira e feijão verde.', emoji: '🥩', stock: 25, minimumStock: 4 },
      { name: 'Marmita Executiva', category: 'Marmitas', price: 18.9, description: 'Arroz, feijão, proteína do dia e salada.', emoji: '🥡', stock: 80, minimumStock: 10, type: 'VARIATION', variations: [{ name: 'Pequena', priceAdjustment: -2 }, { name: 'Grande', priceAdjustment: 0 }] },
      { name: 'Marmita Fit', category: 'Marmitas', price: 21.9, description: 'Arroz integral, frango grelhado e legumes.', emoji: '🥗', stock: 40, minimumStock: 6 },
      { name: 'Suco Natural', category: 'Bebidas', price: 7.9, description: 'Laranja, limão ou maracujá.', emoji: '🍊', stock: 60, minimumStock: 8 },
      { name: 'Refrigerante Lata', category: 'Bebidas', price: 5.5, description: 'Coca / Guaraná / Fanta.', emoji: '🥤', stock: 120, minimumStock: 15 },
      { name: 'Pudim de Leite', category: 'Sobremesas', price: 8.9, description: 'Fatia de pudim caseiro.', emoji: '🍮', stock: 25, minimumStock: 4 },
      { name: 'Combo Executivo + Suco', category: 'Pratos Executivos', price: 24.9, promotionalPrice: 22.9, description: 'Marmita grande + suco 400ml.', emoji: '🍛', stock: 35, minimumStock: 5 },
    ],
  },

  // ── CONVENIÊNCIA ───────────────────────────────────────────────────
  CONVENIENCE: {
    label: 'Conveniência',
    emoji: '🏪',
    brandColor: '#0E7490',
    categories: ['Bebidas', 'Snacks', 'Mercearia', 'Gelo', 'Outros'],
    products: [
      { name: 'Cerveja Lata 350ml', category: 'Bebidas', price: 5.9, description: 'Heineken, Skol ou Brahma.', emoji: '🍺', stock: 200, minimumStock: 30 },
      { name: 'Refrigerante Lata', category: 'Bebidas', price: 5.5, description: 'Coca / Guaraná.', emoji: '🥤', stock: 180, minimumStock: 25 },
      { name: 'Refrigerante 2L', category: 'Bebidas', price: 11, description: 'Coca-Cola 2L gelada.', emoji: '🥤', stock: 120, minimumStock: 15 },
      { name: 'Água Mineral 500ml', category: 'Bebidas', price: 3, description: 'Com ou sem gás.', emoji: '💧', stock: 250, minimumStock: 40 },
      { name: 'Energético 250ml', category: 'Bebidas', price: 12, description: 'Red Bull ou Monster.', emoji: '⚡', stock: 60, minimumStock: 10 },
      { name: 'Salgadinho 90g', category: 'Snacks', price: 8.9, description: 'Doritos, Ruffles ou Cheetos.', emoji: '🍟', stock: 80, minimumStock: 12 },
      { name: 'Chocolate Barra', category: 'Snacks', price: 7.5, description: 'Ao leite ou meio amargo.', emoji: '🍫', stock: 90, minimumStock: 15 },
      { name: 'Biscoito Recheado', category: 'Mercearia', price: 3.9, description: 'Chocolate ou morango.', emoji: '🍪', stock: 110, minimumStock: 20 },
      { name: 'Pão Francês (un)', category: 'Mercearia', price: 0.9, description: 'Fresquinho.', emoji: '🥖', stock: 300, minimumStock: 50 },
      { name: 'Gelo 5kg', category: 'Gelo', price: 9.9, description: 'Pra sua festa.', emoji: '🧊', stock: 50, minimumStock: 8 },
      { name: 'Isqueiro', category: 'Outros', price: 3, description: '—', emoji: '🔥', stock: 100, minimumStock: 15 },
    ],
  },

  // ── PADARIA ────────────────────────────────────────────────────────
  BAKERY: {
    label: 'Padaria',
    emoji: '🥐',
    brandColor: '#A16207',
    categories: ['Pães', 'Salgados', 'Doces & Bolos', 'Bebidas'],
    products: [
      { name: 'Pão Francês (un)', category: 'Pães', price: 0.9, description: 'Assado na hora.', emoji: '🥖', stock: 500, minimumStock: 100 },
      { name: 'Pão de Forma', category: 'Pães', price: 7.9, description: 'Fatia tradicional.', emoji: '🍞', stock: 60, minimumStock: 10 },
      { name: 'Croissant', category: 'Pães', price: 6.5, description: 'Folhado e amanteigado.', emoji: '🥐', stock: 40, minimumStock: 8 },
      { name: 'Baguete', category: 'Pães', price: 8.9, description: 'Fresquinha.', emoji: '🥖', stock: 30, minimumStock: 6 },
      { name: 'Pão de Queijo (un)', category: 'Salgados', price: 3.5, description: 'Mineiro, quentinho.', emoji: '🧀', stock: 150, minimumStock: 25 },
      { name: 'Coxinha', category: 'Salgados', price: 7.5, description: 'Frango.', emoji: '🍗', stock: 80, minimumStock: 12 },
      { name: 'Empada de Palmito', category: 'Salgados', price: 8.5, description: '—', emoji: '🥧', stock: 50, minimumStock: 8 },
      { name: 'Sonho', category: 'Doces & Bolos', price: 7.9, description: 'Recheado com creme.', emoji: '🍩', stock: 40, minimumStock: 6 },
      { name: 'Bolo de Cenoura', category: 'Doces & Bolos', price: 6.9, description: 'Fatia com chocolate.', emoji: '🍰', stock: 30, minimumStock: 5 },
      { name: 'Bolo de Chocolate', category: 'Doces & Bolos', price: 7.5, description: 'Fatia generosa.', emoji: '🍰', stock: 30, minimumStock: 5 },
      { name: 'Café Expresso', category: 'Bebidas', price: 4.5, description: '—', emoji: '☕', stock: 200, minimumStock: 40 },
      { name: 'Leite Quente', category: 'Bebidas', price: 5, description: 'Com ou sem achocolatado.', emoji: '🥛', stock: 80, minimumStock: 15 },
      { name: 'Suco de Laranja', category: 'Bebidas', price: 8.5, description: 'Copo 300ml.', emoji: '🍊', stock: 45, minimumStock: 8 },
    ],
  },

  // ── MERCADO ────────────────────────────────────────────────────────
  MARKET: {
    label: 'Mercado',
    emoji: '🛒',
    brandColor: '#15803D',
    categories: ['Hortifruti', 'Mercearia', 'Açougue', 'Bebidas', 'Padaria', 'Higiene'],
    products: [
      { name: 'Banana Prata (kg)', category: 'Hortifruti', price: 6.9, description: '—', emoji: '🍌', stock: 60, minimumStock: 10 },
      { name: 'Maçã (kg)', category: 'Hortifruti', price: 9.9, description: '—', emoji: '🍎', stock: 50, minimumStock: 8 },
      { name: 'Tomate (kg)', category: 'Hortifruti', price: 8.9, description: '—', emoji: '🍅', stock: 45, minimumStock: 8 },
      { name: 'Alface', category: 'Hortifruti', price: 4.5, description: 'Unidade.', emoji: '🥬', stock: 40, minimumStock: 6 },
      { name: 'Arroz 5kg', category: 'Mercearia', price: 28.9, description: 'Tipo 1.', emoji: '🍚', stock: 80, minimumStock: 10 },
      { name: 'Feijão 1kg', category: 'Mercearia', price: 8.9, description: 'Carioca.', emoji: '🫘', stock: 90, minimumStock: 12 },
      { name: 'Óleo de Soja 900ml', category: 'Mercearia', price: 7.9, description: '—', emoji: '🛢️', stock: 70, minimumStock: 10 },
      { name: 'Leite Integral 1L', category: 'Mercearia', price: 5.9, description: '—', emoji: '🥛', stock: 100, minimumStock: 15 },
      { name: 'Ovos (12un)', category: 'Mercearia', price: 12.9, description: 'Brancos.', emoji: '🥚', stock: 60, minimumStock: 8 },
      { name: 'Frango Inteiro (kg)', category: 'Açougue', price: 15.9, description: 'Resfriado.', emoji: '🍗', stock: 40, minimumStock: 6 },
      { name: 'Carne Moída (kg)', category: 'Açougue', price: 34.9, description: 'Primeira.', emoji: '🥩', stock: 30, minimumStock: 5 },
      { name: 'Cerveja Lata 350ml', category: 'Bebidas', price: 5.49, description: 'Skol / Brahma.', emoji: '🍺', stock: 200, minimumStock: 30 },
      { name: 'Refrigerante 2L', category: 'Bebidas', price: 11.5, description: 'Coca / Guaraná.', emoji: '🥤', stock: 150, minimumStock: 20 },
      { name: 'Pão Francês (un)', category: 'Padaria', price: 0.9, description: '—', emoji: '🥖', stock: 400, minimumStock: 80 },
      { name: 'Papel Higiênico (4un)', category: 'Higiene', price: 13.9, description: '—', emoji: '🧻', stock: 80, minimumStock: 10 },
    ],
  },

  // ── DARK KITCHEN ───────────────────────────────────────────────────
  DARK_KITCHEN: {
    label: 'Dark Kitchen',
    emoji: '👨‍🍳',
    brandColor: '#334155',
    categories: ['Lanches', 'Massas', 'Pratos', 'Sobremesas', 'Bebidas'],
    products: [
      { name: 'X-Burger Gourmet', category: 'Lanches', price: 29.9, description: 'Blend 180g, queijo prato e maionese da casa.', emoji: '🍔', stock: 60, minimumStock: 10, type: 'ADDONS', addons: [{ name: 'Bacon', priceAdjustment: 5 }, { name: 'Cheddar', priceAdjustment: 4.5 }, { name: 'Ovo', priceAdjustment: 3 }] },
      { name: 'X-Costela', category: 'Lanches', price: 38.9, description: 'Costela desfiada, cheddar e barbecue.', emoji: '🍖', stock: 35, minimumStock: 6 },
      { name: 'Batata Rústica', category: 'Lanches', price: 17.9, description: 'Com alecrim e parmesão.', emoji: '🍟', stock: 70, minimumStock: 10 },
      { name: 'Macarrão ao Molho Branco', category: 'Massas', price: 27.9, description: 'Fettuccine, molho branco e frango.', emoji: '🍝', stock: 30, minimumStock: 5 },
      { name: 'Macarrão à Bolonhesa', category: 'Massas', price: 26.9, description: 'Espaguete ao sugo com carne moída.', emoji: '🍝', stock: 30, minimumStock: 5 },
      { name: 'Risoto de Camarão', category: 'Pratos', price: 42.9, description: 'Risoto cremoso com camarão.', emoji: '🍤', stock: 20, minimumStock: 3 },
      { name: 'Bowl de Frango Grelhado', category: 'Pratos', price: 24.9, description: 'Arroz, frango e legumes no wok.', emoji: '🥗', stock: 40, minimumStock: 6 },
      { name: 'Brownie com Sorvete', category: 'Sobremesas', price: 16.9, description: 'Quentinho.', emoji: '🍫', stock: 35, minimumStock: 5 },
      { name: 'Cheesecake de Frutas Vermelhas', category: 'Sobremesas', price: 15.9, description: 'Fatia.', emoji: '🍰', stock: 25, minimumStock: 4 },
      { name: 'Coca-Cola Lata', category: 'Bebidas', price: 6, description: '—', emoji: '🥤', stock: 150, minimumStock: 20 },
      { name: 'Suco de Maracujá', category: 'Bebidas', price: 8.9, description: '300ml.', emoji: '🥤', stock: 45, minimumStock: 8 },
    ],
  },
};

/** Modelo vazio: loja que ainda não escolheu segmento não herda catálogo. */
export const EMPTY_TEMPLATE: BusinessTemplate = {
  label: '',
  emoji: '🛍️',
  brandColor: '#F15A24',
  categories: [],
  products: [],
};

export function templateByType(type: BusinessType | null | undefined): BusinessTemplate {
  if (!type) return EMPTY_TEMPLATE;
  return BUSINESS_TEMPLATES[type] ?? EMPTY_TEMPLATE;
}

export function templateLabel(type: BusinessType | null | undefined): string {
  return templateByType(type).label;
}

/** Total de produtos-modelo por segmento (útil no onboarding e nos testes). */
export function templateProductCount(type: BusinessType): number {
  return BUSINESS_TEMPLATES[type].products.length;
}

/** Soma dos produtos-modelo de todos os segmentos. */
export const TOTAL_TEMPLATE_PRODUCTS = Object.values(BUSINESS_TEMPLATES).reduce(
  (acc, t) => acc + t.products.length,
  0,
);
