import { z } from 'zod';
import {
  deliveryTierSchema,
  weekScheduleSchema,
} from './organization';
import { hexColorSchema, moneySchema, optionalText, requiredText } from './common';

/**
 * Validação das telas de operação (Fase 4).
 *
 * `deliveryTierSchema` e `weekScheduleSchema` vêm do arquivo de
 * organização porque foram criados no onboarding (3.15/3.16). Reusar é o
 * ponto: se a faixa de frete tivesse duas definições, uma tela aceitaria
 * algo que a outra recusa — e a diferença só apareceria em produção.
 */

export const saveScheduleSchema = z.object({
  schedule: weekScheduleSchema,
});

export const saveDeliverySchema = z.object({
  allowPickup: z.boolean().default(true),
  allowOwnDelivery: z.boolean().default(true),
  allowMarketplace: z.boolean().default(false),
  minimumOrder: moneySchema.default(0),
  baseDeliveryFee: moneySchema.default(0),
  extraKmFee: moneySchema.default(0),
  deliveryRadius: z.number().min(0.5).max(100).default(8),
  averageDeliveryTime: z.number().int().min(5).max(180).default(30),
  deliveryTiers: z.array(deliveryTierSchema).max(10).default([]),
  // Modo de taxa. Texto, igual ao banco — um enum aqui deixaria a validação
  // mais rígida que o model, e a queda para FIXED é feita no saveDelivery.
  deliveryFeeMode: z.enum(['FIXED', 'BY_NEIGHBORHOOD', 'BY_DISTANCE_BAND']).default('FIXED'),
});

/**
 * Coordenadas do estabelecimento.
 *
 * Separado de `saveDeliverySchema` de propósito: coordenada não é uma
 * variável da regra de frete, é a posição da loja. Quem grava é a ação de
 * coordenadas, que responde na hora para o lojista ver o ponto no esquema
 * sem salvar a aba de entrega inteira.
 *
 * Nulo é aceito e é um estado legítimo: significa "ainda não temos a
 * posição da loja", e o cálculo degrada para a taxa base em vez de estimar.
 */
export const storeCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});

/**
 * Endereço de geocodificação. É só o texto que vai para o provedor —
 * montado aqui para que o mesmo endereço seja usado por qualquer tela que
 * precise resolver coordenada, sem cada uma inventar a própria concatenação.
 */
export const geocodeQuerySchema = z.object({
  address: z.string().trim().min(3, 'Informe o endereço da loja.').max(300),
  addressNumber: optionalText(20),
  district: optionalText(120),
  city: optionalText(120),
  state: optionalText(2),
  zipCode: optionalText(10),
});

/**
 * Bairro com taxa. Distância e coordenada são informativas (mapa) — nunca
 * a fonte do preço. O preço é `fee`.
 */
export const deliveryZoneSchema = z.object({
  name: requiredText('Nome do bairro', 2, 120),
  fee: moneySchema.default(0),
  active: z.boolean().default(true),
  distanceKm: z.number().min(0).max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export const saveVisualIdentitySchema = z.object({
  brandColor: hexColorSchema,
  secondaryColor: hexColorSchema.nullable().optional(),
  accentColor: hexColorSchema.nullable().optional(),
  // Texto e não enum: tema é preferência de apresentação, e acrescentar
  // um tema não deve exigir migração de enum.
  theme: z.enum(['AUTO', 'LIGHT', 'DARK']).default('AUTO'),
  logoUrl: z.string().url('URL da logo inválida').max(500).nullable().optional(),
});

export const storeBannerInputSchema = z.object({
  title: requiredText('Título do banner', 2, 80),
  subtitle: optionalText(160),
  // A imagem de um banner tem DUAS origens possíveis:
  //
  //   • upload  → o arquivo sobe pelo storage e vira uma URL http(s);
  //   • acervo  → um arquivo que já está em `public/catalog/banners/`,
  //               referenciado como `/catalog/banners/<arquivo>`.
  //
  // Por isso `z.string().url()` saiu daqui: ele recusa a segunda origem.
  // O campo continua sendo texto (nada de binário), e a barreira de
  // verdade passou a ser `validateBannerImagePath()` — chamada pelas duas
  // ações de banner, que é quem decide de fato o que entra no banco. Aqui
  // só se garante que é texto não vazio e de tamanho são.
  //
  // `validateImageUrl()` NÃO foi afrouxada: ela segue valendo para logo e
  // demais imagens do sistema, exigindo http(s).
  imagePath: z.string().trim().min(1, 'Informe a imagem do banner.').max(500),
  linkUrl: z.string().trim().url('Link inválido').max(500).optional().or(z.literal('')),
  active: z.boolean().default(true),
});

export type SaveDeliveryInput = z.infer<typeof saveDeliverySchema>;
export type StoreBannerInput = z.infer<typeof storeBannerInputSchema>;
