import { z } from 'zod';
import { BusinessType, StoreStatus } from '@prisma/client';
import {
  emailSchema,
  hexColorSchema,
  moneySchema,
  optionalText,
  phoneSchema,
  requiredText,
  slugSchema,
  whatsappSchema,
  zipCodeSchema,
} from './common';

/** Etapa 1 do onboarding: tipo de negócio. */
export const onboardingTypeSchema = z.object({
  businessType: z.nativeEnum(BusinessType, {
    errorMap: () => ({ message: 'Escolha o tipo de negócio' }),
  }),
});

/** Etapa 2 do onboarding: nome e identidade. O nome é do LOJISTA. */
export const onboardingIdentitySchema = z.object({
  name: requiredText('Nome do estabelecimento', 2, 120),
  slug: slugSchema.optional(),
  businessType: z.nativeEnum(BusinessType),
  brandColor: hexColorSchema.optional(),
  /** URL do storage. Nesta fase aceitamos URL; base64 não é solução final. */
  logoUrl: z.string().url('URL da logo inválida').max(500).optional().or(z.literal('')),
  description: optionalText(400),
  phone: phoneSchema.optional(),
  whatsapp: whatsappSchema.optional(),
});

/** Etapa 4 do onboarding: preços (aplicados em massa ao catálogo copiado). */
export const onboardingPricesSchema = z.object({
  /** Multiplicador sobre o preço-modelo. 1 = manter. */
  priceMultiplier: z.number().min(0.1).max(5).default(1),
  /** Ajuste fixo em reais somado a cada item. */
  priceOffset: z.number().min(-100).max(500).default(0),
  /** Arredondar para terminar em ,90 / ,00. */
  roundToNinety: z.boolean().default(false),
});

/** Etapa 5 do onboarding: entrega e operação. */
export const onboardingDeliverySchema = z.object({
  minimumOrder: moneySchema.default(0),
  baseDeliveryFee: moneySchema.default(0),
  extraKmFee: moneySchema.default(0),
  deliveryRadius: z.number().min(0.5).max(100).default(8),
  averageDeliveryTime: z.number().int().min(5).max(180).default(30),
  openingHours: optionalText(200),
});

/** Passo final: cria organização + categorias + produtos numa transação. */
export const completeOnboardingSchema = z.object({
  businessType: z.nativeEnum(BusinessType),
  name: requiredText('Nome do estabelecimento', 2, 120),
  brandColor: hexColorSchema.default('#F15A24'),
  logoUrl: z.string().url().max(500).optional().or(z.literal('')),
  description: optionalText(400),
  phone: phoneSchema.optional(),
  whatsapp: whatsappSchema.optional(),
  minimumOrder: moneySchema.default(0),
  baseDeliveryFee: moneySchema.default(0),
  extraKmFee: moneySchema.default(0),
  deliveryRadius: z.number().min(0.5).max(100).default(8),
  averageDeliveryTime: z.number().int().min(5).max(180).default(30),
  openingHours: optionalText(200),
  /** Quais produtos-modelo copiar. Vazio = nenhum (loja começa sem catálogo). */
  selectedProductNames: z.array(z.string().max(160)).max(500).default([]),
});

// ─────────────────────────────────────────────────────────────────────
// ONBOARDING — versão com a BIBLIOTECA GLOBAL
// ─────────────────────────────────────────────────────────────────────

/**
 * Estilo do restaurante. Serve SÓ para afinar sugestão — não limita o
 * que o estabelecimento pode vender. Guardado em Organization.settings.
 */
export const restaurantStyleSchema = z.enum([
  'BRASILEIRA',
  'MARMITEX',
  'EXECUTIVO',
  'CHURRASCO',
  'MASSAS',
  'JAPONESA',
  'ARABE',
  'MEXICANA',
  'SAUDAVEL',
  'VARIADO',
  'OUTRO',
]);

/** Categorias que o lojista marcou no passo 3. */
const chosenCategoriesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(2, 'Nome de categoria muito curto').max(40),
      emoji: z.string().trim().max(8).optional(),
    }),
  )
  .max(40, 'Máximo de 40 categorias')
  .default([]);

