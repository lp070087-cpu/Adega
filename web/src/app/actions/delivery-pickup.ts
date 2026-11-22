'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireDriver, requirePermission, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { toNumber } from '@/lib/db';
import { OperationError } from '@/lib/operation-error';
import { pickupCodeFromText, pickupQrText } from '@/lib/delivery-pickup-code';

const offered = ['CONFIRMED', 'PREPARING', 'WAITING_DRIVER'] as const;
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const letter = () => letters[randomInt(letters.length)];
const digit = () => randomInt(10);
const makeCode = () => `${letter()}${letter()}${letter()}${digit()}${letter()}${digit()}${digit()}`;
const rejected = () => new OperationError('Código indisponível. Confira se a loja liberou uma entrega atribuída a você.');

function refresh() {
  revalidatePath('/entregador');
  revalidatePath('/app/pedidos');
  revalidatePath('/app/expedicao');
}

export async function issueDeliverySlip(orderId: string) {
  try {
    const { organizationId } = await requirePermission('MANAGE_DRIVERS');
    const slip = await withOrganizationTransaction(organizationId, async (tx) => {
      const delivery = await tx.delivery.findFirst({
        where: { organizationId, orderId, status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'] }, driverId: { not: null }, order: { status: { in: [...offered, 'DISPATCHED'] } } },
        select: { id: true, driverId: true, pickupCode: true, driver: { select: { name: true } },
          order: { select: { displayId: true, driverId: true, customerName: true, deliveryAddress: true, deliveryNumber: true, deliveryDistrict: true, deliveryCity: true, deliveryZipCode: true, notes: true, paymentMethod: true, paymentStatus: true, total: true, changeFor: true, items: { select: { quantity: true, productName: true, variationName: true } }, organization: { select: { name: true } } } } },
      });
      if (!delivery || delivery.order.driverId !== delivery.driverId) throw new OperationError('Atribua um entregador antes de imprimir a ficha de coleta.');
      let code = delivery.pickupCode;
      if (!code) {
        for (let attempt = 0; attempt < 10 && !code; attempt++) {
          const candidate = makeCode();
          if (!await tx.delivery.findUnique({ where: { organizationId_pickupCode: { organizationId, pickupCode: candidate } }, select: { id: true } })) code = candidate;
        }
        if (!code) throw new OperationError('Não foi possível gerar o código. Tente novamente.');
        await tx.delivery.update({ where: { id: delivery.id }, data: { pickupCode: code } });
      }
      const { organization, driverId: _id, total, changeFor, ...order } = delivery.order;
      return { ...order, total: toNumber(total), changeFor: changeFor == null ? null : toNumber(changeFor), store: organization.name, driver: delivery.driver?.name ?? '', code, qr: pickupQrText(code) };
    });
    refresh();
    return { ok: true as const, slip };
  } catch (error) {
    return { ok: false as const, ...toActionError(error) };
  }
}

export async function acceptDriverDelivery(orderId: string) {
  try {
    const ctx = await requireDriver();
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const delivery = await tx.delivery.findFirst({
        where: { organizationId: ctx.organizationId, orderId, driverId: ctx.driver.id, status: 'ASSIGNED',
          driver: { active: true, userId: ctx.user.id }, order: { driverId: ctx.driver.id, status: { in: [...offered] } } },
        select: { id: true, acceptedAt: true },
      });
      if (!delivery) throw new OperationError('Esta entrega não está disponível para aceite.');
      if (!delivery.acceptedAt) await tx.delivery.update({ where: { id: delivery.id }, data: { acceptedAt: new Date() } });
    });
    refresh();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, ...toActionError(error) };
  }
}

export async function collectDriverDelivery(raw: string) {
  try {
    const ctx = await requireDriver();
    const code = typeof raw === 'string' && raw.length <= 80 ? pickupCodeFromText(raw) : null;
    if (!code) throw new OperationError('Informe o código de 7 caracteres que está na ficha.');
    const order = await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const delivery = await tx.delivery.findFirst({
        where: { organizationId: ctx.organizationId, pickupCode: code, driverId: ctx.driver.id,
          driver: { active: true, userId: ctx.user.id }, order: { driverId: ctx.driver.id, status: 'WAITING_DRIVER' } },
        select: { id: true, status: true, acceptedAt: true, order: { select: { id: true, displayId: true } } },
      });
      if (!delivery) throw rejected();
      if (delivery.status === 'PICKED_UP') return delivery.order;
      if (delivery.status !== 'ASSIGNED') throw rejected();
      const now = new Date();
      await tx.delivery.update({ where: { id: delivery.id }, data: { status: 'PICKED_UP', pickedUpAt: now, acceptedAt: delivery.acceptedAt ?? now } });
      return delivery.order;
    });
    refresh();
    return { ok: true as const, order };
  } catch (error) {
    return { ok: false as const, ...toActionError(error) };
  }
}
