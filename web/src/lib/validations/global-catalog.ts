import { z } from 'zod';
import { BusinessType } from '@prisma/client';
import { MAX_CATALOG_SELECTION } from '@/lib/stock-policy';

/**
 * Validação das operações da BIBLIOTECA GLOBAL.
 *
 * O que o cliente pode mandar: ids de produtos globais e o preço que ele
 * quer dar a cada um. O que ele NÃO pode mandar: organizationId (vem da
 * sessão) e nada que altere o produto global em si — o global é somente
 * leitura para o lojista.
 */

/** Lista de ids de produtos globais escolhidos. */
export const globalProductIdsSchema = z
  .array(z.string().trim().min(1).max(64))
  .min(1, 'Selecione ao menos um produto')
  .max(MAX_CATALOG_SELECTION, 'Selecione no máximo 1.000 produtos por vez');

/** Filtros do seletor — para busca server-side. */
export const globalSearchSchema = z.object({
  search: z.string().trim().max(80).optional(),
  categorySlug: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).optional(),
  businessType: z.nativeEnum(BusinessType).optional(),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

export type GlobalSearchInput = z.infer<typeof globalSearchSchema>;

/** Passo de preços do onboarding: id do Product da loja + preço. */
export const bulkPriceSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(64),
        price: z
          .number()
          .min(0, 'Preço não pode ser negativo')
          .max(999999.99, 'Preço acima do limite')
          .transform((v) => Math.round(v * 100) / 100),
      }),
    )
    .min(1, 'Informe ao menos um preço')
    .max(300),
});

export type BulkPriceInput = z.infer<typeof bulkPriceSchema>;

/** Categorias escolhidas no onboarding (nomes + emoji). */
export const onboardingCategoriesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(2, 'Nome de categoria muito curto').max(40),
      emoji: z.string().trim().max(8).optional(),
    }),
  )
  .min(1, 'Escolha ao menos uma categoria')
  .max(40, 'Máximo de 40 categorias');

/** Produto próprio criado durante o onboarding. */
export const ownProductSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120),
  categoryName: z.string().trim().max(40).optional(),
  price: z
    .number()
    .min(0)
    .max(999999.99)
    .transform((v) => Math.round(v * 100) / 100),
  description: z.string().trim().max(500).optional(),
  emoji: z.string().trim().max(8).optional(),
});

export type OwnProductInput = z.infer<typeof ownProductSchema>;
