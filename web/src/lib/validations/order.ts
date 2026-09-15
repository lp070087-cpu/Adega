import { z } from 'zod';
import { OrderSource, OrderStatus, PaymentMethod } from '@prisma/client';
import { optionalText, phoneSchema, requiredText, slugSchema } from './common';

/**
 * Item enviado pelo carrinho. O frontend manda QUEM e QUANTO — nunca
 * quanto custa: preço e total são recalculados no servidor a partir do
 * banco. É isso que impede o cliente de editar o preço pelo DevTools.
 */
export const cartItemSchema = z.object({
  productId: z.string().min(1, 'Produto inválido'),
  quantity: z.number().int().min(1, 'Quantidade mínima é 1').max(99, 'Quantidade máxima é 99'),
  variationId: z.string().max(64).optional(),
  addonIds: z.array(z.string().max(64)).max(30).default([]),
  notes: optionalText(200),
});

/**
 * Campos comuns ao pedido da loja pública e ao pedido de balcão.
 *
 * Estão separados do `checkoutSchema` porque aquele termina em `.refine()`,
 * e um ZodEffects não tem `.omit()` — derivar o schema do balcão a partir
 * dele deixaria de compilar. Assim os dois compartilham a mesma definição
 * de item, de modalidade e de troco sem duplicar campo nenhum.
 */
const orderBaseSchema = z.object({
  /**
   * Slug da loja. É a ÚNICA chave de tenant aceita do público — quem
   * compra é anônimo, então não há sessão de onde tirar a organização.
   *
   * Isto não abre brecha: o slug é resolvido no servidor para um
   * organizationId real, e `createOrderFromCheckout` filtra todo produto
   * por esse id. Produto de outra loja simplesmente não é encontrado.
   */
  slug: slugSchema,
  customerName: requiredText('Nome', 2, 120),
  customerPhone: phoneSchema,
  /**
   * Modalidade. Em RETIRADA o endereço não é exigido — pedir endereço de
   * quem vai buscar no balcão seria criar um campo obrigatório que não
   * tem uso, e o cliente travaria no checkout por nada.
   */
  deliveryType: z.enum(['DELIVERY', 'PICKUP']).default('DELIVERY'),
  deliveryAddress: optionalText(200),
  deliveryNumber: optionalText(20),
  deliveryDistrict: optionalText(120),
  deliveryCity: optionalText(120),
  deliveryZipCode: optionalText(9),
  deliveryLatitude: z.number().min(-90).max(90).optional(),
  deliveryLongitude: z.number().min(-180).max(180).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).default('CASH'),
  /** Troco para quanto. Só faz sentido em dinheiro — conferido abaixo. */
  changeFor: z.number().min(0).max(99999).optional(),
  notes: optionalText(300),
  items: z.array(cartItemSchema).min(1, 'O carrinho está vazio').max(80, 'Pedido muito grande'),
});

const orderRefinements = [
  (data: { deliveryType: string; deliveryAddress?: string }) =>
    data.deliveryType === 'PICKUP' || (data.deliveryAddress ?? '').length >= 5,
  (data: { changeFor?: number; paymentMethod: string }) =>
    data.changeFor === undefined || data.paymentMethod === 'CASH',
] as const;

const orderRefinementMessages = [
  { message: 'Endereço é obrigatório', path: ['deliveryAddress'] },
  // Troco só existe em dinheiro. Aceitar em PIX/cartão gravaria um número
  // que ninguém vai usar e que a operação leria como instrução.
  { message: 'Troco só se aplica a pagamento em dinheiro', path: ['changeFor'] },
];

export const checkoutSchema = orderBaseSchema
  .refine(orderRefinements[0], orderRefinementMessages[0])
  .refine(orderRefinements[1], orderRefinementMessages[1]);

/**
 * Pedido manual/balcão criado pelo painel.
 *
 * `slug` sai fora: aqui a loja vem da SESSÃO, não da URL. Manter o campo
 * obrigatório faria o balcão ter de inventar um slug — e, pior, abriria
 * a porta para lançar pedido na loja de outro.
 *
 * Nasce de `orderBaseSchema` (sem os refines) e não do schema público:
 * no balcão o endereço é opcional a rigor ("Retirada no balcão" é o
 * padrão), então travar o operador exigindo endereço de 5 caracteres
 * atrapalharia o uso real do caixa.
 */
export const manualOrderSchema = orderBaseSchema.omit({ slug: true }).extend({
  source: z.nativeEnum(OrderSource).default('MANUAL'),
  paymentStatus: z.enum(['PENDING', 'PAID']).default('PENDING'),
  discount: z.number().min(0).max(99999).default(0),
  deliveryFeeOverride: z.number().min(0).max(9999).optional(),
});

/** Transições de status do pedido. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['WAITING_DRIVER', 'DISPATCHED', 'CANCELLED'],
  WAITING_DRIVER: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

export const updateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.nativeEnum(OrderStatus),
  /** Motivo obrigatório no cancelamento — fica registrado no pedido. */
  reason: optionalText(200),
});

export const assignDriverSchema = z.object({
  orderId: z.string().min(1),
  driverId: z.string().min(1, 'Escolha um entregador'),
});

export const unassignDriverSchema = z.object({
  orderId: z.string().min(1),
});

export const updatePaymentSchema = z.object({
  orderId: z.string().min(1),
  paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
});

/** Filtros da central de pedidos. */
export const orderFilterSchema = z.object({
  status: z.array(z.nativeEnum(OrderStatus)).optional(),
  source: z.array(z.nativeEnum(OrderSource)).optional(),
  driverId: z.string().optional(),
  search: z.string().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(30),
});

/** Etapas do app do entregador. */
export const driverDeliveryStepSchema = z.object({
  deliveryId: z.string().min(1),
  step: z.enum(['ARRIVED_STORE', 'PICKED_UP', 'STARTED', 'ARRIVED_CUSTOMER', 'DELIVERED']),
  proofType: z.enum(['NONE', 'PHOTO', 'SIGNATURE', 'CODE']).optional(),
  proofValue: z.string().max(1000).optional(),
  notes: optionalText(300),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CartItemInput = z.infer<typeof cartItemSchema>;
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;