/** Produto próprio criado no meio do onboarding (não vem da biblioteca). */
const ownProductInputSchema = z.object({
  name: z.string().trim().min(2, 'Nome do produto muito curto').max(120),
  categoryName: z.string().trim().max(40).optional(),
  emoji: z.string().trim().max(8).optional(),
  description: z.string().trim().max(500).optional(),
  price: z
    .number()
    .min(0, 'Preço não pode ser negativo')
    .max(999999.99, 'Preço acima do limite')
    .transform((v) => Math.round(v * 100) / 100),
});

/**
 * Passo final. Cria organização + vínculo + categorias + cópia da
 * biblioteca + produtos próprios, tudo numa transação.
 *
 * Nenhum preço vem "calculado" pelo cliente: o que chega é o preço que o
 * lojista digitou, e ele é revalidado aqui.
 */
export const completeOnboardingV2Schema = z.object({
  businessType: z.nativeEnum(BusinessType),
  restaurantStyle: restaurantStyleSchema.optional(),

  name: requiredText('Nome do estabelecimento', 2, 120),
  brandColor: hexColorSchema.default('#F15A24'),
  logoUrl: z.string().url('URL da logo inválida').max(500).optional().or(z.literal('')),
  description: optionalText(400),
  phone: phoneSchema.optional(),
  whatsapp: whatsappSchema.optional(),

  minimumOrder: moneySchema.default(0),
  baseDeliveryFee: moneySchema.default(0),
  extraKmFee: moneySchema.default(0),
  deliveryRadius: z.number().min(0.5).max(100).default(8),
  averageDeliveryTime: z.number().int().min(5).max(180).default(30),
  openingHours: optionalText(200),

  categories: chosenCategoriesSchema,

  /** Ids de GlobalProduct escolhidos na biblioteca. */
  globalProductIds: z.array(z.string().trim().min(1).max(64)).max(300).default([]),

  /** Preço digitado, por id de GlobalProduct. Ausente = usar o sugerido. */
  prices: z
    .record(
      z.string(),
      z.number().min(0).max(999999.99).transform((v) => Math.round(v * 100) / 100),
    )
    .default({}),

  /** Produtos que o lojista criou do zero. */
  ownProducts: z.array(ownProductInputSchema).max(100).default([]),
});

export type CompleteOnboardingV2Input = z.infer<typeof completeOnboardingV2Schema>;

// ─────────────────────────────────────────────────────────────────────
// ONBOARDING — v3 (Fase 3): dados completos do estabelecimento
// ─────────────────────────────────────────────────────────────────────

/** Tema da vitrine. Texto livre controlado; ver Organization.theme. */
export const storeThemeSchema = z.enum(['LIGHT', 'DARK', 'AUTO']);

/** Horário de um dia da semana. */
export const openingPeriodSchema = z
  .object({
    open: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário deve ser HH:MM'),
    close: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário deve ser HH:MM'),
  })
  .refine((p) => p.open !== p.close, 'Horário inicial e final iguais');

/**
 * Agenda da semana.
 *
 * Cada dia aceita VÁRIOS períodos (11:00–14:00 e 18:00–23:00), que é o
 * pedido do passo 3.16 — por isso é lista, e não um par fixo. Guardado em
 * Organization.settings.openingHours (Json), que já existe: não foi
 * criada tabela nova para não duplicar o que o campo livre já resolvia.
 */
export const weekScheduleSchema = z
  .array(
    z.object({
      /** 0 = domingo … 6 = sábado, como Date.getDay(). */
      weekday: z.number().int().min(0).max(6),
      closed: z.boolean().default(false),
      periods: z.array(openingPeriodSchema).max(4).default([]),
    }),
  )
  .max(7)
  .default([]);

/** Faixa de frete por distância (passo 3.15). */
export const deliveryTierSchema = z.object({
  /** Limite superior da faixa, em km. */
  upToKm: z.number().min(0.5).max(200),
  fee: moneySchema,
});

/** Produto próprio — versão completa do passo 3.11. */
const ownProductV3Schema = z.object({
  name: z.string().trim().min(2, 'Nome do produto muito curto').max(120),
  categoryName: z.string().trim().max(40).optional(),
  description: z.string().trim().max(500).optional(),
  /** Mantido para o assistente anterior continuar válido (superset). */
  emoji: z.string().trim().max(8).optional(),
  /** URL pública. Upload real depende de storage; base64 é recusado. */
  imageUrl: z.string().url('URL da imagem inválida').max(500).optional().or(z.literal('')),
  unit: z.string().trim().max(12).optional(),
  price: moneySchema,
  stock: z.number().int().min(0).max(999999).default(0),
  active: z.boolean().default(true),
});

