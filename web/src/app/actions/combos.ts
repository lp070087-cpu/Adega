'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import * as combos from '@/lib/data/combos';
import {
  availabilitySchema,
  comboIdSchema,
  comboInputSchema,
  featureSchema,
  quickStockSchema,
  reorderSchema,
} from '@/lib/validations/combos';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * COMBOS, ORDENAÇÃO E DISPONIBILIDADE — server actions (Fase 4)
 * -----------------------------------------------------------------------
 * Três regras que valem para TUDO neste arquivo:
 *
 *   1. `organizationId` nunca vem do cliente. Vem de requirePermission(),
 *      que lê o vínculo do usuário da SESSÃO no banco. Não existe
 *      parâmetro de organização em nenhuma assinatura daqui — e é de
 *      propósito: sem parâmetro não há o que forjar.
 *
 *   2. Todo id que chega (produto, combo, categoria) é validado por forma
 *      no Zod e por POSSE no banco. As funções de dados filtram por
 *      `{ id, organizationId }` em updateMany/deleteMany, então um id de
 *      outra loja simplesmente não encontra linha — e vira erro, não
 *      escrita silenciosa.
 *
 *   3. A permissão é reconferida no servidor a cada chamada. Esconder o
 *      botão na tela é conveniência; isto aqui é a barreira.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type ComboActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

function firstIssue(error: z.ZodError): { error: string; field?: string } {
  const issue = error.errors[0];
  return { error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
}

function revalidateCatalog() {
  revalidatePath('/app/catalogo');
  revalidatePath('/app/combos');
  revalidatePath('/app/estoque');
  revalidatePath('/app/minha-loja');
  revalidatePath('/app/dashboard');
  revalidatePath('/loja', 'layout');
}

// ── COMBOS ─────────────────────────────────────────────────────────────

export async function createComboAction(input: unknown): Promise<ComboActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = comboInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const data = parsed.data;
    await combos.createCombo(organizationId, {
      name: data.name,
      description: data.description ?? null,
      imageUrl: data.imageUrl || null,
      price: data.price,
      promotionalPrice: data.promotionalPrice ?? null,
      categoryId: data.categoryId || null,
      active: data.active,
      featured: data.featured,
      trackStock: data.trackStock,
      stock: data.stock,
      items: data.items,
    });

    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function updateComboAction(
  productId: string,
  input: unknown,
): Promise<ComboActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');

    const id = comboIdSchema.safeParse({ productId });
    if (!id.success) return { ok: false, ...firstIssue(id.error) };

    const parsed = comboInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const data = parsed.data;
    await combos.updateCombo(organizationId, id.data.productId, {
      name: data.name,
      description: data.description ?? null,
      imageUrl: data.imageUrl || null,
      price: data.price,
      promotionalPrice: data.promotionalPrice ?? null,
      categoryId: data.categoryId || null,
      active: data.active,
      featured: data.featured,
      trackStock: data.trackStock,
      stock: data.stock,
      items: data.items,
    });

    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/**
 * Exclui o combo. O produto componente NÃO é tocado — só o vínculo.
 * Apagar o combo nunca pode apagar a Coca-Cola da loja.
 */
export async function deleteComboAction(productId: string): Promise<ComboActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');

    const parsed = comboIdSchema.safeParse({ productId });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await combos.deleteCombo(organizationId, parsed.data.productId);
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── ORDENAÇÃO (4.9) ────────────────────────────────────────────────────
//
// A tela manda a lista completa na ordem final; o servidor grava
// 0,1,2… Não há drag-and-drop: dois botões de subir/descer por linha
// resolvem, e a lista inteira numa transação não tem estado quebrado.

export async function reorderProductsAction(ids: string[]): Promise<ComboActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = reorderSchema.safeParse({ ids });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await combos.reorderProducts(organizationId, parsed.data.ids);
    revalidateCatalog();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function reorderCategoriesAction(ids: string[]): Promise<ComboActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = reorderSchema.safeParse({ ids });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await combos.reorderCategories(organizationId, parsed.data.ids);
    revalidateCatalog();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function reorderFeaturedAction(ids: string[]): Promise<ComboActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = reorderSchema.safeParse({ ids });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await combos.reorderFeaturedProducts(organizationId, parsed.data.ids);
    revalidateCatalog();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── DISPONIBILIDADE E DESTAQUE (4.10 / 4.12 / 4.13) ────────────────────

/** Pausa/retoma a venda sem despublicar o produto. */
export async function setAvailabilityAction(input: {
  productId: string;
  available: boolean;
}): Promise<ComboActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = availabilitySchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await combos.setProductAvailability(
      organizationId,
      parsed.data.productId,
      parsed.data.available,
    );
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function setFeaturedAction(input: {
  productId: string;
  featured: boolean;
}): Promise<ComboActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = featureSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await combos.setProductFeatured(
      organizationId,
      parsed.data.productId,
      parsed.data.featured,
    );
    revalidateCatalog();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/**
 * Ajuste rápido de estoque.
 *
 * Diferente de `adjustStockAction` (relativo, da tela de Estoque), aqui o
 * lojista digita o número que está na prateleira. Ambos registram
 * InventoryMovement — nenhum dos dois mexe no saldo sem deixar rastro.
 */
export async function quickSetStockAction(input: {
  productId: string;
  stock: number;
}): Promise<ComboActionResult> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = quickStockSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await combos.quickSetStock(
      organizationId,
      parsed.data.productId,
      parsed.data.stock,
      user.id,
    );
    revalidateCatalog();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

