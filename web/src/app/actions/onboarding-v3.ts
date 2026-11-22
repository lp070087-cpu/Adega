'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { toActionError } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { onboardingNumber as numberOr } from '@/lib/onboarding-number';
import { lockOnboardingAccount } from '@/lib/data/onboarding-guard';
import { validateImageUrl } from '@/lib/storage';
import {
  checkSlugAvailability,
  clearOnboardingDraft,
  resolveAvailableSlug,
  saveOnboardingDraft,
} from '@/lib/data/onboarding';
import { summarizeSchedule, type WeekdaySchedule } from '@/lib/schedule';
import {
  completeOnboardingV3Schema,
  onboardingDraftSchema,
} from '@/lib/validations/organization';

/** Creates the store, its schedule and operations with an empty stock and storefront. */
export type OnboardingV3State =
  | {
      error?: string;
      field?: string;
      slug?: string;
      created?: number;
      /** Gravado com sucesso no passo intermediário. */
      saved?: boolean;
    }
  | undefined;

/**
 * Salva o rascunho (passo 3.19).
 *
 * Chamado a cada "Continuar". Não cria nada: só grava o formulário para o
 * lojista poder fechar o navegador. O `userId` vem da sessão — não há
 * parâmetro capaz de escrever no rascunho de outra pessoa.
 */
export async function saveOnboardingDraftAction(
  step: number,
  draft: Record<string, unknown>,
): Promise<OnboardingV3State> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Sessão expirada. Entre novamente.' };

    const parsed = onboardingDraftSchema.safeParse({ step, draft });
    if (!parsed.success) return { error: 'Não foi possível salvar o progresso.' };

    await saveOnboardingDraft(session.user.id, parsed.data.step, parsed.data.draft);
    return { saved: true };
  } catch {
    // Falhar ao salvar rascunho NÃO pode travar o lojista no passo: ele
    // segue adiante, perde a retomada, mas não perde a sessão.
    return { error: 'Não foi possível salvar o progresso agora.' };
  }
}

/**
 * Prévia do endereço público (passo 3.5).
 *
 * Devolve também o slug livre quando o desejado está ocupado, para a tela
 * mostrar "burger-do-ze-2" antes de o lojista tentar continuar. A decisão
 * final continua sendo do servidor, na criação.
 */
export async function checkSlugAction(desired: string): Promise<{
  ok: boolean;
  slug?: string;
  available?: boolean;
  suggestion?: string;
  error?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { ok: false, error: 'Sessão expirada.' };

    const trimmed = String(desired ?? '').slice(0, 120);
    const check = await checkSlugAvailability(trimmed);

    return {
      ok: true,
      slug: check.slug,
      available: check.available,
      suggestion: check.available ? check.slug : await resolveAvailableSlug(trimmed),
    };
  } catch {
    return { ok: false, error: 'Não foi possível verificar o endereço.' };
  }
}

/**
 * Passo final. Cria o estabelecimento inteiro numa transação.
 */
