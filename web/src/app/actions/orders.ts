'use server';

import { revalidatePath } from 'next/cache';
import type { OrderStatus, PaymentMethod } from '@prisma/client';
import { requirePermission, requireOrg, toActionError } from '@/lib/auth/guards';
import { toNumber } from '@/lib/db';
import * as orders from '@/lib/data/orders';
import { registerOrderInCash } from '@/lib/data/cash';
import {
  assignDriverSchema,
  checkoutSchema,
  driverDeliveryStepSchema,
  manualOrderSchema,
  updateOrderStatusSchema,
  updatePaymentSchema,
} from '@/lib/validations/order';
import { canTransition } from '@/lib/validations/order';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PEDIDOS — server actions
 * -----------------------------------------------------------------------
 * Checkout: o corpo enviado NÃO tem campo de preço. O schema nem aceita.
 * Quem calcula subtotal, frete e total é priceCart(), no servidor.
 *
 * Operação: cada mudança de status é validada contra ALLOWED_TRANSITIONS —
 * não dá para pular de NOVO direto para ENTREGUE.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type OrderActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

/**
 * Checkout da loja pública. Recebe o slug (não a sessão): quem compra é
 * anônimo. O slug é resolvido no servidor para um organizationId real —
 * e produtos de outra loja nem aparecem na consulta.
 */
export async function checkoutAction(input: unknown): Promise<
  OrderActionResult<{ orderId: string; displayId: number; total: number }>
> {
  try {
    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    const { getPublicStoreBySlug } = await import('@/lib/data/organization');
    const store = await getPublicStoreBySlug(parsed.data.slug);
    if (!store) return { ok: false, error: 'Estabelecimento não encontrado.' };

    const result = await orders.createOrderFromCheckout(
      store.id,
      {
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        deliveryType: parsed.data.deliveryType,
        deliveryAddress: parsed.data.deliveryAddress,
        deliveryNumber: parsed.data.deliveryNumber,
        deliveryDistrict: parsed.data.deliveryDistrict,
        deliveryCity: parsed.data.deliveryCity,
        deliveryZipCode: parsed.data.deliveryZipCode,
        deliveryLatitude: parsed.data.deliveryLatitude,
        deliveryLongitude: parsed.data.deliveryLongitude,
        paymentMethod: parsed.data.paymentMethod as PaymentMethod,
        changeFor: parsed.data.changeFor,
        notes: parsed.data.notes,
      },
      parsed.data.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        variationId: i.variationId,
        addonIds: i.addonIds,
        notes: i.notes,
      })),
    );

    revalidatePath('/app/pedidos');
    revalidatePath(`/loja/${store.slug}`);

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof orders.CheckoutError) {
      return { ok: false, error: error.message, field: error.field };
    }
    return { ok: false, ...toActionError(error) };
  }
}

/** Pedido lançado no balcão pelo atendente. */
export async function createManualOrderAction(formData: FormData): Promise<OrderActionResult<Awaited<ReturnType<typeof orders.createOrderFromCheckout>>>> {
  try {
    const { organizationId } = await requirePermission('MANAGE_ORDERS');

    const items = parseJson(formData.get('items'));
    const parsed = manualOrderSchema.safeParse({
      customerName: formData.get('customerName') || undefined,
      customerPhone: formData.get('customerPhone') || undefined,
      deliveryAddress: formData.get('deliveryAddress') || undefined,
      deliveryNumber: formData.get('deliveryNumber') || undefined,
      deliveryDistrict: formData.get('deliveryDistrict') || undefined,
      paymentMethod: formData.get('paymentMethod'),
      source: formData.get('source') || 'COUNTER',
      notes: formData.get('notes') || undefined,
      items,
    });
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    // Balcão reaproveita a mesma máquina de preços da loja pública.
    const result = await orders.createOrderFromCheckout(
      organizationId,
      {
        customerName: parsed.data.customerName || 'Balcão',
        customerPhone: parsed.data.customerPhone || '00000000000',
        /**
         * Balcão sem endereço é RETIRADA. O operador digita endereço só
         * quando é entrega, então o próprio campo decide a modalidade — e
         * o texto "Retirada no balcão" que antes ia no lugar do endereço
         * deixou de virar um endereço falso na Central de Pedidos.
         */
        deliveryType: parsed.data.deliveryType === 'PICKUP' || !parsed.data.deliveryAddress
          ? 'PICKUP'
          : 'DELIVERY',
        deliveryAddress: parsed.data.deliveryAddress,
        deliveryNumber: parsed.data.deliveryNumber,
        deliveryDistrict: parsed.data.deliveryDistrict,
        paymentMethod: parsed.data.paymentMethod as PaymentMethod,
        changeFor: parsed.data.changeFor,
        notes: parsed.data.notes,
      },
      parsed.data.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        variationId: i.variationId,
        addonIds: i.addonIds,
        notes: i.notes,
      })),
    );

    revalidatePath('/app/pedidos');
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof orders.CheckoutError) {
      return { ok: false, error: error.message, field: error.field };
    }
    return { ok: false, ...toActionError(error) };
  }
}

