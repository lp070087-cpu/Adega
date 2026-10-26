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
import type { OrderStatus as DriverActiveStatus } from '@prisma/client';
/** Pedido com entregador conta como entrega ativa dele desde o aceite (ver src/lib/driver-statuses.ts). */
const DRIVER_ACTIVE_STATUSES: DriverActiveStatus[] = ['CONFIRMED', 'PREPARING', 'READY', 'WAITING_DRIVER', 'DISPATCHED'];


/**
 * Central de Entregadores. Criar entregador com login cria também o
 * OrganizationUser com papel DRIVER — é esse vínculo que dá acesso ao
 * app /entregador e a nada mais.
 */

export type TemporaryCredential = { pin: string; expires: string; email: string; driverName: string };

export type DriverActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string; code?: string };

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

export async function createDriverAction(formData: FormData): Promise<DriverActionResult<TemporaryCredential | undefined>> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_DRIVERS');

    const parsed = createDriverWithLoginSchema.safeParse(driverFromForm(formData));
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    if(!parsed.data.email)return {ok:false,error:'Informe o e-mail individual do entregador.',field:'email'};
    const created = await drivers.createDriver(organizationId, {
      activationOnly:true,
      name: parsed.data.name,
      phone: parsed.data.phone,
      vehicleType: parsed.data.vehicleType,
      vehiclePlate: parsed.data.vehiclePlate,
      active: parsed.data.active,
      createLogin: parsed.data.createLogin,
      email: parsed.data.email || undefined,
    });

    // Conta nova (ou só desta loja, ainda sem senha): já sai com a senha
    // temporária. Conta de outra loja continua usando a própria senha.
    let credential: TemporaryCredential | undefined;
    const { prisma } = await import('@/lib/db');
    const { issueTemporaryCredential } = await import('@/lib/auth/driver-temp');
    const account = created.userId ? await prisma.user.findUnique({ where: { id: created.userId }, select: { passwordHash: true, mustChangePassword: true } }) : null;
    if (account && (!account.passwordHash || account.mustChangePassword)) {
      try {
        const issued = await issueTemporaryCredential(organizationId, created.id, user.id);
        credential = { pin: issued.pin, expires: issued.expires.toISOString(), email: issued.email, driverName: parsed.data.name };
      } catch { /* conta compartilhada com outra loja: sem PIN desta loja */ }
    }

    revalidateDrivers();
    return { ok: true, data: credential };
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

/** Nova senha temporária (substitui a anterior) para entregador exclusivo da loja. */
export async function issueTemporaryCredentialAction(driverId: string): Promise<DriverActionResult<TemporaryCredential>> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_DRIVERS');
    const { prisma } = await import('@/lib/db');
    const { issueTemporaryCredential } = await import('@/lib/auth/driver-temp');
    const driver = await prisma.driver.findFirst({ where: { id: driverId, organizationId }, select: { name: true } });
    if (!driver) return { ok: false, error: 'Entregador não encontrado.' };
    const issued = await issueTemporaryCredential(organizationId, driverId, user.id);
    revalidateDrivers();
    return { ok: true, data: { pin: issued.pin, expires: issued.expires.toISOString(), email: issued.email, driverName: driver.name } };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/**
 * Dados da tela de navegação: só para o pedido atribuído a este entregador.
 * A posição dele é usada apenas para pedir a rota e não é gravada aqui.
 */
export async function driverNavigationAction(input: { orderId: string; from?: { latitude: number; longitude: number } | null }) {
  try {
    const ctx = await requireDriver();
    const { prisma } = await import('@/lib/db');
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, organizationId: ctx.organizationId, driverId: ctx.driver.id, status: { in: DRIVER_ACTIVE_STATUSES } },
      select: { deliveryLatitude: true, deliveryLongitude: true, deliveryAddress: true, deliveryNumber: true, deliveryDistrict: true, deliveryCity: true, organization: { select: { state: true } } },
    });
    if (!order) return { ok: false as const, error: 'Entrega não encontrada ou já concluída.' };
    const address = [order.deliveryAddress && `${order.deliveryAddress}${order.deliveryNumber ? `, ${order.deliveryNumber}` : ''}`, order.deliveryDistrict, order.deliveryCity, order.organization.state, 'Brasil'].filter(Boolean).join(', ');
    let destination: { latitude: number; longitude: number; approximate: boolean } | null =
      order.deliveryLatitude != null && order.deliveryLongitude != null ? { latitude: order.deliveryLatitude, longitude: order.deliveryLongitude, approximate: false } : null;
    if (!destination && order.deliveryAddress) {
      const { geocodeAddress } = await import('@/lib/maps/geocoding');
      const found = await geocodeAddress(address);
      if (found.ok) destination = { latitude: found.latitude, longitude: found.longitude, approximate: true };
    }
    // Sem a posição do entregador (localização desligada), a rota parte da loja.
    const store = await prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { latitude: true, longitude: true } });
    const from = validPoint(input.from) ? input.from! : store?.latitude != null && store.longitude != null ? { latitude: store.latitude, longitude: store.longitude } : null;
    const { streetRoute, routingConfigured } = await import('@/lib/maps/routing');
    const route = destination && from ? await streetRoute(from, destination) : { available: false as const, reason: routingConfigured() ? ('unavailable' as const) : ('not_configured' as const) };
    return { ok: true as const, destination, route };
  } catch (error) {
    return { ok: false as const, ...toActionError(error) };
  }
}

