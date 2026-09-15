'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { BusinessType } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { slugExists } from '@/lib/data/organization';
import { copyGlobalProductsTx } from '@/lib/data/global-catalog';
import {
  suggestedCategoriesFor,
  SEGMENT_CATEGORIES,
  type RestaurantStyle,
  type SuggestedCategory,
} from '@/data/global-catalog';
import { completeOnboardingV2Schema } from '@/lib/validations/organization';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONBOARDING (2ª versão) — 6 passos, com a BIBLIOTECA GLOBAL
 * -----------------------------------------------------------------------
 *   1. Tipo do estabelecimento  (e estilo, se for restaurante)
 *   2. Nome, logo e identidade
 *   3. Categorias que trabalha  (sugeridas + extras)
 *   4. Produtos da biblioteca   (marcar / selecionar todos / limpar)
 *   5. Preços                   (edição rápida por item)
 *   6. Entrega e finalização
 *
 * Diferença central em relação à v1: os produtos NÃO são mais copiados de
 * um array no código. Vêm da biblioteca da plataforma, e o Product criado
 * guarda só o VÍNCULO com o GlobalProduct — a imagem continua sendo um
 * arquivo único, compartilhado por todas as lojas.
 *
 * Rodar novamente não duplica: a cópia é idempotente por globalProductId
 * e as categorias são idempotentes por nome.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type OnboardingV2State =
  | { error?: string; field?: string; slug?: string; created?: number }
  | undefined;

/**
 * Sugestões de categoria para o passo 3, já com o estilo aplicado.
 *
 * A regra de merge saiu daqui para `suggestedCategoriesFor` (data/global-catalog),
 * porque o wizard v3 precisa da MESMA lista no cliente — e lista de tela
 * diferente da lista gravada é como se perde categoria sem ninguém notar.
 */
export async function getSuggestedCategoriesAction(input: {
  businessType: string;
  restaurantStyle?: string | null;
}): Promise<SuggestedCategory[]> {
  return suggestedCategoriesFor(
    input.businessType as BusinessType,
    (input.restaurantStyle as RestaurantStyle) ?? null,
  );
}

/** Lista de categorias conhecidas do segmento — para o campo "outra". */
export async function getAllKnownCategoriesAction(businessType: string): Promise<string[]> {
  const type = businessType as BusinessType;
  return (SEGMENT_CATEGORIES[type] ?? []).map((c) => c.name);
}

/**
 * Passo final. Tudo numa transação.
 *
 * Se qualquer parte falhar — criar a organização, copiar 200 produtos da
 * biblioteca, gravar um preço — nada fica pela metade. Loja criada e
 * vazia seria pior do que erro visível.
 */
