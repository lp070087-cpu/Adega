import { z } from 'zod';
import { ProductType } from '@prisma/client';
import { moneyInputSchema, optionalText, requiredText, slugSchema } from './common';

export const categorySchema = z.object({
  name: requiredText('Nome da categoria', 2, 60),
  emoji: optionalText(8),
  position: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

export const variationSchema = z.object({
  id: z.string().optional(),
  name: requiredText('Nome da variação', 1, 60),
  priceAdjustment: moneyInputSchema.default(0),
  active: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});

export const addonSchema = z.object({
  id: z.string().optional(),
  name: requiredText('Nome do adicional', 1, 60),
  price: moneyInputSchema.default(0),
  active: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});

export const addonGroupSchema = z.object({
  id: z.string().optional(),
  name: requiredText('Nome do grupo', 1, 60),
  minSelections: z.number().int().min(0).max(50).default(0),
  maxSelections: z.number().int().min(1).max(50).default(1),
  required: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
  addons: z.array(addonSchema).max(60).default([]),
});

export const productSchema = z
  .object({
    name: requiredText('Nome do produto', 2, 160),
    slug: slugSchema.optional(),
    categoryId: z.string().max(64).optional().or(z.literal('')),
    description: optionalText(1000),
    imageUrl: z.string().url('URL da imagem inválida').max(500).optional().or(z.literal('')),
    emoji: optionalText(8),
    sku: optionalText(60),
    barcode: optionalText(60),

    price: moneyInputSchema,
    promotionalPrice: moneyInputSchema.optional(),
    cost: moneyInputSchema.optional(),

    stock: z.number().int().min(0).max(999999).default(0),
    minimumStock: z.number().int().min(0).max(999999).default(0),
    trackStock: z.boolean().default(true),

    active: z.boolean().default(true),
    available: z.boolean().default(true),

    type: z.nativeEnum(ProductType).default('SIMPLE'),
    variations: z.array(variationSchema).max(50).default([]),
    addonGroups: z.array(addonGroupSchema).max(20).default([]),
  })
  .refine(
    (data) => data.promotionalPrice === undefined || data.promotionalPrice < data.price,
    {
      message: 'O preço promocional deve ser menor que o preço normal',
      path: ['promotionalPrice'],
    },
  )
  .refine(
    (data) => data.type !== 'VARIATION' || data.variations.length > 0,
    {
      message: 'Produto com variações precisa ter ao menos uma variação',
      path: ['variations'],
    },
  )
  .refine(
    (data) => data.type !== 'ADDONS' || data.addonGroups.length > 0,
    {
      message: 'Produto com adicionais precisa ter ao menos um grupo',
      path: ['addonGroups'],
    },
  );

/** Edição rápida de preço na tabela do catálogo. */
export const productPriceSchema = z.object({
  productId: z.string().min(1),
  price: moneyInputSchema,
  promotionalPrice: moneyInputSchema.optional(),
});

/** Liga/desliga a venda de um produto sem excluí-lo. */
export const toggleProductSchema = z.object({
  productId: z.string().min(1),
  field: z.enum(['active', 'available']),
  value: z.boolean(),
});

/** Ajuste manual de estoque — sempre registra InventoryMovement. */
export const stockAdjustmentSchema = z.object({
  productId: z.string().min(1),
  /** Positivo = entrada, negativo = saída. */
  quantity: z.number().int().refine((v) => v !== 0, 'Informe uma quantidade diferente de zero'),
  reason: optionalText(200),
});

/** Definir estoque absoluto (inventário). */
export const stockSetSchema = z.object({
  productId: z.string().min(1),
  newStock: z.number().int().min(0).max(999999),
  reason: optionalText(200),
});

/** Duplicar produto. */
export const duplicateProductSchema = z.object({
  productId: z.string().min(1),
});

/** Aplicar o catálogo-modelo do segmento (copia para Product). */
export const applyTemplateSchema = z.object({
  /** false = apenas completa o que falta, sem tocar no que já existe. */
  replaceExisting: z.boolean().default(false),
});

export type ProductInput = z.infer<typeof productSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
