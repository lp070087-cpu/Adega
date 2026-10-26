'use server';
import {parseMoneyInput} from '@/lib/money-input';

import { revalidatePath } from 'next/cache';
import { OperationError } from '@/lib/operation-error';
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
import { nextDriverStep } from '@/lib/validations/driver-flow';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import type { OrderStatus as DriverActiveStatus } from '@prisma/client';
/** Pedido com entregador conta como entrega ativa dele desde o aceite (ver src/lib/driver-statuses.ts). */
const DRIVER_ACTIVE_STATUSES: DriverActiveStatus[] = ['CONFIRMED', 'PREPARING', 'READY', 'WAITING_DRIVER', 'DISPATCHED'];


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
  OrderActionResult<{ orderId: string; displayId: number; total: number; discount:number;deliveryFee:number; payment?: { invoiceUrl: string | null; pixPayload: string | null; pixImage: string | null; billingType: string } | null; paymentError?: string }>
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

    // Pagamento online: só se a loja ativou e com CPF/CNPJ do pagador (exigido pelo provedor).
    const online = parsed.data.paymentMethod === 'ONLINE';
    if (online) {
      const { onlinePaymentUsable, readOnlinePayment } = await import('@/lib/order-payments');
      const { prisma } = await import('@/lib/db');
      const org = await prisma.organization.findUnique({ where: { id: store.id }, select: { settings: true } });
      if (!onlinePaymentUsable(readOnlinePayment(org?.settings))) return { ok: false, error: 'Pagamento online indisponível nesta loja. Escolha pagar na entrega.', field: 'paymentMethod' };
      const doc = parsed.data.payerDocument ?? '';
      if (!/^(\d{11}|\d{14})$/.test(doc)) return { ok: false, error: 'Informe o CPF (11 números) ou CNPJ (14) de quem paga.', field: 'payerDocument' };
      if (readOnlinePayment(org?.settings).provider === 'mercadopago' && !parsed.data.payerEmail) return { ok: false, error: 'Informe o e-mail de quem paga (exigido pelo Mercado Pago).', field: 'payerEmail' };
    }

    const portalAccount = process.env.CUSTOMER_PORTAL_ENABLED !== 'false' ? await (await import('@/lib/customer-portal/server')).portalSession(store.slug) : null;
    const result = await orders.createOrderFromCheckout(
      store.id,
      {
        idempotencyKey: parsed.data.idempotencyKey,
        couponCode: parsed.data.couponCode,
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        deliveryType: parsed.data.deliveryType,
        deliveryAddress: parsed.data.deliveryAddress,
        deliveryNumber: parsed.data.deliveryNumber,
        deliveryDistrict: parsed.data.deliveryDistrict,
        deliveryCity: parsed.data.deliveryCity,
        deliveryZipCode: parsed.data.deliveryZipCode,
        // Ponto confirmado pelo cliente no mapa: gravado como veio, nunca
        // trocado por coordenada aproximada do endereço.
        deliveryLatitude: parsed.data.deliveryType === 'PICKUP' ? undefined : parsed.data.deliveryLatitude,
        deliveryLongitude: parsed.data.deliveryType === 'PICKUP' ? undefined : parsed.data.deliveryLongitude,
        paymentMethod: parsed.data.paymentMethod as PaymentMethod,
        changeFor: parsed.data.changeFor,
        notes: [parsed.data.deliveryType !== 'PICKUP' && parsed.data.deliveryReference ? `Ponto de entrega: ${parsed.data.deliveryReference}` : null, parsed.data.notes].filter(Boolean).join('\n') || undefined,
      },
      parsed.data.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        variationId: i.variationId,
        addonIds: i.addonIds,
        notes: i.notes,
      })),
      portalAccount ? {id:portalAccount.id,sessionHash:portalAccount.portalSessionHash} : undefined,
    );

    revalidatePath('/app/pedidos');
    revalidatePath(`/loja/${store.slug}`);

    if (online) {
      // O pedido já existe; a cobrança é criada em seguida (uma por pedido).
      try {
        const { createOrderCharge } = await import('@/lib/order-payments');
        const charge = await createOrderCharge({ organizationId: store.id, orderId: result.orderId, displayId: result.displayId, total: result.total, customerName: parsed.data.customerName, customerPhone: parsed.data.customerPhone, document: parsed.data.payerDocument!, email: parsed.data.payerEmail, method: parsed.data.onlineMethod ?? 'PIX', storeName: store.name });
        return { ok: true, data: { ...result, payment: { invoiceUrl: charge.invoiceUrl, pixPayload: charge.pixPayload, pixImage: charge.pixImage, billingType: charge.billingType } } };
      } catch {
        return { ok: true, data: { ...result, payment: null, paymentError: 'Pedido enviado, mas o pagamento online não foi gerado agora. Combine o pagamento com a loja.' } };
      }
    }

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof orders.CheckoutError) {
      return { ok: false, error: error.message, field: error.field };
    }
    return { ok: false, ...toActionError(error) };
  }
}