export async function completeOnboardingV2Action(
  _prev: OnboardingV2State,
  formData: FormData,
): Promise<OnboardingV2State> {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  // Quem já tem loja não cria outra por aqui.
  const existingMembership = await prisma.organizationUser.findFirst({
    where: { userId, role: 'OWNER', active: true },
    select: { organizationId: true },
  });
  if (existingMembership) redirect('/app');

  const parsed = completeOnboardingV2Schema.safeParse({
    businessType: formData.get('businessType'),
    restaurantStyle: formData.get('restaurantStyle') || undefined,
    name: String(formData.get('name') ?? '').trim(),
    brandColor: formData.get('brandColor') || '#F15A24',
    logoUrl: formData.get('logoUrl') || undefined,
    description: formData.get('description') || undefined,
    phone: formData.get('phone') || undefined,
    whatsapp: formData.get('whatsapp') || undefined,
    minimumOrder: numberOr(formData.get('minimumOrder'), 0),
    baseDeliveryFee: numberOr(formData.get('baseDeliveryFee'), 0),
    extraKmFee: numberOr(formData.get('extraKmFee'), 0),
    deliveryRadius: numberOr(formData.get('deliveryRadius'), 8),
    averageDeliveryTime: Math.round(numberOr(formData.get('averageDeliveryTime'), 30)),
    openingHours: formData.get('openingHours') || undefined,
    categories: jsonOr(formData.get('categories'), []),
    globalProductIds: jsonOr(formData.get('globalProductIds'), []),
    prices: jsonOr(formData.get('prices'), {}),
    ownProducts: jsonOr(formData.get('ownProducts'), []),
  });

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Dados inválidos.', field: first?.path[0] as string };
  }

  const data = parsed.data;

  if (data.globalProductIds.length === 0 && data.ownProducts.length === 0) {
    return {
      error:
        'Escolha ao menos um produto da biblioteca ou crie um produto próprio para continuar.',
      field: 'globalProductIds',
    };
  }

  // Slug único a partir do nome digitado. Nunca pré-preenchido.
  const base = slugify(data.name) || 'loja';
  let slug = base;
  let attempt = 2;
  while (await slugExists(slug)) {
    slug = `${base}-${attempt++}`;
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const org = await tx.organization.create({
          data: {
            slug,
            name: data.name,
            businessType: data.businessType,
            brandColor: data.brandColor,
            logoUrl: data.logoUrl || null,
            description: data.description || null,
            phone: data.phone || null,
            whatsapp: data.whatsapp || null,
            openingHours: data.openingHours || null,
            minimumOrder: data.minimumOrder,
            baseDeliveryFee: data.baseDeliveryFee,
            extraKmFee: data.extraKmFee,
            deliveryRadius: data.deliveryRadius,
            averageDeliveryTime: data.averageDeliveryTime,
            storeStatus: 'OPEN',
            status: 'TRIAL',
            isDemo: false,
            // O estilo do restaurante fica em settings: é preferência de
            // sugestão, não uma regra de negócio. Guardar em coluna
            // própria engessaria a lista de estilos.
            settings: data.restaurantStyle
              ? { restaurantStyle: data.restaurantStyle }
              : undefined,
          },
        });

        // Criador vira OWNER.
        await tx.organizationUser.create({
          data: {
            organizationId: org.id,
            userId,
            role: 'OWNER',
            active: true,
            acceptedAt: new Date(),
          },
        });

        // ── Categorias escolhidas no passo 3 ──
        // Criadas ANTES da cópia: assim a cópia encontra a categoria pelo
        // nome e não cria uma duplicata.
        let position = 0;
        for (const category of data.categories) {
          await tx.category.create({
            data: {
              organizationId: org.id,
              name: category.name,
              slug: slugify(category.name) || `cat-${position}`,
              emoji: category.emoji ?? null,
              position: position++,
            },
          });
        }

        // ── Produtos da biblioteca global ──
        // Esta é a parte que NÃO duplica imagem: cada Product nasce com
        // globalProductId e customImageUrl nulo.
        const copy = await copyGlobalProductsTx(tx, org.id, data.globalProductIds, {
          prices: data.prices,
          skipExisting: true,
        });

        // ── Produtos próprios ("+ Criar produto próprio") ──
        for (const own of data.ownProducts) {
          const categoryName = own.categoryName || 'Meus produtos';
          let category = await tx.category.findFirst({
            where: { organizationId: org.id, name: categoryName },
            select: { id: true },
          });
          if (!category) {
            category = await tx.category.create({
              data: {
                organizationId: org.id,
                name: categoryName,
                slug: slugify(categoryName) || `cat-${position}`,
                emoji: '⭐',
                position: position++,
              },
              select: { id: true },
            });
          }

          await tx.product.create({
            data: {
              organizationId: org.id,
              categoryId: category.id,
              name: own.name,
              slug: `${slugify(own.name) || 'produto'}-${position}`,
              description: own.description ?? null,
              emoji: own.emoji ?? null,
              price: own.price,
              stock: 0,
              minimumStock: 0,
              trackStock: true,
              active: true,
              available: true,
              type: 'SIMPLE',
              position: position++,
            },
          });
        }

        // Caixa padrão: sem ele o lojista não consegue abrir turno.
        await tx.cashRegister.create({
          data: { organizationId: org.id, name: 'Caixa 1', active: true },
        });

        // Assinatura em trial no plano de entrada, quando já existir.
        const starterPlan = await tx.plan.findUnique({ where: { slug: 'starter' } });
        if (starterPlan) {
          await tx.subscription.create({
            data: {
              organizationId: org.id,
              planId: starterPlan.id,
              status: 'TRIAL',
              expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            },
          });
        }

        const productCount = await tx.product.count({ where: { organizationId: org.id } });
        return { slug: org.slug, created: copy.created, total: productCount };
      },
      // Cópia de biblioteca pode passar de 200 itens; o padrão de 5s não
      // é suficiente em conexão de banco remoto.
      { timeout: 30000 },
    );

    revalidatePath('/app', 'layout');
    revalidatePath('/onboarding');

    return { slug: result.slug, created: result.total };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Não foi possível criar o estabelecimento: ${error.message}`
          : 'Não foi possível criar o estabelecimento.',
    };
  }
}

/** Lê JSON de um campo hidden sem confiar no formato. */
function jsonOr<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function numberOr(value: FormDataEntryValue | null, fallback: number): number {
  if (value === null) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  // Aceita "29,90" e "29.90".
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}
