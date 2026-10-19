import { slugify } from '@/lib/utils';
import { CATALOG_PHOTOS } from '@/lib/catalog-photo-manifest';

/** Recebe apenas o catálogo já filtrado pela organização no servidor. */
export function selectHeroProducts<T extends { name: string; customImageUrl?: string | null; imageUrl?: string | null; globalProduct?: { defaultImageUrl?: string | null } | null }>(featured: T[], catalog: T[]): T[] {
  if (featured.length) return featured.slice(0, 3);
  return catalog.filter(product => {
    const configured = product.customImageUrl || product.imageUrl;
    const global = product.globalProduct?.defaultImageUrl;
    return Boolean(configured || (global && /^https?:\/\//i.test(global)) || CATALOG_PHOTOS[slugify(product.name)]);
  }).slice(0, 3);
}