const validPoint = (p: { latitude: number; longitude: number } | null | undefined): p is { latitude: number; longitude: number } =>
  Boolean(p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180);

export type RoutePlanStop = { orderId: string; displayId: number; latitude: number | null; longitude: number | null; approximate: boolean };

/**
 * Plano de rota do entregador: paradas (entregas atribuídas a ele), a
 * sequência pedida ou sugerida e o trajeto pelas ruas. A posição do
 * entregador só vem quando ele ativou "Usar minha localização" e não é
 * gravada; sem ela, o trajeto parte da loja.
 */
export async function driverRoutePlanAction(input: { sequence: string[]; from?: { latitude: number; longitude: number } | null; optimize?: boolean; focus?: string | null }) {
  try {
    const ctx = await requireDriver();
    const { prisma } = await import('@/lib/db');
    const [orders, store] = await Promise.all([
      prisma.order.findMany({
        where: { organizationId: ctx.organizationId, driverId: ctx.driver.id, status: { in: DRIVER_ACTIVE_STATUSES } },
        select: { id: true, displayId: true, createdAt: true, deliveryLatitude: true, deliveryLongitude: true, deliveryAddress: true, deliveryNumber: true, deliveryDistrict: true, deliveryCity: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { latitude: true, longitude: true, state: true } }),
    ]);
    const wanted = Array.isArray(input.sequence) ? input.sequence.filter((id): id is string => typeof id === 'string').slice(0, 50) : [];
    const byId = new Map(orders.map(o => [o.id, o]));
    const sequence = [...wanted.filter(id => byId.has(id)), ...orders.map(o => o.id).filter(id => !wanted.includes(id))];
    const { geocodeAddress } = await import('@/lib/maps/geocoding');
    const stops: RoutePlanStop[] = [];
    for (const id of sequence) {
      const o = byId.get(id)!;
      if (o.deliveryLatitude != null && o.deliveryLongitude != null) { stops.push({ orderId: o.id, displayId: o.displayId, latitude: o.deliveryLatitude, longitude: o.deliveryLongitude, approximate: false }); continue; }
      const address = [o.deliveryAddress && `${o.deliveryAddress}${o.deliveryNumber ? `, ${o.deliveryNumber}` : ''}`, o.deliveryDistrict, o.deliveryCity, store?.state, 'Brasil'].filter(Boolean).join(', ');
      const found = o.deliveryAddress ? await geocodeAddress(address) : null;
      stops.push({ orderId: o.id, displayId: o.displayId, latitude: found?.ok ? found.latitude : null, longitude: found?.ok ? found.longitude : null, approximate: Boolean(found?.ok) });
    }
    const startKind = validPoint(input.from) ? 'me' as const : store?.latitude != null && store.longitude != null ? 'store' as const : null;
    const start = startKind === 'me' ? input.from! : startKind === 'store' ? { latitude: store!.latitude!, longitude: store!.longitude! } : null;
    const { routingConfigured, streetRouteThrough, durationMatrix } = await import('@/lib/maps/routing');
    const located = stops.filter(s => s.latitude != null && s.longitude != null);
    let optimized = false;
    let ordered = stops;
    if (input.optimize && start && located.length > 1) {
      const matrix = await durationMatrix([start, ...located.map(s => ({ latitude: s.latitude!, longitude: s.longitude! }))]);
      if (matrix) {
        const { bestStopOrder } = await import('@/lib/maps/route-order');
        const best = bestStopOrder(matrix).map(i => located[i - 1]);
        ordered = [...best, ...stops.filter(s => s.latitude == null)];
        optimized = true;
      }
    }
    const focus = input.focus ? ordered.find(s => s.orderId === input.focus && s.latitude != null) : undefined;
    const path = focus ? [focus] : ordered.filter(s => s.latitude != null);
    // Sem ponto de partida (loja sem localização e entregador sem GPS), o
    // trajeto ainda liga as paradas entre si, a partir da primeira.
    const points = [...(start ? [start] : []), ...path.map(s => ({ latitude: s.latitude!, longitude: s.longitude! }))];
    const route = points.length >= 2
      ? await streetRouteThrough(points)
      : { available: false as const, reason: routingConfigured() ? ('unavailable' as const) : ('not_configured' as const) };
    return {
      ok: true as const,
      stops: ordered,
      sequence: ordered.map(s => s.orderId),
      optimized,
      routing: routingConfigured(),
      startKind,
      store: store?.latitude != null && store.longitude != null ? { latitude: store.latitude, longitude: store.longitude } : null,
      route,
    };
  } catch (error) {
    return { ok: false as const, ...toActionError(error) };
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
        status: { in: DRIVER_ACTIVE_STATUSES },
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

/** Regra do seletor operacional: só programados hoje ou todos os entregadores. */
export async function setDriverSelectionRuleAction(rule: 'scheduled' | 'all'): Promise<DriverActionResult> {
  try {
    const ctx = await requirePermission('MANAGE_DRIVERS');
    if (rule !== 'scheduled' && rule !== 'all') throw new Error('Regra inválida.');
    const { withOrganizationTransaction } = await import('@/lib/data/transaction');
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
      const settings = (org?.settings ?? {}) as Record<string, unknown>;
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, driverSelection: rule } } });
    });
    revalidateDrivers();
    return { ok: true };
  } catch (error) { return { ok: false, ...toActionError(error) }; }
}
