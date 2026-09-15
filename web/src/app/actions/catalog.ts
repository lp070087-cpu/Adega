'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { toActionError } from '@/lib/auth/guards';
import * as catalog from '@/lib/data/catalog';
import { getOrganizationById } from '@/lib/data/organization';
import { setStock, adjustStock as adjustStockData } from '@/lib/data/inventory';
import {
  applyTemplateSchema,
  categorySchema,
  duplicateProductSchema,
  productPriceSchema,
  productSchema,
  stockAdjustmentSchema,
  stockSetSchema,
  toggleProductSchema,
} from '@/lib/validations/catalog';
import { BusinessType } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CATÁLOGO — server actions
 * -----------------------------------------------------------------------
 * Nenhum componente client importa Prisma. O único caminho até o banco
 * é esta camada, e ela sempre começa por requirePermission().
 *
 * O organizationId NUNCA vem do formulário: vem da sessão assinada.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

function firstIssue(error: z.ZodError): { error: string; field?: string } {
  const issue = error.errors[0];
  return { error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
}

/** Converte "29,90" / "" / null em número, para formulários HTML. */
function num(value: FormDataEntryValue | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: FormDataEntryValue | null | undefined): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value);
  if (raw === 'on' || raw === 'true' || raw === '1') return true;
  if (raw === 'off' || raw === 'false' || raw === '0') return false;
  return undefined;
}

function str(value: FormDataEntryValue | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  return raw === '' ? undefined : raw;
}

/**
 * Lê o produto do FormData.
 *
 * Os complementos (variações/adicionais) viajam como JSON num campo
 * oculto porque são uma lista aninhada — o editor do modal monta esse
 * JSON no cliente, mas quem valida de verdade é o Zod aqui.
 */
function productFromForm(formData: FormData) {
  const variations = parseJsonArray(formData.get('variations'));
  const addonGroups = parseJsonArray(formData.get('addonGroups'));

  return {
    name: formData.get('name'),
    slug: str(formData.get('slug')),
    categoryId: str(formData.get('categoryId')) ?? '',
    description: str(formData.get('description')),
    imageUrl: str(formData.get('imageUrl')) ?? '',
    emoji: str(formData.get('emoji')),
    sku: str(formData.get('sku')),
    barcode: str(formData.get('barcode')),
    price: num(formData.get('price')) ?? 0,
    promotionalPrice: num(formData.get('promotionalPrice')),
    cost: num(formData.get('cost')),
    stock: Math.max(0, Math.round(num(formData.get('stock')) ?? 0)),
    minimumStock: Math.max(0, Math.round(num(formData.get('minimumStock')) ?? 0)),
    trackStock: bool(formData.get('trackStock')) ?? true,
    active: bool(formData.get('active')) ?? true,
    available: bool(formData.get('available')) ?? true,
    type: str(formData.get('type')) ?? 'SIMPLE',
    variations,
    addonGroups,
  };
}

