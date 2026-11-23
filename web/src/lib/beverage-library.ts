import { normalizeSearchText } from '@/lib/utils';

const EXCLUDED_PRODUCT_PREFIX = /^(arroz|feijao|cafe|bolo|chocolate-kinder-ovo|esfi[hr]a|esfirra|pastel|pipoca|pao-de-queijo|pao-de-forma|pe-de-moleque|papel-higienico)(-|$)/;
const CARTON_JUICE_BRANDS = new Set(['del valle', 'kapo', 'sufresh']);

/** The shared database serves other segments as well as beverage stores. */
export function isBeverageLibraryItem(product: { slug: string; brand?: string | null; globalCategory?: { slug?: string } | null }) {
  const category = product.globalCategory?.slug;
  return category !== 'mercearia' &&
    !EXCLUDED_PRODUCT_PREFIX.test(product.slug) &&
    !product.slug.split('-').includes('acai') &&
    !(category === 'chopp' && /-(1|5)l$/.test(product.slug)) &&
    !(category === 'sucos' && CARTON_JUICE_BRANDS.has(normalizeSearchText(product.brand ?? '')));
}

const MANUFACTURERS = new Map<string, string>([
  ...['antarctica', 'brahma', 'budweiser', 'colorado', 'corona', 'fusion', 'goose island', 'michelob', 'original', 'patagonia', 'skol', 'spaten', 'stella artois', 'sukita'].map(brand => [brand, 'Ambev'] as const),
  ...['amstel', 'baden baden', 'devassa', 'eisenbahn', 'heineken'].map(brand => [brand, 'Grupo Heineken'] as const),
  ['blue moon', 'Molson Coors'],
  ...['pepsi', 'cheetos', 'doritos', 'elma chips', 'fandangos', 'ruffles'].map(brand => [brand, 'PepsiCo'] as const),
  ...['itaipava', 'petra', 'tnt'].map(brand => [brand, 'Grupo Petrópolis'] as const),
  ...['coca-cola', 'del valle', 'fanta', 'guarana jesus', 'kapo', 'kuat', 'schweppes', 'sprite'].map(brand => [brand, 'Sistema Coca-Cola'] as const),
]);

export function beverageManufacturer(brand: string | null, category?: string): string | null {
  const name = brand?.trim();
  if (!name) return null;
  const key = normalizeSearchText(name);
  if (key === 'crystal') {
    if (category === 'cervejas') return 'Grupo Petrópolis';
    if (category === 'aguas') return 'Sistema Coca-Cola';
  }
  return MANUFACTURERS.get(key) ?? name;
}

export const ILLUSTRATIVE_LIBRARY_PHOTOS = new Set([
  'gelo-tradicional-1kg', 'gelo-tradicional-2kg', 'gelo-tradicional-5kg', 'gelo-tradicional-10kg',
  'gelo-triturado-5kg', 'gelo-de-coco-1kg',
]);
