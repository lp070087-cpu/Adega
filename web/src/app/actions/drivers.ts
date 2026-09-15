'use server';

import { revalidatePath } from 'next/cache';
import type { DriverStatus } from '@prisma/client';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import * as drivers from '@/lib/data/drivers';
import { createDriverWithLoginSchema, driverStatusSchema } from '@/lib/validations/operations';

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
    phone: formData.get('phone'),
    vehicleType: formData.get('vehicleType') || 'MOTORCYCLE',
    vehiclePlate: formData.get('vehiclePlate') || undefined,
    active: formData.get('active') !== 'off',
    createLogin: formData.get('createLogin') === 'on',
    email: formData.get('email') || undefined,
    username: formData.get('username') || undefined,
    password: formData.get('password') || undefined,
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

    await drivers.createDriver(organizationId, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      vehicleType: parsed.data.vehicleType,
      vehiclePlate: parsed.data.vehiclePlate,
      active: parsed.data.active,
      createLogin: parsed.data.createLogin,
      email: parsed.data.email || undefined,
      username: parsed.data.username || undefined,
      password: parsed.data.password || undefined,
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
    const { organizationId } = await requirePermission('MANAGE_DRIVERS');

    // Edição não mexe em login/senha: isso é fluxo separado.
    const parsed = createDriverWithLoginSchema.partial().safeParse({
      name: formData.get('name') || undefined,
      phone: formData.get('phone') || undefined,
      vehicleType: formData.get('vehicleType') || undefined,
      vehiclePlate: formData.get('vehiclePlate') || undefined,
      active: formData.get('active') === null ? undefined : formData.get('active') !== 'off',
    });
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    await drivers.updateDriver(organizationId, driverId, {
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

function revalidateDrivers() {
  revalidatePath('/app/entregadores');
  revalidatePath('/app/expedicao');
  revalidatePath('/app/pedidos');
}