export async function completeOnboardingV3Action(
  _prev: OnboardingV3State,
  formData: FormData,
): Promise<OnboardingV3State> {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  // Mesmas regras da página (requireOnboardingUser), reconferidas no banco:
  // a action pode ser chamada direto, sem passar pela tela. Só cria loja
  // quem tem conta ativa e NENHUM vínculo — de qualquer papel, ativo ou
  // não. Antes só o vínculo OWNER bloqueava, e um entregador ou membro da
  // equipe conseguia abrir uma loja nova.
  if (session.user.role === 'DRIVER') redirect('/entregador');
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!account?.active) redirect('/login?acessoRemovido=1');
  const existingMembership = await prisma.organizationUser.findFirst({
    where: { userId },
    select: { role: true, active: true },
    orderBy: { active: 'desc' },
  });
  if (existingMembership) {
    if (!existingMembership.active) redirect('/login?acessoRemovido=1');
    redirect(existingMembership.role === 'DRIVER' ? '/entregador' : '/app');
  }

  const parsed = completeOnboardingV3Schema.safeParse({
    businessType: formData.get('businessType'),
    restaurantStyle: formData.get('restaurantStyle') || undefined,

    name: String(formData.get('name') ?? '').trim(),
    brandColor: formData.get('brandColor') || '#F15A24',
    secondaryColor: formData.get('secondaryColor') || '',
    accentColor: formData.get('accentColor') || '',
    theme: formData.get('theme') || 'AUTO',
    logoUrl: formData.get('logoUrl') || undefined,
    description: formData.get('description') || undefined,

    responsibleName: formData.get('responsibleName') || undefined,
    phone: formData.get('phone') || undefined,
    whatsapp: formData.get('whatsapp') || undefined,
    email: formData.get('email') || undefined,
    document: formData.get('document') || undefined,
    zipCode: formData.get('zipCode') || undefined,
    address: formData.get('address') || undefined,
    addressNumber: formData.get('addressNumber') || undefined,
    addressComplement: formData.get('addressComplement') || undefined,
    district: formData.get('district') || undefined,
    city: formData.get('city') || undefined,
    state: formData.get('state') || undefined,

    slug: formData.get('slug') || undefined,

    minimumOrder: numberOr(formData.get('minimumOrder'), 0),
    baseDeliveryFee: numberOr(formData.get('baseDeliveryFee'), 0),
    extraKmFee: numberOr(formData.get('extraKmFee'), 0),
    deliveryRadius: numberOr(formData.get('deliveryRadius'), 8),
    averageDeliveryTime: Math.round(numberOr(formData.get('averageDeliveryTime'), 30)),
    allowPickup: boolOr(formData.get('allowPickup'), true),
    allowOwnDelivery: boolOr(formData.get('allowOwnDelivery'), true),
    allowMarketplace: boolOr(formData.get('allowMarketplace'), false),
    deliveryTiers: jsonOr(formData.get('deliveryTiers'), []),
    schedule: jsonOr(formData.get('schedule'), []),

    categories: jsonOr(formData.get('categories'), []),
  });

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      error: first?.message ?? 'Dados inválidos.',
      field: first?.path[0] as string,
    };
  }

  const data = parsed.data;

  // Precisa haver alguma forma de o cliente receber o pedido.
  if (!data.allowPickup && !data.allowOwnDelivery && !data.allowMarketplace) {
    return {
      error: 'Habilite ao menos uma forma de atendimento: retirada, entrega própria ou delivery.',
      field: 'allowPickup',
    };
  }

  let logo: string | null = null;
  try {
    logo = data.logoUrl ? validateImageUrl(data.logoUrl) : null;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Logo inválida.',
      field: 'logoUrl',
    };
  }

  const schedule = data.schedule as WeekdaySchedule[];
  const openingHours = summarizeSchedule(schedule);

  try {
    // Slug: o que o lojista confirmou na tela, ou o nome. Em ambos os
    // casos a unicidade é resolvida AQUI — a tela nunca decide o endereço
    // final. Dentro do try porque consulta banco: falha de conexão precisa
    // virar mensagem, não exceção solta.
    const slug = await resolveAvailableSlug(data.slug || data.name);

    const result = await prisma.$transaction(
      async (tx) => {
        await lockOnboardingAccount(tx, userId);
        const org = await tx.organization.create({
          data: {
            slug,
            name: data.name,
            businessType: data.businessType,
            brandColor: data.brandColor,
            secondaryColor: data.secondaryColor || null,
            accentColor: data.accentColor || null,
            theme: data.theme,
            logoUrl: logo,
            description: data.description || null,

            phone: data.phone || null,
            whatsapp: data.whatsapp || null,
            email: data.email || null,
            cnpj: data.document || null,

            address: data.address || null,
            addressNumber: data.addressNumber || null,
            addressComplement: data.addressComplement || null,
            district: data.district || null,
            city: data.city || null,
            state: data.state || null,
            zipCode: data.zipCode || null,

            openingHours,
            minimumOrder: data.minimumOrder,
            baseDeliveryFee: data.baseDeliveryFee,
            extraKmFee: data.extraKmFee,
            deliveryRadius: data.deliveryRadius,
            averageDeliveryTime: data.averageDeliveryTime,
            allowPickup: data.allowPickup,
            allowOwnDelivery: data.allowOwnDelivery,
            allowMarketplace: data.allowMarketplace,

            storeStatus: 'OPEN',
            status: 'TRIAL',
            isDemo: false,

            // settings guarda o que é PREFERÊNCIA, não regra de negócio:
            // o estilo do restaurante (sugestão) e a agenda estruturada
            // (o texto legível já foi para openingHours). Colunas para
            // isso engessariam listas que ainda vão mudar.
            settings: {
              ...(data.restaurantStyle ? { restaurantStyle: data.restaurantStyle } : {}),
              ...(data.responsibleName ? { responsibleName: data.responsibleName } : {}),
              ...(data.deliveryTiers.length ? { deliveryTiers: data.deliveryTiers } : {}),
              ...(schedule.length ? { openingHours: schedule } : {}),
              onboardingVersion: 3,
            },
          },
        });

        // Quem cria é OWNER. Vínculo conferido contra o userId da sessão.
        await tx.organizationUser.create({
          data: {
            organizationId: org.id,
            userId,
            role: 'OWNER',
            active: true,
            acceptedAt: new Date(),
          },
        });

        // ── Categorias ──
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

        // Sem caixa, o lojista não consegue abrir turno no primeiro dia.
        await tx.cashRegister.create({
          data: { organizationId: org.id, name: 'Caixa 1', active: true },
        });

        // Assinatura em trial, quando o plano de entrada já existir.
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

    // O rascunho cumpriu sua função. Apagar depois da transação: se a
    // criação falhasse, o lojista precisa reabrir exatamente onde parou.
    // A falha de limpeza não desfaz uma loja já criada com sucesso.
    await clearOnboardingDraft(userId).catch(() => undefined);

    revalidatePath('/app', 'layout');
    revalidatePath('/onboarding');

    return { slug: result.slug, created: 0 };
  } catch (error) {
    return toActionError(error);
  }
}

/** Lê JSON de campo hidden sem confiar no formato. */
function jsonOr<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}



/** Checkbox do HTML envia "on" quando marcado e nada quando desmarcado. */
function boolOr(value: FormDataEntryValue | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'true' || raw === 'on' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return fallback;
}
