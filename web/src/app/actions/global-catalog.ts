'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import * as globalCatalog from '@/lib/data/global-catalog';
import { searchGlobalProducts } from '@/lib/data/global-catalog';
import { addFromLibrarySchema, globalSearchSchema } from '@/lib/validations/global-catalog';
import type { BusinessType } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BIBLIOTECA GLOBAL — server actions
 * -----------------------------------------------------------------------
 * A biblioteca global é SOMENTE LEITURA para o lojista. Ele não cria,
 * edita nem apaga produto global — isso é curadoria da plataforma.
 *
 * A única escrita daqui é a CÓPIA para o catálogo da organização, e por
 * isso ela exige MANAGE_PRODUCTS e recebe organizationId da sessão.
 *
 * Preço enviado pelo cliente é aceito no momento da cópia (é o lojista
 * decidindo o preço DELE). Preço de produto global não existe como
 * escrita — `suggestedPrice` é só uma dica da plataforma.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type GlobalActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

function firstIssue(error: z.ZodError): { error: string; field?: string } {
  const issue = error.errors[0];
  return { error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
}

/** Lê um JSON de dentro do FormData sem confiar no formato. */
function jsonValue(formData: FormData, key: string): unknown {
  const raw = formData.get(key);
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// ── BUSCA ──────────────────────────────────────────────────────────────

/**
 * Busca na biblioteca global. É chamada direto pelos componentes client
 * do seletor (paginação/filtro sem recarregar a página).
 *
 * Não exige organização: a biblioteca é pública para quem está logado, e
 * não contém dado de nenhuma loja. Ainda assim exige sessão — não faz
 * sentido expor o catálogo-mestre sem login.
 */
export async function searchGlobalProductsAction(input: {
  search?: string;
  categorySlug?: string;
  brand?: string;
  businessType?: BusinessType;
  page?: number;
}): Promise<GlobalActionResult<Awaited<ReturnType<typeof searchGlobalProducts>>>> {
  try {
    await requirePermission('MANAGE_PRODUCTS');
    const parsed = globalSearchSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await searchGlobalProducts(parsed.data);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── ADICIONAR AO CATÁLOGO ──────────────────────────────────────────────

/** "+ Adicionar da biblioteca" — recebe os ids e copia para a loja. */
export async function addFromLibraryAction(formData: FormData): Promise<
  GlobalActionResult<{
    created: number;
    skipped: number;
    categoriesCreated: number;
    productIds: string[];
  }>
> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');

    const parsed = addFromLibrarySchema.safeParse({
      productIds: jsonValue(formData, 'productIds') ?? [],
      prices: jsonValue(formData, 'prices'),
      categoryId: formData.get('categoryId') || undefined,
      featured: formData.get('featured') ?? false,
      skipExisting: formData.get('skipExisting') ?? true,
    });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await globalCatalog.addGlobalProductsToCatalog(
      organizationId,
      parsed.data.productIds,
      {
        prices: parsed.data.prices,
        categoryId: parsed.data.categoryId,
        featured: parsed.data.featured,
        skipExisting: parsed.data.skipExisting,
      },
    );

    revalidateCatalog();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// Nota: NÃO existe uma variante "para o onboarding" desta action.
//
// Existia, e foi removida por ser impossível de usar: ela exigia
// `requirePermission('MANAGE_PRODUCTS')`, que por sua vez exige vínculo
// com uma organização — que é justamente o que ainda não existe durante
// o onboarding. O onboarding V2 copia a biblioteca dentro da própria
// transação de criação da loja (`copyGlobalProductsTx`), então não
// precisa de action intermediária.

// ── IMAGEM PERSONALIZADA ───────────────────────────────────────────────

/**
 * Define (ou remove) a foto própria de um produto.
 *
 * Remover NÃO apaga arquivo nenhum: só zera `customImageUrl` e o produto
 * volta a usar a imagem global. É o comportamento pedido — "se a
 * personalizada for removida, voltar para a imagem padrão global".
 */
export async function setProductCustomImageAction(input: {
  productId: string;
  customImageUrl: string | null;
}): Promise<GlobalActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');

    const schema = z.object({
      productId: z.string().trim().min(1).max(64),
      customImageUrl: z
        .string()
        .trim()
        .max(2048)
        .nullable()
        // Bloqueia data: URI — imagem não mora no banco.
        .refine(
          (v) => v === null || !v.toLowerCase().startsWith('data:'),
          'Envie a imagem por upload, não em base64.',
        ),
    });

    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    // updateMany + organizationId no where: id adivinhado não edita
    // produto de outra loja.
    const { prisma } = await import('@/lib/db');
    const result = await prisma.product.updateMany({
      where: { id: parsed.data.productId, organizationId },
      data: {
        customImageUrl: parsed.data.customImageUrl,
        // Mantém imageUrl em sincronia para telas antigas que ainda leem
        // esse campo; a resolução oficial é custom → global.
        imageUrl: parsed.data.customImageUrl,
      },
    });
    if (result.count === 0) return { ok: false, error: 'Produto não encontrado.' };

    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── DESTAQUE NO HERO ───────────────────────────────────────────────────
//
// A regra de destaque (só produto ativo e disponível, entrar no fim da
// ordem) mora em `lib/data/combos.setProductFeatured`. Aqui só existe a
// action: duas implementações da mesma regra aceitariam coisas diferentes
// dependendo de qual tela chamou.

export async function toggleFeaturedAction(input: {
  productId: string;
  featured: boolean;
  position?: number;
}): Promise<GlobalActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const parsed = z
      .object({
        productId: z.string().trim().min(1).max(64),
        featured: z.boolean(),
        position: z.number().int().min(0).max(999).optional(),
      })
      .safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const { setProductFeatured } = await import('@/lib/data/combos');
    await setProductFeatured(organizationId, parsed.data.productId, parsed.data.featured);

    revalidatePath('/app/catalogo');
    revalidatePath('/app/minha-loja');
    revalidatePath('/loja', 'layout');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── REVALIDAÇÃO ────────────────────────────────────────────────────────

function revalidateCatalog() {
  revalidatePath('/app/catalogo');
  revalidatePath('/app/estoque');
  revalidatePath('/app/minha-loja');
  revalidatePath('/app/dashboard');
  revalidatePath('/loja', 'layout');
}
