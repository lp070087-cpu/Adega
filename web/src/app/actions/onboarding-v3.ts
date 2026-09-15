'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { BusinessType } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { validateImageUrl } from '@/lib/storage';
import { copyGlobalProductsTx, searchGlobalProducts, getGlobalCategoryTree, getGlobalBrands } from '@/lib/data/global-catalog';
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

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONBOARDING — v3 (Fase 3)
 * -----------------------------------------------------------------------
 * Diferença para a v2: a loja nasce COMPLETA. A v2 criava organização,
 * categorias, catálogo, caixa e assinatura. A v3 acrescenta o que faltava
 * para o estabelecimento operar de verdade sem passar por Configurações:
 * endereço, agenda por dia, modalidades de atendimento e faixas de frete.
 *
 * TRÊS COMPROMISSOS DESTE ARQUIVO:
 *
 *   1. NADA de "primeira organização do banco". A loja é criada do zero e
 *      vinculada ao usuário da SESSÃO. Não existe leitura de tenant aqui.
 *
 *   2. NADA de confiar na tela. Slug, preços, ids de produto global,
 *      categorias e endereço chegam do formulário e são revalidados pelo
 *      Zod. Um id de GlobalProduct de outra loja não existe — a biblioteca
 *      é da plataforma, e a cópia filtra por `active: true`.
 *
 *   3. TUDO numa transação. Loja criada com 60 produtos e sem caixa, ou
 *      com agenda pela metade, seria pior que um erro visível: o lojista
 *      acharia que terminou e descobriria o buraco depois.
 * ═══════════════════════════════════════════════════════════════════════
 */

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
 * Busca na BIBLIOTECA GLOBAL durante o onboarding (passo 3.9).
 *
 * POR QUE ESTA ACTION EXISTE, E NÃO A searchGlobalProductsAction:
 * aquela exige `requirePermission('MANAGE_PRODUCTS')` — que exige vínculo
 * com uma organização, que é exatamente o que ainda não existe aqui. O
 * wizard v2 chamava a action errada e recebia "sem permissão" no passo de
 * produtos; o passo ficava vazio e o lojista concluía sem catálogo.
 *
 * A guarda correta aqui é `auth()`: sessão de pessoa logada. E é suficiente
 * porque a biblioteca é da PLATAFORMA — GlobalProduct não tem
 * organizationId. Não há tenant a vazar: os mesmos itens aparecem para
 * qualquer loja. Nada desta action toca dado de estabelecimento.
 */
export async function searchLibraryAction(input: {
  search?: string;
  categorySlug?: string;
  brand?: string;
  businessType?: string;
  withImage?: boolean;
  page?: number;
}): Promise<{
  ok: boolean;
  items?: unknown[];
  total?: number;
  categories?: Array<{ name: string; slug: string; count: number }>;
  brands?: string[];
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Sessão expirada.' };

  try {
    const result = await searchGlobalProducts({
      search: input.search?.trim() || undefined,
      categorySlug: input.categorySlug || undefined,
      brand: input.brand || undefined,
      businessType: (input.businessType as BusinessType | undefined) || undefined,
      withImage: input.withImage || undefined,
      page: input.page && input.page > 0 ? input.page : 1,
      perPage: 60,
    });

    return {
      ok: true,
      items: result.items,
      total: result.total,
    };
  } catch {
    return { ok: false, error: 'Não foi possível carregar a biblioteca.' };
  }
}

/**
 * Filtros da biblioteca — categorias e marcas REAIS do acervo.
 *
 * Vêm do banco, não de uma lista fixa no código: se o acervo ainda não tem
 * imagem para certa categoria, ela aparece com a contagem verdadeira. O
 * passo 3.9 pede exatamente isso — mostrar só o que existe, sem inventar
 * item para preencher tela.
 */