/**
 * Localiza um endereço digitado no checkout (loja pública, sem sessão).
 * Só para posicionar o mapa: o ponto gravado é o que o cliente confirmar.
 */
/** Pedido lançado no balcão pelo atendente. */
export async function createManualOrderAction(formData: FormData): Promise<OrderActionResult<Awaited<ReturnType<typeof orders.createOrderFromCheckout>>>> {
  try {
    const { organizationId } = await requirePermission('MANAGE_ORDERS');

    const items = parseJson(formData.get('items'));
    const parsed = manualOrderSchema.safeParse({
      idempotencyKey: formData.get('idempotencyKey') || undefined,
      deliveryType: formData.get('deliveryType') || 'PICKUP',
      changeFor: formData.get('changeFor') ? parseMoneyInput(String(formData.get('changeFor')))??NaN : undefined,
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
        idempotencyKey: parsed.data.idempotencyKey,
        source: parsed.data.source,
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        deliveryType: parsed.data.deliveryType,
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
    if (from !== parsed.data.status && !canTransition(from, parsed.data.status) &&
      !(current.deliveryType === 'PICKUP' && from === 'READY' && parsed.data.status === 'DELIVERED')) {
      return {
        ok: false,
        error: `Não é possível ir de "${from}" para "${parsed.data.status}".`,
      };
    }

    await orders.updateOrderStatus(organizationId, parsed.data.orderId, parsed.data.status, {
      reason: parsed.data.reason,
      userId: user.id,
    });

    revalidateOrders();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/**
 * Botão principal do cartão. O servidor recalcula a próxima etapa a partir
 * do status gravado; se o pedido já mudou (outra aba, o entregador), recusa
 * sem aplicar nada.
 */
export async function advanceOrderAction(input: { orderId: string; from: string }): Promise<OrderActionResult> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_ORDERS');
    if (typeof input.orderId !== 'string' || !input.orderId) return { ok: false, error: 'Pedido inválido.' };
    const { primaryOrderAction } = await import('@/lib/order-flow');
    await withOrganizationTransaction(organizationId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: input.orderId, organizationId }, select: { status: true, deliveryType: true, driverId: true } });
      if (!order) throw new OperationError('Pedido não encontrado.');
      if (order.status !== input.from) throw new OperationError('Este pedido já foi atualizado. A tela mostra a situação atual.');
      const action = primaryOrderAction(order);
      if (!action || action.kind === 'tracking') throw new OperationError('Este pedido não tem próxima etapa para a loja.');
      if (action.kind === 'assign') throw new OperationError('Atribua um entregador antes de despachar.');
      await orders.updateOrderStatus(organizationId, input.orderId, action.to, { userId: user.id, transaction: tx });
    });
    revalidateOrders();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Atribui o entregador direto do cartão (pedido em separação fica pronto e aguardando saída). */
export async function assignFromCardAction(input: { orderId: string; driverId: string }): Promise<OrderActionResult> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_DRIVERS');
    const parsed = assignDriverSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' };
    await withOrganizationTransaction(organizationId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: parsed.data.orderId, organizationId }, select: { status: true, deliveryType: true, driverId: true } });
      if (!order) throw new OperationError('Pedido não encontrado.');
      if (order.deliveryType === 'PICKUP') throw new OperationError('Pedido de retirada não recebe entregador.');
      if (order.driverId) throw new OperationError('Este pedido já tem entregador. A tela mostra a situação atual.');
      await orders.assignDriver(organizationId, parsed.data.orderId, parsed.data.driverId, tx);
    });
    revalidateOrders();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Tempo padrão de separação (1 a 180 min) usado no contador dos cartões. */
export async function setPrepMinutesAction(minutes: number): Promise<OrderActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return { ok: false, error: 'Informe de 1 a 180 minutos.' };
    await withOrganizationTransaction(organizationId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
      const settings = (org?.settings && typeof org.settings === 'object' && !Array.isArray(org.settings) ? org.settings : {}) as Record<string, unknown>;
      await tx.organization.update({ where: { id: organizationId }, data: { settings: { ...settings, prepMinutes: minutes } as never } });
    });
    revalidateOrders();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Liga/desliga a aceitação automática de pedidos da loja própria. */
export async function setOrderAutoAcceptAction(enabled: boolean): Promise<OrderActionResult> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_SETTINGS');
    await withOrganizationTransaction(organizationId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
      const settings = (org?.settings && typeof org.settings === 'object' && !Array.isArray(org.settings) ? org.settings : {}) as Record<string, unknown>;
      await tx.organization.update({ where: { id: organizationId }, data: { settings: { ...settings, orderAutoAccept: enabled === true } as never } });
      await tx.notification.create({ data: { organizationId, userId: user.id, type: 'SYSTEM', title: enabled ? 'Aceitação automática ativada' : 'Aceitação automática desativada', message: enabled ? 'Novos pedidos válidos da loja própria entram como Aceito.' : 'Novos pedidos entram como Novo e aguardam aceitação.' } });
    });
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