function parseJsonArray(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── PRODUTOS ───────────────────────────────────────────────────────────

export async function createProductAction(formData: FormData): Promise<ActionResult> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_PRODUCTS');

    const parsed = productSchema.safeParse(productFromForm(formData));
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await catalog.createProduct(
      organizationId,
      {
        ...parsed.data,
        categoryId: parsed.data.categoryId || undefined,
        imageUrl: parsed.data.imageUrl || undefined,
        description: parsed.data.description || undefined,
        emoji: parsed.data.emoji || undefined,
        sku: parsed.data.sku || undefined,
        barcode: parsed.data.barcode || undefined,
        variations: parsed.data.variations.map((v, i) => ({
          name: v.name,
          priceAdjustment: v.priceAdjustment,
          active: v.active,
          position: i,
        })),
        addonGroups: parsed.data.addonGroups.map((g, gi) => ({
          name: g.name,
          minSelections: g.minSelections,
          maxSelections: g.maxSelections,
          required: g.required,
          position: gi,
          addons: g.addons.map((a, ai) => ({
            name: a.name,
            price: a.price,
            active: a.active,
            position: ai,
          })),
        })),
      },
      user.id,
    );

    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function updateProductAction(
  productId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');

    const parsed = productSchema.safeParse(productFromForm(formData));
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await catalog.updateProduct(organizationId, productId, {
      ...parsed.data,
      categoryId: parsed.data.categoryId || undefined,
      imageUrl: parsed.data.imageUrl || undefined,
      description: parsed.data.description || undefined,
      emoji: parsed.data.emoji || undefined,
      sku: parsed.data.sku || undefined,
      barcode: parsed.data.barcode || undefined,
      variations: parsed.data.variations.map((v, i) => ({
        name: v.name,
        priceAdjustment: v.priceAdjustment,
        active: v.active,
        position: i,
      })),
      addonGroups: parsed.data.addonGroups.map((g, gi) => ({
        name: g.name,
        minSelections: g.minSelections,
        maxSelections: g.maxSelections,
        required: g.required,
        position: gi,
        addons: g.addons.map((a, ai) => ({
          name: a.name,
          price: a.price,
          active: a.active,
          position: ai,
        })),
      })),
    });

    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    await catalog.deleteProduct(organizationId, productId);
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function duplicateProductAction(productId: string): Promise<ActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = duplicateProductSchema.safeParse({ productId });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await catalog.duplicateProduct(organizationId, parsed.data.productId);
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Edição inline de preço na tabela. */
export async function updateProductPriceAction(input: {
  productId: string;
  price: number;
  promotionalPrice?: number | null;
}): Promise<ActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = productPriceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await catalog.updateProductPrice(
      organizationId,
      parsed.data.productId,
      parsed.data.price,
      parsed.data.promotionalPrice ?? null,
    );

    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function toggleProductAction(input: {
  productId: string;
  field: 'active' | 'available';
  value: boolean;
}): Promise<ActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = toggleProductSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await catalog.toggleProduct(
      organizationId,
      parsed.data.productId,
      parsed.data.field,
      parsed.data.value,
    );

    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── ESTOQUE ────────────────────────────────────────────────────────────

/** Ajuste relativo: +10 entrada, −3 saída. Sempre gera movimento. */
export async function adjustStockAction(input: {
  productId: string;
  quantity: number;
  reason?: string;
}): Promise<ActionResult<Awaited<ReturnType<typeof adjustStockData>>>> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = stockAdjustmentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await adjustStockData(
      organizationId,
      parsed.data.productId,
      parsed.data.quantity,
      parsed.data.reason,
      user.id,
    );

    revalidateCatalog();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Inventário: define o saldo absoluto e registra a diferença. */
export async function setStockAction(input: {
  productId: string;
  newStock: number;
  reason?: string;
}): Promise<ActionResult<Awaited<ReturnType<typeof setStock>>>> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = stockSetSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await setStock(
      organizationId,
      parsed.data.productId,
      parsed.data.newStock,
      parsed.data.reason,
      user.id,
    );

    revalidateCatalog();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── CATEGORIAS ─────────────────────────────────────────────────────────

export async function createCategoryAction(formData: FormData): Promise<ActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = categorySchema.safeParse({
      name: formData.get('name'),
      emoji: str(formData.get('emoji')),
      position: Math.max(0, Math.round(num(formData.get('position')) ?? 0)),
      active: bool(formData.get('active')) ?? true,
    });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await catalog.createCategory(organizationId, parsed.data);
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function updateCategoryAction(
  categoryId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = categorySchema.partial().safeParse({
      name: str(formData.get('name')),
      emoji: str(formData.get('emoji')),
      position: num(formData.get('position')),
      active: bool(formData.get('active')),
    });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    /**
     * Emoji apagado precisa APAGAR.
     *
     * `optionalText` transforma string vazia em `undefined`, e `undefined`
     * no Prisma quer dizer "não mexe" — então remover o emoji e salvar
     * traria o antigo de volta, como se o campo tivesse sido ignorado.
     * O formulário desta ação manda sempre o campo inteiro, então vazio
     * aqui significa mesmo "sem emoji": vira null e a coluna é limpa.
     */
    await catalog.updateCategory(organizationId, categoryId, {
      ...parsed.data,
      ...(parsed.data.emoji === undefined ? { emoji: null } : {}),
    });
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    await catalog.deleteCategory(organizationId, categoryId);
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── MODELO DO SEGMENTO ─────────────────────────────────────────────────

/**
 * "Escolher do modelo": copia o catálogo-modelo do segmento para
 * Product. A partir daí o catálogo é só desta loja — mexer no template
 * do código não altera mais nada aqui.
 */
export async function applyTemplateAction(input: {
  businessType?: BusinessType;
  replaceExisting?: boolean;
}): Promise<ActionResult<{ categories: number; products: number }>> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = applyTemplateSchema.safeParse({
      replaceExisting: input.replaceExisting ?? false,
    });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    // O segmento é o da própria organização. Aceitar o segmento vindo do
    // formulário deixaria alguém importar um catálogo de outro ramo, mas
    // pior: seria mais um campo controlado pelo cliente sem necessidade.
    const organization = await getOrganizationById(organizationId);
    const businessType = organization?.businessType ?? BusinessType.SNACK_BAR;

    const result = await catalog.applySegmentTemplate(organizationId, businessType, {
      replaceExisting: parsed.data.replaceExisting,
    });

    revalidateCatalog();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── REVALIDAÇÃO ────────────────────────────────────────────────────────

/**
 * Catálogo mudou → painel e loja pública precisam refletir.
 * O slug da loja é lido da sessão para não invalidar cache de outra.
 */
function revalidateCatalog() {
  revalidatePath('/app/catalogo');
  revalidatePath('/app/estoque');
  revalidatePath('/app/dashboard');
  revalidatePath('/loja', 'layout');
}



