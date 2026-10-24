/**
 * Quais categorias aparecem na vitrine (Organization.settings.storefrontCategories):
 *   nav     → chips da navegação principal
 *   showAll → seções exibidas em "Mostrar todos"
 * Ausente = todas. Uma categoria fora das duas listas fica oculta na vitrine:
 * nada é apagado, e os produtos continuam cadastrados e acessíveis por link.
 */
export type StorefrontCategories = { nav: string[] | null; showAll: string[] | null };

const ids = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 500) : null);

export function readStorefrontCategories(settings: unknown): StorefrontCategories {
  const raw = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>).storefrontCategories : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { nav: null, showAll: null };
  const config = raw as Record<string, unknown>;
  return { nav: ids(config.nav), showAll: ids(config.showAll) };
}

/** Aplica a configuração a uma lista de categorias já ordenada. */
export function storefrontCategoryView<C extends { id: string }>(categories: C[], config: StorefrontCategories) {
  const inNav = (id: string) => !config.nav || config.nav.includes(id);
  const inShowAll = (id: string) => !config.showAll || config.showAll.includes(id);
  return {
    nav: categories.filter((c) => inNav(c.id)),
    showAll: categories.filter((c) => inShowAll(c.id)),
    hidden: categories.filter((c) => !inNav(c.id) && !inShowAll(c.id)),
  };
}
