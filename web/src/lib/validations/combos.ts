import { z } from 'zod';
import { idSchema, moneyInputSchema, optionalText, requiredText } from './common';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * COMBOS E OPERAÇÕES DE LOJA — validação (Fase 4)
 * -----------------------------------------------------------------------
 * Reaproveita os primitivos de ./common, que já são usados pelo catálogo
 * e pelo onboarding. Não existe uma segunda biblioteca de validação aqui:
 * é o mesmo Zod, com os mesmos limites de texto e de dinheiro.
 *
 * Os ids são validados por FORMA (string curta), não por existência. A
 * existência é conferida contra a organização no banco — validar "esse id
 * existe?" no Zod daria a falsa impressão de que a posse foi checada.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const comboItemSchema = z.object({
  productId: idSchema,
  quantity: z.number().int().min(1).max(99).default(1),
});

export const comboInputSchema = z
  .object({
    name: requiredText('Nome do combo', 2, 120),
    description: optionalText(500),
    imageUrl: z.string().url('URL da imagem inválida').max(500).optional().or(z.literal('')),
    price: moneyInputSchema,
    promotionalPrice: moneyInputSchema.optional(),
    categoryId: z.string().trim().max(64).optional().or(z.literal('')),
    active: z.boolean().default(true),
    featured: z.boolean().default(false),
    trackStock: z.boolean().default(false),
    stock: z.number().int().min(0).max(999999).default(0),
    items: z.array(comboItemSchema).min(2, 'Um combo precisa de pelo menos 2 itens').max(30),
  })
  .refine((data) => data.promotionalPrice === undefined || data.promotionalPrice < data.price, {
    message: 'O preço promocional deve ser menor que o preço do combo',
    path: ['promotionalPrice'],
  })
  .refine(
    // O mesmo produto duas vezes viraria duas linhas com quantidades
    // diferentes — é ambíguo para quem monta e para quem lê o pedido.
    (data) => new Set(data.items.map((i) => i.productId)).size === data.items.length,
    { message: 'O mesmo produto aparece mais de uma vez — some as quantidades', path: ['items'] },
  );

export const comboIdSchema = z.object({ productId: idSchema });

/** Reordenação por lista completa (4.9) — sem drag-and-drop. */
export const reorderSchema = z.object({
  ids: z.array(idSchema).min(1).max(500),
});

/** Disponibilidade rápida (4.10 / 4.12). */
export const availabilitySchema = z.object({
  productId: idSchema,
  available: z.boolean(),
});

/** Destaque no Hero (4.13). */
export const featureSchema = z.object({
  productId: idSchema,
  featured: z.boolean(),
});

/** Ajuste rápido de estoque (4.11 / 4.12). */
export const quickStockSchema = z.object({
  productId: idSchema,
  stock: z.number().int().min(0).max(999999),
});

// Os schemas de banner moram em ./store-ops, junto com as demais operações
// de loja. Tê-los também aqui daria duas definições da mesma coisa — e no
// dia em que uma mudasse, a outra tela passaria a aceitar o que esta
// recusa.