export async function reassignDriverAction(input:{orderId:string;driverId:string;reason:string}):Promise<OrderActionResult>{
  try{const ctx=await requirePermission('MANAGE_DRIVERS');const parsed=assignDriverSchema.safeParse(input);if(!parsed.success)return {ok:false,error:'Selecione pedido e entregador válidos.'};
    await orders.reassignDriver(ctx.organizationId,parsed.data.orderId,parsed.data.driverId,ctx.user.id,typeof input.reason==='string'?input.reason:'');revalidateOrders();return {ok:true};
  }catch(error){return {ok:false,...toActionError(error)};}
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

    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
    const activeDriver = await tx.driver.findFirst({ where: {
      id: driver.id, organizationId: ctx.organizationId, userId: ctx.user.id, active: true,
    }, select: { id: true } });
    if (!activeDriver) throw new OperationError('O acesso deste entregador foi desativado.');
    const order = await tx.order.findFirst({
      where: {
        id: input.orderId,
        organizationId: ctx.organizationId,
        driverId: driver.id,
      },
      include: { delivery: true },
    });
    if (!order) throw new OperationError('Pedido não encontrado ou não atribuído a você.');
    if (!['CONFIRMED', 'PREPARING', 'WAITING_DRIVER', 'DISPATCHED'].includes(order.status)) {
      throw new OperationError('Este pedido não está disponível para entrega.');
    }
    // A retirada só acontece depois que a loja libera o pedido.
    if ((input.step === 'PICKED_UP' || input.step === 'STARTED') && !['WAITING_DRIVER', 'DISPATCHED'].includes(order.status)) {
      throw new OperationError('A loja ainda não liberou a retirada deste pedido.');
    }
    if (!order.delivery || order.delivery.driverId !== driver.id ||
        nextDriverStep(order.delivery) !== input.step) {
      throw new OperationError('Passo inválido ou já registrado. Atualize as entregas.');
    }

    const parsed = driverDeliveryStepSchema.safeParse({
      deliveryId: order.delivery?.id ?? order.id,
      step: input.step,
      notes: input.notes,
    });
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      throw new OperationError(issue?.message ?? 'Passo inválido.');
    }

    // Cada passo do app empurra o pedido para o status correspondente.
    const target: OrderStatus =
      parsed.data.step === 'DELIVERED'
        ? 'DELIVERED'
        : parsed.data.step === 'STARTED' || parsed.data.step === 'ARRIVED_CUSTOMER'
          ? 'DISPATCHED'
          : (order.status as OrderStatus);

      await tx.delivery.updateMany({
        where: { orderId: order.id, organizationId: ctx.organizationId, driverId: driver.id },
        data: deliveryStepData(parsed.data.step, parsed.data.notes),
      });

      if (target !== order.status && canTransition(order.status as OrderStatus, target)) {
        await orders.updateOrderStatus(ctx.organizationId, order.id, target, {
          userId: ctx.user.id, transaction: tx,
        });
      } else if (target !== order.status) {
        throw new OperationError('O pedido mudou de status. Atualize as entregas.');
      }

      if (target === 'DELIVERED') {
        const remaining = await tx.order.count({ where: {
          organizationId: ctx.organizationId, driverId: driver.id,
          status: { in: DRIVER_ACTIVE_STATUSES },
        } });
        await tx.driver.update({ where: { id: driver.id }, data: { status: remaining ? 'BUSY' : 'ONLINE' } });
      }
    });

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
    if (!['OFFLINE', 'ONLINE', 'RETURNING'].includes(status)) {
      return { ok: false, error: 'Disponibilidade inválida.' };
    }
    const ctx = await requireOrg();

    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const driver = await tx.driver.findFirst({ where: {
        organizationId: ctx.organizationId, userId: ctx.user.id, active: true,
      } });
      if (!driver) throw new OperationError('Entregador não encontrado.');
      const active = await tx.order.count({ where: {
        organizationId: ctx.organizationId, driverId: driver.id,
        status: { in: DRIVER_ACTIVE_STATUSES },
      } });
      if (active && status === 'OFFLINE') throw new OperationError('Conclua suas entregas antes de ficar offline.');
      await tx.driver.update({ where: { id: driver.id }, data: { status: active ? 'BUSY' : status } });
    });

    revalidatePath('/entregador');
    revalidatePath('/app/entregadores');
    revalidatePath('/app/pedidos');
    revalidatePath('/app/expedicao');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// A posição do entregador não é enviada ao servidor: ela fica só no
// aparelho dele, para navegação (ver DriverRoutes). A loja não acompanha
// a localização em tempo real.

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

