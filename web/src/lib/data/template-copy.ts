import type { BusinessType, ProductType } from '@prisma/client';
import {
  BUSINESS_TEMPLATES,
  EMPTY_TEMPLATE,
  categoryEmoji,
  type TemplateProduct,
} from '@/data/business-templates';

/**
 * Converte o template do segmento no formato que vai para o banco.
 *
 * Isto é o coração da regra "template não é catálogo global": a saída
 * desta função é COPIADA para Category e Product da organização. Depois
 * da cópia, mudar o template no código não afeta mais ninguém.
 */

export type TemplateCategoryDraft = {
  name: string;
  emoji: string;
  position: number;
};

export type TemplateProductDraft = {
  name: string;
  categoryName: string;
  description: string | null;
  imageUrl: string | null;
  emoji: string | null;
  price: number;
  promotionalPrice: number | null;
  cost: number | null;
  stock: number;
  minimumStock: number;
  type: ProductType;
  variations: Array<{ name: string; priceAdjustment: number; position: number }>;
  addons: Array<{ name: string; price: number; position: number }>;
};

export type TemplateDraft = {
  categories: TemplateCategoryDraft[];
  products: TemplateProductDraft[];
  label: string;
  emoji: string;
  brandColor: string;
};

/** Custo estimado quando o template não informa: 55% do preço. */
function estimatedCost(price: number): number {
  return Math.round((price * 0.55 + Number.EPSILON) * 100) / 100;
}

function draftFromTemplateProduct(p: TemplateProduct): TemplateProductDraft {
  const type: ProductType = p.type ?? 'SIMPLE';

  return {
    name: p.name,
    categoryName: p.category,
    description: p.description ?? null,
    imageUrl: p.imageUrl ?? null,
    emoji: p.emoji ?? categoryEmoji(p.category),
    price: p.price,
    promotionalPrice: p.promotionalPrice ?? null,
    cost: p.cost ?? estimatedCost(p.price),
    stock: p.stock ?? 0,
    minimumStock: p.minimumStock ?? 0,
    type,
    variations:
      type === 'VARIATION'
        ? (p.variations ?? []).map((v, i) => ({
            name: v.name,
            priceAdjustment: v.priceAdjustment,
            position: i,
          }))
        : [],
    addons:
      type === 'ADDONS'
        ? (p.addons ?? []).map((a, i) => ({
            name: a.name,
            price: a.priceAdjustment,
            position: i,
          }))
        : [],
  };
}

export function buildTemplateProducts(businessType: BusinessType | null | undefined): TemplateDraft {
  const template = businessType ? (BUSINESS_TEMPLATES[businessType] ?? EMPTY_TEMPLATE) : EMPTY_TEMPLATE;

  const categories: TemplateCategoryDraft[] = template.categories.map((name, i) => ({
    name,
    emoji: categoryEmoji(name),
    position: i,
  }));

  const products = template.products.map(draftFromTemplateProduct);

  return {
    categories,
    products,
    label: template.label,
    emoji: template.emoji,
    brandColor: template.brandColor,
  };
}

/**
 * Aplica um ajuste de preço em massa (etapa 4 do onboarding).
 * O preço promocional é recalculado junto — deixar a promoção no valor
 * antigo geraria "promoção" mais cara que o preço cheio.
 */
export function applyPriceAdjustment(
  products: TemplateProductDraft[],
  options: { multiplier: number; offset: number; roundToNinety: boolean },
): TemplateProductDraft[] {
  const adjust = (value: number): number => {
    let v = value * options.multiplier + options.offset;
    if (options.roundToNinety) {
      // Arredonda para o ,90 mais próximo (12,34 → 12,90).
      v = Math.floor(v) + 0.9;
    }
    return Math.max(0.5, Math.round(v * 100) / 100);
  };

  return products.map((p) => {
    const price = adjust(p.price);
    return {
      ...p,
      price,
      promotionalPrice:
        p.promotionalPrice != null ? Math.min(adjust(p.promotionalPrice), price - 0.01) : null,
    };
  });
}