/**
 * Muda o status. Além da permissão, valida a transição: o kanban não
 * deixa arrastar de "Novo" para "Entregue", e o servidor recusa mesmo
 * que alguém chame a action direto.
 */
export async function updateOrderStatusAction(input: {
  orderId: string;
  status: OrderStatus;
  reason?: string;
}): Promise<OrderActionResult> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_ORDERS');

    const parsed = updateOrderStatusSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    const current = await orders.getOrderById(organizationId, parsed.data.orderId);
    if (!current) return { ok: false, error: 'Pedido não encontrado.' };

    const from = current.status as OrderStatus;
    if (from !== parsed.data.status && !canTransition(from, parsed.data.status)) {
      return {
        ok: false,
        error: `Não é possível ir de "${from}" para "${parsed.data.status}".`,
      };
    }

    await orders.updateOrderStatus(organizationId, parsed.data.orderId, parsed.data.status, {
      reason: parsed.data.reason,
      userId: user.id,
    });

    // Venda entregue entra no turno de caixa aberto (idempotente).
    if (parsed.data.status === 'DELIVERED' && current.paymentMethod) {
      await registerOrderInCash(
        organizationId,
        parsed.data.orderId,
        current.paymentMethod as PaymentMethod,
        current.total,
      ).catch(() => undefined);
    }

    revalidateOrders();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Atribui entregador. Confere que ele é desta organização. */
export async function assignDriverAction(input: {
  orderId: string;
  driverId: string;
}): Promise<OrderActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_DRIVERS');
    const parsed = assignDriverSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    await orders.assignDriver(organizationId, parsed.data.orderId, parsed.data.driverId);
    revalidateOrders();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function unassignDriverAction(orderId: string): Promise<OrderActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_DRIVERS');
    await orders.unassignDriver(organizationId, orderId);
    revalidateOrders();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function updatePaymentStatusAction(input: {
  orderId: string;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  paymentMethod?: PaymentMethod;
}): Promise<OrderActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_CASH');

    // O tipo acima é só do TypeScript — em tempo de execução o corpo da
    // requisição pode trazer qualquer coisa. Sem este parse, um valor
    // inválido só seria barrado pelo Prisma, e a pessoa receberia o texto
    // cru de um erro de banco em vez de uma frase. O schema já existia em
    // validations/order.ts; faltava usá-lo.
    const parsed = updatePaymentSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados de pagamento inválidos.' };
    }

    await orders.updatePaymentStatus(
      organizationId,
      parsed.data.orderId,
      parsed.data.paymentStatus,
      parsed.data.paymentMethod,
    );
    revalidateOrders();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── APP DO ENTREGADOR ──────────────────────────────────────────────────

/**
 * Passo do fluxo do entregador:
 *   cheguei na loja → retirei → iniciei entrega → cheguei ao cliente → finalizei
 *
 * O pedido tem que estar atribuído ao PRÓPRIO entregador logado. Sem
 * essa checagem, um motorista conseguiria mexer na entrega de outro só
 * trocando o id na requisição.
 */
