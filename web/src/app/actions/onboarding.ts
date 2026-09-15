'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { buildTemplateProducts, applyPriceAdjustment } from '@/lib/data/template-copy';
import { slugExists } from '@/lib/data/organization';
import {
  completeOnboardingSchema,
  onboardingPricesSchema,
} from '@/lib/validations/organization';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONBOARDING — 5 etapas, gravação no banco
 * -----------------------------------------------------------------------
 *   1. Tipo de negócio
 *   2. Nome e identidade
 *   3. Produtos (quais itens do modelo copiar)
 *   4. Preços
 *   5. Finalização → cria Organization + Category + Product + OWNER
 *
 * O nome do estabelecimento é digitado pelo usuário. Nada é pré-preenchido
 * e nenhum nome de loja demo vem por padrão.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type OnboardingState = { error?: string; field?: string } | undefined;

/** Etapa 3: devolve os produtos-modelo do segmento escolhido para a tela. */
export async function getTemplateForStep(businessType: string) {
  const draft = buildTemplateProducts(businessType as Parameters<typeof buildTemplateProducts>[0]);
  return {
    label: draft.label,
    emoji: draft.emoji,
    brandColor: draft.brandColor,
    categories: draft.categories,
    products: draft.products.map((p) => ({
      name: p.name,
      categoryName: p.categoryName,
      price: p.price,
      emoji: p.emoji,
      description: p.description,
    })),
  };
}

/** Prévia dos preços (etapa 4) — não grava nada. */
export async function previewPrices(input: {
  businessType: string;
  multiplier: number;
  offset: number;
  roundToNinety: boolean;
  productNames: string[];
}) {
  const parsed = onboardingPricesSchema.safeParse({
    priceMultiplier: input.multiplier,
    priceOffset: input.offset,
    roundToNinety: input.roundToNinety,
  });
  if (!parsed.success) throw new Error('Parâmetros de preço inválidos.');

  const draft = buildTemplateProducts(
    input.businessType as Parameters<typeof buildTemplateProducts>[0],
  );
  const selected = draft.products.filter((p) => input.productNames.includes(p.name));
  const adjusted = applyPriceAdjustment(selected, {
    multiplier: parsed.data.priceMultiplier,
    offset: parsed.data.priceOffset,
    roundToNinety: parsed.data.roundToNinety,
  });

  return adjusted.map((p) => ({
    name: p.name,
    categoryName: p.categoryName,
    originalPrice: selected.find((s) => s.name === p.name)?.price ?? 0,
    price: p.price,
  }));
}

/**
 * Etapa final. Cria tudo numa transação: se qualquer parte falhar, não
 * sobra organização sem dono nem catálogo pela metade.
 */
export async function completeOnboardingAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  // Quem já tem loja não cria outra por aqui.
  const existingMembership = await prisma.organizationUser.findFirst({
    where: { userId, role: 'OWNER', active: true },
    select: { organizationId: true },
  });
  if (existingMembership) redirect('/app');

  const selectedProductNames = formData.getAll('productNames').map(String).filter(Boolean);

  const parsed = completeOnboardingSchema.safeParse({
    businessType: formData.get('businessType'),
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
    selectedProductNames,
  });

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Dados inválidos.', field: first?.path[0] as string };
  }

  const data = parsed.data;

  // Slug único a partir do nome digitado.
  const base = slugify(data.name) || 'loja';
  let slug = base;
  let attempt = 2;
  while (await slugExists(slug)) {
    slug = `${base}-${attempt++}`;
  }

  const draft = buildTemplateProducts(data.businessType);
  const selected = draft.products.filter((p) => data.selectedProductNames.includes(p.name));

  try {
    const organization = await prisma.$transaction(async (tx) => {
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

      // Categorias: só as que têm produto selecionado.
      const usedCategories = new Set(selected.map((p) => p.categoryName));
      const categoryIds = new Map<string, string>();

      let position = 0;
      for (const category of draft.categories) {
        if (!usedCategories.has(category.name)) continue;
        const created = await tx.category.create({
          data: {
            organizationId: org.id,
            name: category.name,
            slug: slugify(category.name) || `cat-${position}`,
            emoji: category.emoji,
            position: position++,
          },
        });
        categoryIds.set(category.name, created.id);
      }

      // Produtos: CÓPIA do modelo. Passam a pertencer só a esta loja.
      let productPosition = 0;
      for (const product of selected) {
        await tx.product.create({
          data: {
            organizationId: org.id,
            categoryId: categoryIds.get(product.categoryName) ?? null,
            name: product.name,
            slug: `${slugify(product.name) || 'produto'}-${productPosition}`,
            description: product.description,
            imageUrl: product.imageUrl,
            emoji: product.emoji,
            price: product.price,
            promotionalPrice: product.promotionalPrice,
            cost: product.cost,
            stock: product.stock,
            minimumStock: product.minimumStock,
            trackStock: true,
            active: true,
            available: true,
            type: product.type,
            position: productPosition++,
            ...(product.variations.length
              ? { variations: { create: product.variations } }
              : {}),
            ...(product.addons.length
              ? {
                  addonGroups: {
                    create: [
                      {
                        name: 'Adicionais',
                        minSelections: 0,
                        maxSelections: product.addons.length,
                        required: false,
                        position: 0,
                        addons: { create: product.addons },
                      },
                    ],
                  },
                }
              : {}),
          },
        });
      }

      // Caixa padrão: sem ele o lojista não consegue abrir turno.
      await tx.cashRegister.create({
        data: { organizationId: org.id, name: 'Caixa 1', active: true },
      });

      // Assinatura em trial no plano de entrada.
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

      return org;
    });

    revalidatePath('/app', 'layout');
    return { error: undefined, field: organization.slug };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Não foi possível criar o estabelecimento: ${error.message}`
          : 'Não foi possível criar o estabelecimento.',
    };
  }
}

/**
 * Depois de criada a organização, o JWT ainda diz organizationId: null.
 * Esta ação renova a sessão para o usuário entrar no painel já vinculado.
 */
export async function refreshSessionAfterOnboarding() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const membership = await prisma.organizationUser.findFirst({
    where: { userId: session.user.id, active: true },
    include: { organization: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (!membership) return { ok: false };

  return {
    ok: true,
    organizationId: membership.organizationId,
    role: membership.role,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
  };
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
