import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getCategories, getCatalogSummary, getProducts } from '@/lib/data/catalog';
import {
  getGlobalCategories,
  getGlobalBrands,
  getOwnedGlobalProductIds,
} from '@/lib/data/global-catalog';
import { getOrganizationById } from '@/lib/data/organization';
import { templateLabel, templateProductCount } from '@/data/business-templates';
import { CatalogManager } from '@/components/catalog/CatalogManager';
import type { CatalogCategory, CatalogProduct } from '@/components/catalog/CatalogManager';
import type { EditableProduct } from '@/components/catalog/ProductModal';
import type { PickerCategory } from '@/components/catalog/GlobalProductPicker';
import type { BusinessType } from '@prisma/client';

export const metadata = { title: 'Catálogo' };
export const dynamic = 'force-dynamic';

/**
 * Catálogo de produtos da organização.
 *
 * O servidor entrega a lista já serializada (Decimal → number) e o
 * cliente só cuida da interação. Toda gravação volta por server action.
 *
 * Esta tela carrega também os dados da BIBLIOTECA GLOBAL (categorias,
 * marcas e quais itens a loja já tem) para o "+ Adicionar da biblioteca"
 * abrir sem espera. É só leitura — a biblioteca não pertence à loja.
 */

// O retorno de serializeProduct é indexado por string; estes conversores
// dão tipo seguro ao que a tela consome, sem espalhar `as` pelo JSX.
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function nullableNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** O vínculo com o produto global, quando o item veio da biblioteca. */
function globalLink(value: unknown): { id: string; defaultImageUrl: string | null; emoji: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const g = value as Record<string, unknown>;
  const id = str(g.id);
  if (!id) return null;
  return { id, defaultImageUrl: nullableStr(g.defaultImageUrl), emoji: nullableStr(g.emoji) };
}

export default async function CatalogPage() {
  const ctx = await requireOrgPage('MANAGE_PRODUCTS');

  const [organization, categoriesRaw, productsPage, summary] = await Promise.all([
    getOrganizationById(ctx.organizationId),
    getCategories(ctx.organizationId),
    getProducts(ctx.organizationId, { perPage: 300 }),
    getCatalogSummary(ctx.organizationId),
  ]);

  const businessType = (organization?.businessType ?? 'SNACK_BAR') as BusinessType;

  // ── Dados da biblioteca global, para o seletor abrir pronto ──
  const [globalCategories, globalBrands, ownedGlobalIds] = await Promise.all([
    getGlobalCategories(),
    getGlobalBrands(),
    getOwnedGlobalProductIds(
      ctx.organizationId,
      productsPage.items
        .map((p) => globalLink(p.globalProduct)?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]);

  const pickerCategories: PickerCategory[] = globalCategories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    fullName: category.fullName,
    productCount: category.productCount,
  }));

  const categories: CatalogCategory[] = categoriesRaw.map((category) => ({
    id: category.id,
    name: category.name,
    emoji: category.emoji,
    count: category._count.products,
  }));

  const products: CatalogProduct[] = [];
  const editable: Record<string, EditableProduct> = {};

  for (const raw of productsPage.items) {
    const id = str(raw.id);
    if (!id) continue;

    const category = raw.category as { id: string; name: string } | null | undefined;
    const global = globalLink(raw.globalProduct);

    products.push({
      id,
      name: str(raw.name),
      emoji: nullableStr(raw.emoji),
      imageUrl: nullableStr(raw.imageUrl),
      customImageUrl: nullableStr(raw.customImageUrl),
      // Imagem compartilhada da biblioteca. Fica separada de `imageUrl`
      // para a tela saber distinguir foto própria de foto herdada.
      globalImageUrl: global?.defaultImageUrl ?? null,
      globalProductId: global?.id ?? null,
      featured: bool(raw.featured),
      sku: nullableStr(raw.sku),
      price: num(raw.price),
      promotionalPrice: nullableNum(raw.promotionalPrice),
      stock: num(raw.stock),
      minimumStock: num(raw.minimumStock),
      trackStock: bool(raw.trackStock, true),
      active: bool(raw.active, true),
      available: bool(raw.available, true),
      type: str(raw.type, 'SIMPLE'),
      categoryId: nullableStr(raw.categoryId),
      categoryName: category ? str(category.name) : null,
      orderCount: num((raw._count as { orderItems?: unknown } | undefined)?.orderItems),
    });

    // O modal recebe o produto inteiro — inclusive variações e adicionais.
    editable[id] = {
      id,
      name: str(raw.name),
      categoryId: nullableStr(raw.categoryId),
      description: nullableStr(raw.description),
      imageUrl: nullableStr(raw.imageUrl),
      emoji: nullableStr(raw.emoji),
      sku: nullableStr(raw.sku),
      barcode: nullableStr(raw.barcode),
      price: num(raw.price),
      promotionalPrice: nullableNum(raw.promotionalPrice),
      cost: nullableNum(raw.cost),
      stock: num(raw.stock),
      minimumStock: num(raw.minimumStock),
      trackStock: bool(raw.trackStock, true),
      active: bool(raw.active, true),
      available: bool(raw.available, true),
      type: str(raw.type, 'SIMPLE'),
      variations: array(raw.variations).map((variation, index) => {
        const v = variation as Record<string, unknown>;
        return {
          id: str(v.id, `v-${index}`),
          name: str(v.name),
          priceAdjustment: num(v.priceAdjustment),
          active: bool(v.active, true),
        };
      }),
      addonGroups: array(raw.addonGroups).map((group, index) => {
        const g = group as Record<string, unknown>;
        return {
          id: str(g.id, `g-${index}`),
          name: str(g.name),
          minSelections: num(g.minSelections),
          maxSelections: num(g.maxSelections, 1),
          required: bool(g.required),
          addons: array(g.addons).map((addon, addonIndex) => {
            const a = addon as Record<string, unknown>;
            return {
              id: str(a.id, `a-${addonIndex}`),
              name: str(a.name),
              price: num(a.price),
              active: bool(a.active, true),
            };
          }),
        };
      }),
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[1.05rem] font-extrabold text-ink-900">Catálogo</h2>
          <p className="text-[0.8rem] text-ink-500">
            {summary.total} produto{summary.total === 1 ? '' : 's'} · {summary.active} ativo
            {summary.active === 1 ? '' : 's'} · {summary.categories} categoria
            {summary.categories === 1 ? '' : 's'}
          </p>
        </div>
        {(summary.lowStock > 0 || summary.outOfStock > 0) && (
          <p className="text-[0.78rem] font-semibold text-warn">
            {summary.lowStock} no mínimo · {summary.outOfStock} sem estoque
          </p>
        )}
      </div>

      <CatalogManager
        products={products}
        categories={categories}
        editable={editable}
        businessTypeLabel={templateLabel(businessType)}
        templateCount={templateProductCount(businessType)}
        businessType={businessType}
        pickerCategories={pickerCategories}
        pickerBrands={globalBrands}
        ownedGlobalProductIds={ownedGlobalIds}
        canManage={can(ctx.role, 'MANAGE_PRODUCTS')}
      />
    </div>
  );
}