/**
 * Passo final da v3. Estende a v2 com os campos que a Fase 3 acrescentou:
 * endereço completo, contatos, identidade de três cores, tema, agenda
 * semanal, modalidades de atendimento e faixas de frete.
 *
 * Os campos da v2 continuam aceitos sem alteração para não invalidar o
 * assistente antigo enquanto ele existir no projeto.
 */
export const completeOnboardingV3Schema = completeOnboardingV2Schema
  .omit({ ownProducts: true })
  .extend({
    // ── Identidade visual ──
    secondaryColor: hexColorSchema.optional().or(z.literal('')),
    accentColor: hexColorSchema.optional().or(z.literal('')),
    theme: storeThemeSchema.default('AUTO'),

    // ── Dados do estabelecimento (passo 3.4) ──
    responsibleName: optionalText(120),
    email: emailSchema.optional(),
    document: optionalText(20),
    zipCode: zipCodeSchema.optional(),
    address: optionalText(200),
    addressNumber: optionalText(20),
    addressComplement: optionalText(120),
    district: optionalText(120),
    city: optionalText(120),
    state: optionalText(2),

    // ── Slug confirmado na tela (passo 3.5) ──
    // Opcional: quando ausente o servidor deriva do nome. Quando presente
    // é revalidado e a unicidade é reconferida — a tela não decide isso.
    slug: slugSchema.optional(),

    // ── Entrega (3.14 / 3.15) ──
    allowPickup: z.boolean().default(true),
    allowOwnDelivery: z.boolean().default(true),
    allowMarketplace: z.boolean().default(false),
    deliveryTiers: z.array(deliveryTierSchema).max(10).default([]),

    // ── Horários (3.16) ──
    schedule: weekScheduleSchema,

    // ── Produtos próprios (3.11) ──
    ownProducts: z.array(ownProductV3Schema).max(100).default([]),
  });

export type CompleteOnboardingV3Input = z.infer<typeof completeOnboardingV3Schema>;

/** Rascunho salvo a cada passo (3.19). Nunca vira loja sozinho. */
export const onboardingDraftSchema = z.object({
  step: z.number().int().min(1).max(10),
  draft: z.record(z.string(), z.unknown()),
});

/** Checagem de disponibilidade do slug (passo 3.5). */
export const slugCheckSchema = z.object({
  slug: slugSchema,
});

/** Minha Loja — atualização da organização. */
export const updateOrganizationSchema = z.object({
  name: requiredText('Nome do estabelecimento', 2, 120),
  businessType: z.nativeEnum(BusinessType).optional(),
  brandColor: hexColorSchema.optional(),
  logoUrl: z.string().url('URL da logo inválida').max(500).optional().or(z.literal('')),
  description: optionalText(400),
  phone: phoneSchema.optional(),
  whatsapp: whatsappSchema.optional(),
  email: emailSchema.optional(),
  address: optionalText(200),
  addressNumber: optionalText(20),
  addressComplement: optionalText(120),
  district: optionalText(120),
  city: optionalText(120),
  state: optionalText(2),
  zipCode: zipCodeSchema.optional(),
  openingHours: optionalText(200),
  minimumOrder: moneySchema.optional(),
  deliveryRadius: z.number().min(0.5).max(100).optional(),
  baseDeliveryFee: moneySchema.optional(),
  extraKmFee: moneySchema.optional(),
  averageDeliveryTime: z.number().int().min(5).max(180).optional(),
});

/** Abrir/fechar a loja (status operacional). */
export const updateStoreStatusSchema = z.object({
  storeStatus: z.nativeEnum(StoreStatus),
});

/** Geração de slug a partir do nome, com desambiguação por sufixo. */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = base || 'loja';
  if (!(await exists(root))) return root;
  for (let i = 2; i < 100; i++) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  // Fallback improvável: sufixo aleatório.
  return `${root}-${Math.random().toString(36).slice(2, 8)}`;
}

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
