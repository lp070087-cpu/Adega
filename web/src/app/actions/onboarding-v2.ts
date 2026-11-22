'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { BusinessType } from '@prisma/client';
import { auth } from '@/lib/auth';
import { toActionError } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { onboardingNumber as numberOr } from '@/lib/onboarding-number';
import { lockOnboardingAccount } from '@/lib/data/onboarding-guard';
import { slugExists } from '@/lib/data/organization';
import {
  suggestedCategoriesFor,
  SEGMENT_CATEGORIES,
  type RestaurantStyle,
  type SuggestedCategory,
} from '@/data/global-catalog';
import { completeOnboardingV2Schema } from '@/lib/validations/organization';

/** Compatibility for sessions started on the old onboarding flow. */
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

/** Creates the establishment and leaves its stock empty. */
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
  });

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Dados inválidos.', field: first?.path[0] as string };
  }

  const data = parsed.data;

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
        await lockOnboardingAccount(tx, userId);
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

        return { slug: org.slug };
      },
      { timeout: 30000 },
    );

    revalidatePath('/app', 'layout');
    revalidatePath('/onboarding');

    return { slug: result.slug, created: 0 };
  } catch (error) {
    return toActionError(error);
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