export async function driverStepAction(input: {
  orderId: string;
  step: 'ARRIVED_STORE' | 'PICKED_UP' | 'STARTED' | 'ARRIVED_CUSTOMER' | 'DELIVERED';
  notes?: string;
}): Promise<OrderActionResult> {
  try {
    const ctx = await requireOrg();
    const { prisma } = await import('@/lib/db');

    const driver = await prisma.driver.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.user.id, active: true },
      select: { id: true, name: true },
    });
    if (!driver) return { ok: false, error: 'Seu usuário não está vinculado a um entregador.' };

    const order = await prisma.order.findFirst({
      where: {
        id: input.orderId,
        organizationId: ctx.organizationId,
        driverId: driver.id,
      },
      include: { delivery: { select: { id: true } } },
    });
    if (!order) return { ok: false, error: 'Pedido não encontrado ou não atribuído a você.' };

    const parsed = driverDeliveryStepSchema.safeParse({
      deliveryId: order.delivery?.id ?? order.id,
      step: input.step,
      notes: input.notes,
    });
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Passo inválido.' };
    }

    // Cada passo do app empurra o pedido para o status correspondente.
    const target: OrderStatus =
      parsed.data.step === 'DELIVERED'
        ? 'DELIVERED'
        : parsed.data.step === 'STARTED' || parsed.data.step === 'ARRIVED_CUSTOMER'
          ? 'DISPATCHED'
          : 'WAITING_DRIVER';

    await prisma.$transaction(async (tx) => {
      await tx.delivery.updateMany({
        where: { orderId: order.id, organizationId: ctx.organizationId },
        data: deliveryStepData(parsed.data.step, parsed.data.notes),
      });

      if (target !== order.status && canTransition(order.status as OrderStatus, target)) {
        const now = new Date();
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: target,
            ...(target === 'DISPATCHED' ? { dispatchedAt: now } : {}),
            ...(target === 'DELIVERED'
              ? { deliveredAt: now, paymentStatus: 'PAID' as const }
              : {}),
          },
        });
      }

      if (target === 'DELIVERED') {
        await tx.driver.update({ where: { id: driver.id }, data: { status: 'ONLINE' } });
      }
    });

    // Baixa de estoque + lançamento no caixa ao concluir. Idempotentes.
    if (target === 'DELIVERED') {
      await orders
        .updateOrderStatus(ctx.organizationId, order.id, 'DELIVERED', { userId: ctx.user.id })
        .catch(() => undefined);
      await registerOrderInCash(
        ctx.organizationId,
        order.id,
        order.paymentMethod,
        toNumber(order.total),
      ).catch(() => undefined);
    }

    revalidatePath('/entregador');
    revalidateOrders();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

function deliveryStepData(
  step: 'ARRIVED_STORE' | 'PICKED_UP' | 'STARTED' | 'ARRIVED_CUSTOMER' | 'DELIVERED',
  notes?: string,
) {
  const now = new Date();
  switch (step) {
    case 'ARRIVED_STORE':
      return { status: 'ASSIGNED' as const, arrivedAt: now };
    case 'PICKED_UP':
      return { status: 'PICKED_UP' as const, pickedUpAt: now };
    case 'STARTED':
      return { status: 'IN_TRANSIT' as const, startedAt: now };
    case 'ARRIVED_CUSTOMER':
      return { status: 'ARRIVED' as const, arrivedAt: now };
    case 'DELIVERED':
      return { status: 'DELIVERED' as const, deliveredAt: now, notes: notes ?? undefined };
  }
}

/** Entregador fica online/offline no próprio app. */
export async function setMyDriverStatusAction(
  status: 'OFFLINE' | 'ONLINE' | 'RETURNING',
): Promise<OrderActionResult> {
  try {
    const ctx = await requireOrg();
    const { prisma } = await import('@/lib/db');

    const result = await prisma.driver.updateMany({
      where: { organizationId: ctx.organizationId, userId: ctx.user.id, active: true },
      data: { status },
    });
    if (result.count === 0) return { ok: false, error: 'Entregador não encontrado.' };

    revalidatePath('/entregador');
    revalidatePath('/app/entregadores');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Posição enviada pelo app do entregador. */
export async function sendDriverLocationAction(input: {
  latitude: number;
  longitude: number;
  accuracy?: number;
}): Promise<OrderActionResult> {
  try {
    const ctx = await requireOrg();
    const { recordDriverLocation } = await import('@/lib/data/drivers');
    const { prisma } = await import('@/lib/db');

    const driver = await prisma.driver.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.user.id, active: true },
      select: { id: true },
    });
    if (!driver) return { ok: false, error: 'Entregador não encontrado.' };

    await recordDriverLocation(ctx.organizationId, driver.id, input);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── auxiliares ─────────────────────────────────────────────────────────

function parseJson(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function revalidateOrders() {
  revalidatePath('/app/pedidos');
  revalidatePath('/app/dashboard');
  revalidatePath('/app/expedicao');
  revalidatePath('/app/caixa');
}

