import 'server-only';
import type { DriverStatus, VehicleType, Prisma } from '@prisma/client';
import { prisma, toNumber } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { assertPlatformQuota } from '@/lib/platform/quotas';
import { assertDriverOnShift, getDriverSchedules } from '@/lib/data/driver-schedules';
import { readDriverSchedule, driverShiftAvailability } from '@/lib/driver-schedule';
import {isPlatformIdentity} from '@/lib/platform/identity';

/**
 * Entregadores e despacho.
 *
 * Entregador é sempre da organização. O app /entregador filtra por
 * driverId — não existe consulta "todos os pedidos" do lado do motorista.
 */

export async function getDrivers(
  organizationId: string,
  filters: { active?: boolean; status?: DriverStatus; search?: string } = {},
) {
  const scheduleSettings = await getDriverSchedules(organizationId);
  const drivers = await prisma.driver.findMany({
    where: {
      organizationId,
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' as const } },
              { phone: { contains: filters.search.replace(/\D/g, '') } },
              { vehiclePlate: { contains: filters.search.toUpperCase() } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: {
      user: { select: { id: true, email: true, username: true, active: true,mustChangePassword:true } },
      // Última posição conhecida: pega só a mais recente.
      locations: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: {
        select: {
          orders: { where: { status: { in: ['WAITING_DRIVER', 'DISPATCHED'] } } },
        },
      },
    },
  });

  // Totais entregues: agregação à parte para não trazer todos os pedidos.
  const deliveredCounts = await prisma.order.groupBy({
    by: ['driverId'],
    where: {
      organizationId,
      status: 'DELIVERED',
      driverId: { in: drivers.map((d) => d.id) },
    },
    _count: { _all: true },
  });
  const deliveredMap = new Map(
    deliveredCounts.map((d) => [d.driverId, d._count._all]),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayCounts = await prisma.order.groupBy({
    by: ['driverId'],
    where: {
      organizationId,
      status: 'DELIVERED',
      deliveredAt: { gte: today },
      driverId: { in: drivers.map((d) => d.id) },
    },
    _count: { _all: true },
  });
  const todayMap = new Map(todayCounts.map((d) => [d.driverId, d._count._all]));

  return drivers.map((d) => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    vehicleType: d.vehicleType,
    vehiclePlate: d.vehiclePlate,
    status: d.status,
    active: d.active,
    hasLogin: Boolean(d.userId),
    accessPending:Boolean(d.user?.mustChangePassword),
    email: d.user?.email ?? null,
    username: d.user?.username ?? null,
    activeOrders: d._count.orders,
    onShift: (!d.user||d.user.active&&!d.user.mustChangePassword)&&driverShiftAvailability(readDriverSchedule(scheduleSettings, d.id)).allowed,
    shiftLabel: d.user?.mustChangePassword?'Ativação pendente':driverShiftAvailability(readDriverSchedule(scheduleSettings, d.id)).label,
    deliveredTotal: deliveredMap.get(d.id) ?? 0,
    deliveredToday: todayMap.get(d.id) ?? 0,
    lastLocation: d.locations[0]
      ? {
          latitude: d.locations[0].latitude,
          longitude: d.locations[0].longitude,
          createdAt: d.locations[0].createdAt,
        }
      : null,
  }));
}

export type DriverListItem = Awaited<ReturnType<typeof getDrivers>>[number];

export async function getDriverById(organizationId: string, driverId: string) {
  const driver = await prisma.driver.findFirst({
    where: { id: driverId, organizationId },
    include: {
      user: { select: { id: true, email: true, username: true, active: true } },
      locations: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!driver) return null;

  const [delivered, totalValue, activeOrders] = await Promise.all([
    prisma.order.count({ where: { organizationId, driverId, status: 'DELIVERED' } }),
    prisma.order.aggregate({
      where: { organizationId, driverId, status: 'DELIVERED' },
      _sum: { deliveryFee: true, total: true },
    }),
    prisma.order.findMany({
      where: {
        organizationId,
        driverId,
        status: { in: ['WAITING_DRIVER', 'DISPATCHED'] },
      },
      select: { id: true, displayId: true, customerName: true, status: true, total: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    ...driver,
    stats: {
      delivered,
      deliveryFees: toNumber(totalValue._sum.deliveryFee),
      orderValue: toNumber(totalValue._sum.total),
      activeOrders: activeOrders.map((o) => ({ ...o, total: toNumber(o.total) })),
    },
  };
}

export async function createDriver(
  organizationId: string,
  input: {
    name: string;
    phone: string;
    vehicleType: VehicleType;
    vehiclePlate?: string;
    active: boolean;
    createLogin?: boolean;
    /** OPÇÃO A: e-mail de acesso. */
    email?: string;
    /** OPÇÃO B: login por nome de usuário (sem e-mail). */
    username?: string;
    password?: string;
    activationOnly?: boolean;
  },
) {
  // Login opcional: só cria se pedido E com credencial/senha válidas.
  if (input.createLogin) {
    if (!input.password && !input.activationOnly) {
      throw new Error('Para criar o acesso do entregador, informe uma senha.');
    }

    // OPÇÃO B primeiro: login por nome de usuário, SEM e-mail. É o que
    // permite um entregador sem e-mail entrar pelo próprio login — nada de
    // "e-mail falso visível ao usuário", que era mentira no cadastro.
    const email = input.email?.toLowerCase().trim() || null;
    const username = input.username?.toLowerCase().trim() || null;
    if(input.activationOnly&&!email)throw new Error('Informe um e-mail válido para ativação.');

    if (!email && !username) {
      throw new Error('Informe um e-mail de acesso ou um nome de usuário.');
    }

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new Error('Já existe um usuário com este e-mail.');
    }
    if (username) {
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) throw new Error('Este nome de usuário já está em uso.');
    }

    const passwordHash = input.activationOnly ? null : await hashPassword(input.password!);

    return withOrganizationTransaction(organizationId, async (tx) => {
      if (input.active) await assertPlatformQuota(tx, organizationId, 'drivers');
      const user = await tx.user.create({
        data: { name: input.name, email, username, passwordHash, phone: input.phone, mustChangePassword:Boolean(input.activationOnly) },
      });

      // Vínculo com a organização no papel DRIVER: é o que dá acesso
      // ao app do entregador e a mais nada.
      await tx.organizationUser.create({
        data: { organizationId, userId: user.id, role: 'DRIVER', active: input.active, acceptedAt: new Date() },
      });

      return tx.driver.create({
        data: {
          organizationId,
          userId: user.id,
          name: input.name,
          phone: input.phone.replace(/\D/g, ''),
          vehicleType: input.vehicleType,
          vehiclePlate: input.vehiclePlate?.toUpperCase() || null,
          active: input.active,
        },
      });
    });
  }

  return withOrganizationTransaction(organizationId, async (tx) => {
    if (input.active) await assertPlatformQuota(tx, organizationId, 'drivers');
    return tx.driver.create({
    data: {
      organizationId,
      name: input.name,
      phone: input.phone.replace(/\D/g, ''),
      vehicleType: input.vehicleType,
      vehiclePlate: input.vehiclePlate?.toUpperCase() || null,
      active: input.active,
    },
  });
  });
}

export async function updateDriver(
  organizationId: string,
  driverId: string,
  input: {
    name?: string;
    phone?: string;
    vehicleType?: VehicleType;
    vehiclePlate?: string;
    active?: boolean;
    email?: string;
    actorId?: string;
  },
) {
  return withOrganizationTransaction(organizationId, async (tx) => {
  const current = await tx.driver.findFirst({ where: { id: driverId, organizationId }, select: { active: true, userId: true } });
  if (!current) throw new Error('Entregador não encontrado.');
  if (input.active === false) {
    const ongoing = await tx.order.count({ where: { organizationId, driverId, status: { in: ['WAITING_DRIVER', 'DISPATCHED'] } } });
    if (ongoing) throw new Error('Conclua ou remova as atribuições antes de desativar o entregador.');
  }
  if (input.active === true && !current.active) await assertPlatformQuota(tx, organizationId, 'drivers');
  const result = await tx.driver.updateMany({
    where: { id: driverId, organizationId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.phone ? { phone: input.phone.replace(/\D/g, '') } : {}),
      ...(input.vehicleType ? { vehicleType: input.vehicleType } : {}),
      ...(input.vehiclePlate !== undefined
        ? { vehiclePlate: input.vehiclePlate?.toUpperCase() || null }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  if (result.count === 0) throw new Error('Entregador não encontrado.');
  if (input.active !== undefined && current.userId) {
    await tx.organizationUser.updateMany({ where: { organizationId, userId: current.userId, role: 'DRIVER' }, data: { active: input.active } });
  }
  if(input.active===false&&current.userId)await revokeDriverSessions(tx,organizationId,current.userId);
  if(input.email)await setDriverEmail(organizationId,driverId,input.email,input.actorId,tx);
  return { ok: true };
  });
}

export async function setDriverStatus(
  organizationId: string,
  driverId: string,
  status: DriverStatus,
) {
  return withOrganizationTransaction(organizationId, async tx => {
    const driver = await tx.driver.findFirst({ where: { id: driverId, organizationId, active: true }, select: { id: true,user:{select:{active:true,mustChangePassword:true,organizations:{where:{organizationId,active:true},select:{id:true}}}} } });
    if (!driver) throw new Error('Entregador não encontrado ou desativado.');
    if(status==='ONLINE'&&driver.user&&(!driver.user.active||driver.user.mustChangePassword||!driver.user.organizations.length))throw new Error('Ative o acesso do entregador antes de disponibilizá-lo.');
    const active = await tx.order.count({ where: { organizationId, driverId, status: { in: ['WAITING_DRIVER', 'DISPATCHED'] } } });
    if (active) throw new Error('Conclua ou remova as atribuições antes de alterar a disponibilidade.');
    if (status === 'BUSY') throw new Error('Em entrega é definido somente pela atribuição de pedidos.');
    if (status === 'ONLINE') await assertDriverOnShift(tx, organizationId, driverId);
    await tx.driver.update({ where: { id: driver.id }, data: { status } });
    return { ok: true };
  });
}

/**
 * Desativa em vez de apagar: o histórico de entregas continua íntegro e
 * o login é bloqueado na mesma transação.
 */
export async function deactivateDriver(organizationId: string, driverId: string) {
  return withOrganizationTransaction(organizationId, async tx => {
  const driver = await tx.driver.findFirst({
    where: { id: driverId, organizationId },
    select: { id: true, userId: true },
  });
  if (!driver) throw new Error('Entregador não encontrado.');
  const ongoing = await tx.order.count({ where: { organizationId, driverId, status: { in: ['WAITING_DRIVER', 'DISPATCHED'] } } });
  if (ongoing) throw new Error('Conclua ou remova as atribuições antes de desativar o entregador.');
    await tx.driver.update({
      where: { id: driverId },
      data: { active: false, status: 'OFFLINE' },
    });
    if (driver.userId) {
      // Bloqueia o login do app do entregador.
      await tx.organizationUser.updateMany({
        where: { organizationId, userId: driver.userId, role:'DRIVER' },
        data: { active: false },
      });
      await revokeDriverSessions(tx,organizationId,driver.userId);
    }
  return { ok: true };
  });
}

/** A revogação permanece após reativação; JWT antigo nunca recupera acesso. */
export async function revokeDriverSessions(tx:Prisma.TransactionClient,organizationId:string,userId:string){
 const org=await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{settings:true}});
 const settings=(org.settings&&typeof org.settings==='object'&&!Array.isArray(org.settings)?org.settings:{}) as Prisma.JsonObject;
 const current=settings.driverSessionsRevokedAt;
 await tx.organization.update({where:{id:organizationId},data:{settings:{...settings,driverSessionsRevokedAt:{...(current&&typeof current==='object'&&!Array.isArray(current)?current:{}),[userId]:new Date().toISOString()}}}});
}

export async function setDriverEmail(organizationId:string,driverId:string,email:string,actorId?:string,transaction?:Prisma.TransactionClient){
 return withOrganizationTransaction(organizationId,async tx=>{
  const driver=await tx.driver.findFirst({where:{id:driverId,organizationId},select:{id:true,name:true,phone:true,userId:true,active:true}});
  if(!driver)throw new Error('Entregador não encontrado.');
  const normalized=email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254)throw new Error('E-mail inválido.');
  const account=driver.userId?await tx.user.findUnique({where:{id:driver.userId},include:{organizations:true}}):null;
  if(account?.email===normalized)return;
  if(account&&(account.organizations.some(m=>m.role!=='DRIVER'||m.organizationId!==organizationId)||!account.organizations.some(m=>m.organizationId===organizationId&&m.role==='DRIVER')))throw new Error('Esta conta possui outros vínculos. Não é possível alterar seu acesso por aqui.');
  if(account&&await isPlatformIdentity(tx,account.id))throw new Error('Este acesso deve ser administrado pela plataforma.');
  if(await tx.user.findUnique({where:{email:normalized},select:{id:true}}))throw new Error('Este e-mail já está em uso.');
  if(await tx.order.count({where:{organizationId,driverId,status:{in:['WAITING_DRIVER','DISPATCHED']}}}))throw new Error('Conclua ou remova as atribuições antes de alterar o e-mail.');
  const user=account?await tx.user.update({where:{id:account.id},data:{email:normalized,emailVerified:null,mustChangePassword:true}}):await tx.user.create({data:{name:driver.name,email:normalized,phone:driver.phone,mustChangePassword:true}});
  if(!account)await tx.organizationUser.create({data:{organizationId,userId:user.id,role:'DRIVER',active:driver.active,acceptedAt:new Date()}});
  await tx.driver.update({where:{id:driver.id},data:{...(!account?{userId:user.id}:{}),status:'OFFLINE'}});
  await revokeDriverSessions(tx,organizationId,user.id);
  await tx.notification.create({data:{organizationId,userId:actorId,type:'SYSTEM',title:'E-mail de entregador atualizado',message:'Acesso individual aguarda verificação do novo e-mail.'}});
 },transaction);
}

/** Registra posição enviada pelo app. Mantém histórico, não sobrescreve. */
export async function recordDriverLocation(
  organizationId: string,
  driverId: string,
  location: { latitude: number; longitude: number; accuracy?: number },
) {
  // Confere que o entregador é desta organização antes de gravar.
  const driver = await prisma.driver.findFirst({
    where: { id: driverId, organizationId },
    select: { id: true },
  });
  if (!driver) throw new Error('Entregador não encontrado.');

  return prisma.driverLocation.create({
    data: {
      driverId,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy ?? null,
    },
  });
}

/** Última posição de cada entregador ativo (mapa de expedição). */
export async function getDriverMap(organizationId: string) {
  const settings = await getDriverSchedules(organizationId);
  const drivers = await prisma.driver.findMany({
    where: { organizationId, active: true },
    select: {
      id: true,
      name: true,
      status: true,
      vehiclePlate: true,
      user:{select:{active:true,mustChangePassword:true}},
      locations: { orderBy: { createdAt: 'desc' }, take: 1 },
      orders: {
        where: { status: { in: ['WAITING_DRIVER', 'DISPATCHED'] } },
        select: { id: true, displayId: true, status: true, deliveryAddress: true },
      },
    },
  });

  return drivers.map((d) => ({
    id: d.id,
    name: d.name,
    status: d.status,
    vehiclePlate: d.vehiclePlate,
    position: d.locations[0]
      ? {
          latitude: d.locations[0].latitude,
          longitude: d.locations[0].longitude,
          accuracy: d.locations[0].accuracy,
          at: d.locations[0].createdAt,
        }
      : null,
    activeOrders: d.orders,
    onShift: (!d.user||d.user.active&&!d.user.mustChangePassword)&&driverShiftAvailability(readDriverSchedule(settings, d.id)).allowed,
    shiftLabel: d.user?.mustChangePassword?'Ativação pendente':driverShiftAvailability(readDriverSchedule(settings, d.id)).label,
  }));
}

export async function getDriverSummary(organizationId: string) {
  const [total, active, onlineDrivers, busy, dispatchesToday, settings] = await Promise.all([
    prisma.driver.count({ where: { organizationId } }),
    prisma.driver.count({ where: { organizationId, active: true } }),
    prisma.driver.findMany({ where: { organizationId, active: true, status: 'ONLINE', orders: { none: { status: { in: ['WAITING_DRIVER', 'DISPATCHED'] } } } }, select: { id: true } }),
    prisma.driver.count({ where: { organizationId, active: true, status: 'BUSY' } }),
    prisma.order.count({
      where: {
        organizationId,
        status: 'DELIVERED',
        deliveredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        driverId: { not: null },
      },
    }),
    getDriverSchedules(organizationId),
  ]);
  const online = onlineDrivers.filter(driver => driverShiftAvailability(readDriverSchedule(settings, driver.id)).allowed).length;
  return { total, active, online, busy, dispatchesToday };
}
