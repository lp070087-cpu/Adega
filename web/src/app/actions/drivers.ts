'use server';

import { revalidatePath } from 'next/cache';
import { OperationError } from '@/lib/operation-error';
import type { DriverStatus } from '@prisma/client';
import { requirePermission, requireDriver, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import * as drivers from '@/lib/data/drivers';
import { createDriverWithLoginSchema, driverStatusSchema } from '@/lib/validations/operations';
import { saveDriverSchedule, generateTomorrowDriverReminders } from '@/lib/data/driver-schedules';
import { driverShiftAvailability, readDriverSchedule, tomorrowDriverShifts } from '@/lib/driver-schedule';

/**
 * Central de Entregadores. Criar entregador com login cria também o
 * OrganizationUser com papel DRIVER — é esse vínculo que dá acesso ao
 * app /entregador e a nada mais.
 */

export type DriverActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

function driverFromForm(formData: FormData) {
  return {
    name: formData.get('name'),
    phone: formData.get('phone') || '',
    vehicleType: formData.get('vehicleType') || 'MOTORCYCLE',
    vehiclePlate: formData.get('vehiclePlate') || undefined,
    active: formData.get('active') !== 'off',
    createLogin: true,
    email: formData.get('email') || undefined,
  };
}

export async function createDriverAction(formData: FormData): Promise<DriverActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_DRIVERS');

    const parsed = createDriverWithLoginSchema.safeParse(driverFromForm(formData));
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    if(!parsed.data.email)return {ok:false,error:'Informe o e-mail individual do entregador.',field:'email'};
    await drivers.createDriver(organizationId, {
      activationOnly:true,
      name: parsed.data.name,
      phone: parsed.data.phone,
      vehicleType: parsed.data.vehicleType,
      vehiclePlate: parsed.data.vehiclePlate,
      active: parsed.data.active,
      createLogin: parsed.data.createLogin,
      email: parsed.data.email || undefined,
    });

    revalidateDrivers();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function updateDriverAction(
  driverId: string,
  formData: FormData,
): Promise<DriverActionResult> {
  try {
    const { organizationId,user } = await requirePermission('MANAGE_DRIVERS');

    // A senha é definida somente pelo titular após verificação do e-mail.
    const parsed = createDriverWithLoginSchema.partial().safeParse({
      name: formData.get('name') || undefined,
      phone: formData.get('phone') || undefined,
      vehicleType: formData.get('vehicleType') || undefined,
      vehiclePlate: formData.get('vehiclePlate') || undefined,
      active: formData.get('active') === null ? undefined : formData.get('active') !== 'off',
      email: formData.get('email') || undefined,
    });
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    await drivers.updateDriver(organizationId, driverId, {
      email:parsed.data.email||undefined,
      actorId:user.id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      vehicleType: parsed.data.vehicleType,
      vehiclePlate: parsed.data.vehiclePlate,
      active: parsed.data.active,
    });

    revalidateDrivers();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function setDriverStatusAction(input: {
  driverId: string;
  status: DriverStatus;
}): Promise<DriverActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_DRIVERS');

    const parsed = driverStatusSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Status inválido.' };
    }

    await drivers.setDriverStatus(organizationId, parsed.data.driverId, parsed.data.status);
    revalidateDrivers();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Desativa (não apaga) — o histórico de entregas continua íntegro. */
export async function deactivateDriverAction(driverId: string): Promise<DriverActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_DRIVERS');
    await drivers.deactivateDriver(organizationId, driverId);
    revalidateDrivers();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Volta a liberar o acesso de um entregador suspenso. */
export async function reactivateDriverAction(driverId: string): Promise<DriverActionResult> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_DRIVERS');
    await drivers.updateDriver(organizationId, driverId, { active: true, actorId: user.id });
    revalidateDrivers();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Desfaz o vínculo com a loja; o histórico de entregas permanece. */
export async function removeDriverLinkAction(driverId: string): Promise<DriverActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_DRIVERS');
    await drivers.removeDriverLink(organizationId, driverId);
    revalidateDrivers();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

function revalidateDrivers() {
  revalidatePath('/app/entregadores');
  revalidatePath('/app/expedicao');
  revalidatePath('/app/pedidos');
  revalidatePath('/entregador');
}

/** Failed attempts return to dispatch; they never mark the order paid or restore stock. */
export async function reportFailedDeliveryAction(input: { orderId: string; reason: string }): Promise<DriverActionResult> {
  try {
    const ctx = await requireDriver();
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 5 || reason.length > 300) {
      return { ok: false, error: 'Descreva o motivo com 5 a 300 caracteres.' };
    }
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const order = await tx.order.findFirst({ where: {
        id: input.orderId, organizationId: ctx.organizationId, driverId: ctx.driver.id,
        status: 'DISPATCHED',
      }, include: { delivery: true } });
      if (!order?.delivery || !['IN_TRANSIT', 'ARRIVED'].includes(order.delivery.status)) {
        throw new OperationError('Esta entrega não está em rota ou já foi atualizada.');
      }
      const note = `Tentativa sem sucesso (${ctx.driver.name}): ${reason}`;
      await tx.delivery.update({ where: { id: order.delivery.id }, data: {
        status: 'FAILED', notes: [order.delivery.notes, note].filter(Boolean).join('\n'),
      } });
      await tx.order.update({ where: { id: order.id }, data: {
        status: 'READY', driverId: null, dispatchedAt: null,
        notes: [order.notes, note].filter(Boolean).join('\n'),
      } });
      const remaining = await tx.order.count({ where: {
        organizationId: ctx.organizationId, driverId: ctx.driver.id,
        status: { in: ['WAITING_DRIVER', 'DISPATCHED'] },
      } });
      await tx.driver.update({ where: { id: ctx.driver.id }, data: { status: remaining ? 'BUSY' : 'RETURNING' } });
      await tx.notification.create({ data: {
        organizationId: ctx.organizationId, type: 'DELIVERY',
        title: `Entrega não concluída — #${order.displayId}`, message: reason,
        href: `/app/pedidos?pedido=${order.id}`,
      } });
    });
    revalidateDrivers();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function saveDriverScheduleAction(driverId: string, input: unknown): Promise<DriverActionResult> {
  try {
    const ctx = await requirePermission('MANAGE_DRIVERS');
    await saveDriverSchedule(ctx.organizationId, ctx.user.id, driverId, input);
    revalidateDrivers();
    return { ok: true };
  } catch (error) { return { ok: false, ...toActionError(error) }; }
}

export async function refreshDriverRemindersAction() {
  try {
    const ctx = await requirePermission('MANAGE_DRIVERS');
    const count = await generateTomorrowDriverReminders(ctx.organizationId);
    return { ok: true as const, count };
  } catch (error) { return { ok: false as const, ...toActionError(error) }; }
}

export async function getMyDriverScheduleAction() {
  try {
    const ctx = await requireDriver();
    const { prisma } = await import('@/lib/db');
    const organization = await prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
    const schedule = readDriverSchedule(organization?.settings, ctx.driver.id);
    // Only the authenticated driver's notification can be generated from this action.
    await generateTomorrowDriverReminders(ctx.organizationId, new Date(), ctx.driver.id);
    return { ok: true as const, schedule, availability: driverShiftAvailability(schedule), tomorrow: tomorrowDriverShifts(schedule) };
  } catch (error) { return { ok: false as const, ...toActionError(error) }; }
}