export async function getLibraryFiltersAction(): Promise<{
  ok: boolean;
  categories?: Array<{ name: string; slug: string; count: number }>;
  brands?: string[];
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Sessão expirada.' };

  try {
    const [tree, brands] = await Promise.all([getGlobalCategoryTree(), getGlobalBrands()]);

    // Só categorias com acervo real. Categoria vazia no filtro é ruído.
    const categories = tree
      .filter((node) => node.productCount > 0)
      .map((node) => ({ name: node.name, slug: node.slug, count: node.productCount }));

    return { ok: true, categories, brands };
  } catch {
    return { ok: false, error: 'Não foi possível carregar os filtros.' };
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

  // Quem já tem loja não cria outra por aqui — e isto é reconferido no
  // banco, não no token: um JWT antigo pode não ter a organização.
  const existingMembership = await prisma.organizationUser.findFirst({
    where: { userId, role: 'OWNER', active: true },
    select: { organizationId: true },
  });
  if (existingMembership) redirect('/app');

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
    globalProductIds: jsonOr(formData.get('globalProductIds'), []),
    prices: jsonOr(formData.get('prices'), {}),
    ownProducts: jsonOr(formData.get('ownProducts'), []),
  });

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      error: first?.message ?? 'Dados inválidos.',
      field: first?.path[0] as string,
    };
  }

  const data = parsed.data;

  // A loja precisa VENDER alguma coisa. Sem catálogo, o painel abre vazio e
  // a vitrine também — e o lojista concluiu o cadastro achando que sim.
  if (data.globalProductIds.length === 0 && data.ownProducts.length === 0) {
    return {
      error: 'Escolha ao menos um produto da biblioteca ou crie um produto próprio.',
      field: 'globalProductIds',
    };
  }

  // Precisa haver alguma forma de o cliente receber o pedido.
  if (!data.allowPickup && !data.allowOwnDelivery && !data.allowMarketplace) {
    return {
      error: 'Habilite ao menos uma forma de atendimento: retirada, entrega própria ou delivery.',
      field: 'allowPickup',
    };
  }

  // ── Imagens: validação que NÃO derruba a action ──
  //
  // validateImageUrl LANÇA em data: e em esquema não-http(s). Isso é certo
  // para quem chama de dentro de um try — e errado aqui: este trecho roda
  // fora do try da transação, então um base64 colado no campo derrubaria a
  // action inteira e a tela ficaria travada em "salvando" para sempre.
  //
  // Zod aceita data: como URL válida, então a barreira real é esta. Aqui a
  // exceção vira mensagem.
  try {
    for (const own of data.ownProducts) {
      if (!own.imageUrl) continue;
      own.imageUrl = validateImageUrl(own.imageUrl) ?? undefined;
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Imagem do produto inválida.',
      field: 'ownProducts',
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

  // A UNIDADE não vira coluna. `Product` não tem `unit` — o schema a
  // guarda em GlobalProduct, para a biblioteca. Aqui ela é rótulo de
  // exibição e entra na descrição; criar a coluna agora seria duplicar um
  // conceito que a biblioteca já resolve, e o preço por quilo se lê na
  // descrição. Quando houver tela que PRECISE filtrar por unidade, a
  // coluna se justifica — hoje não há.
  for (const own of data.ownProducts) {
    if (!own.unit || own.description?.includes(own.unit)) continue;
    own.description = own.description ? `${own.description} · ${own.unit}` : own.unit;
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
        // Antes da cópia da biblioteca: assim a cópia acha a categoria pelo
        // nome e não cria uma segunda com o mesmo sentido.
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

        // ── Biblioteca global ──
        // Product nasce com globalProductId e customImageUrl nulo: o
        // arquivo de imagem continua sendo UM só, da plataforma.
        const copy = await copyGlobalProductsTx(tx, org.id, data.globalProductIds, {
          prices: data.prices,
          skipExisting: true,
        });

        // ── Produtos próprios ──
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
              imageUrl: own.imageUrl || null,
              emoji: own.emoji ?? null,
              price: own.price,
              stock: own.stock,
              minimumStock: 0,
              trackStock: true,
              active: own.active,
              available: own.active,
              type: 'SIMPLE',
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

        const productCount = await tx.product.count({ where: { organizationId: org.id } });
        return { slug: org.slug, total: productCount, copied: copy.created };
      },
      // Copiar 200+ produtos em banco remoto não cabe nos 5s padrão.
      { timeout: 30000 },
    );

    // O rascunho cumpriu sua função. Apagar depois da transação: se a
    // criação falhasse, o lojista precisa reabrir exatamente onde parou.
    await clearOnboardingDraft(userId);

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

/** Lê JSON de campo hidden sem confiar no formato. */
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
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Checkbox do HTML envia "on" quando marcado e nada quando desmarcado. */
function boolOr(value: FormDataEntryValue | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'true' || raw === 'on' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return fallback;
}
