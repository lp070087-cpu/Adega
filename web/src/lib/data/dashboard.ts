import 'server-only';
import { prisma, toNumber } from '@/lib/db';
import { addDays, dayKey, startOfDay } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * DASHBOARD E RELATÓRIOS — cálculo no servidor
 * -----------------------------------------------------------------------
 * Nenhum indicador é calculado no navegador. Se o número aparece na
 * tela, ele veio de uma agregação do banco: não há como o usuário
 * "ajustar" o faturamento pelo DevTools.
 *
 * Pedido cancelado NUNCA entra em faturamento/ticket médio.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const PAID_STATUSES = ['CONFIRMED', 'PREPARING', 'READY', 'WAITING_DRIVER', 'DISPATCHED', 'DELIVERED'] as const;

export type Period = 'today' | '7d' | '30d' | 'custom';

export function periodRange(period: Period, from?: Date, to?: Date): { start: Date; end: Date } {
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);

  switch (period) {
    case 'today':
      return { start: startOfDay(new Date()), end };
    case '7d':
      return { start: startOfDay(addDays(new Date(), -6)), end };
    case '30d':
      return { start: startOfDay(addDays(new Date(), -29)), end };
    case 'custom':
      return {
        start: from ? startOfDay(from) : startOfDay(new Date()),
        end,
      };
  }
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export async function getDashboard(organizationId: string) {
  const todayStart = startOfDay(new Date());
  const now = new Date();

  const [
    todayOrders,
    openOrders,
    todayDelivered,
    driversOnline,
    lowStockCount,
    openShift,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { organizationId, createdAt: { gte: todayStart } },
      select: { id: true, total: true, status: true, source: true, createdAt: true },
    }),
    prisma.order.count({
      where: {
        organizationId,
        status: { in: ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'WAITING_DRIVER', 'DISPATCHED'] },
      },
    }),
    prisma.order.findMany({
      where: { organizationId, status: 'DELIVERED', deliveredAt: { gte: todayStart } },
      select: {
        id: true,
        total: true,
        deliveryFee: true,
        createdAt: true,
        acceptedAt: true,
        readyAt: true,
        dispatchedAt: true,
        deliveredAt: true,
      },
    }),
    prisma.driver.count({
      where: { organizationId, active: true, status: { in: ['ONLINE', 'BUSY', 'RETURNING'] } },
    }),
    prisma.product.count({
      where: {
        organizationId,
        trackStock: true,
        active: true,
        stock: { lte: prisma.product.fields.minimumStock },
      },
    }),
    prisma.cashShift.findFirst({
      where: { closedAt: null, cashRegister: { organizationId } },
      select: { id: true, openingAmount: true, openedAt: true },
    }),
  ]);

  // Faturamento: só pedido válido (cancelado fora).
  const validToday = todayOrders.filter((o) => o.status !== 'CANCELLED');
  const revenueToday = round2(validToday.reduce((acc, o) => acc + toNumber(o.total), 0));
  const ordersToday = validToday.length;
  const averageTicket = ordersToday > 0 ? round2(revenueToday / ordersToday) : 0;

  const platformFeesToday = round2(
    validToday
      .filter((o) => o.source !== 'OWN_STORE')
      .reduce((acc, o) => acc + toNumber(o.total), 0),
  );

  // Pedidos por hora (0h–23h) para o gráfico do dia.
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
  for (const order of validToday) {
    const hour = new Date(order.createdAt).getHours();
    byHour[hour]!.orders += 1;
    byHour[hour]!.revenue = round2(byHour[hour]!.revenue + toNumber(order.total));
  }

  // Origem dos pedidos.
  const bySource = new Map<string, { orders: number; revenue: number }>();
  for (const order of validToday) {
    const current = bySource.get(order.source) ?? { orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue = round2(current.revenue + toNumber(order.total));
    bySource.set(order.source, current);
  }

  // Tempos operacionais (médias do dia).
  const prepTimes: number[] = [];
  const deliveryTimes: number[] = [];
  const totalTimes: number[] = [];

  for (const order of todayDelivered) {
    if (order.acceptedAt && order.readyAt) {
      prepTimes.push(minutes(order.acceptedAt, order.readyAt));
    }
    if (order.dispatchedAt && order.deliveredAt) {
      deliveryTimes.push(minutes(order.dispatchedAt, order.deliveredAt));
    }
    if (order.createdAt && order.deliveredAt) {
      totalTimes.push(minutes(order.createdAt, order.deliveredAt));
    }
  }

  const deliveryFeesToday = round2(
    todayDelivered.reduce((acc, o) => acc + toNumber(o.deliveryFee), 0),
  );

  // Últimos 7 dias para o gráfico de evolução.
  const weekStart = startOfDay(addDays(new Date(), -6));
  const weekOrders = await prisma.order.findMany({
    where: {
      organizationId,
      createdAt: { gte: weekStart },
      status: { not: 'CANCELLED' },
    },
    select: { total: true, createdAt: true },
  });

  const weekMap = new Map<string, { orders: number; revenue: number }>();
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    weekMap.set(dayKey(day), { orders: 0, revenue: 0 });
  }
  for (const order of weekOrders) {
    const key = dayKey(new Date(order.createdAt));
    const entry = weekMap.get(key);
    if (entry) {
      entry.orders += 1;
      entry.revenue = round2(entry.revenue + toNumber(order.total));
    }
  }

  const week = [...weekMap.entries()].map(([date, data]) => ({
    date,
    label: new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
    }),
    ...data,
  }));

  // Produtos mais vendidos do dia.
  const topItems = await prisma.orderItem.groupBy({
    by: ['productName'],
    where: {
      order: {
        organizationId,
        createdAt: { gte: todayStart },
        status: { not: 'CANCELLED' },
      },
    },
    _sum: { quantity: true, total: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 8,
  });

  return {
    today: {
      revenue: revenueToday,
      orders: ordersToday,
      averageTicket,
      openOrders,
      platformFees: platformFeesToday,
      deliveryFees: deliveryFeesToday,
      cancelled: todayOrders.filter((o) => o.status === 'CANCELLED').length,
      delivered: todayDelivered.length,
    },
    operations: {
      driversOnline,
      lowStockCount,
      hasOpenShift: Boolean(openShift),
      openShiftAmount: openShift ? toNumber(openShift.openingAmount) : 0,
      openShiftSince: openShift?.openedAt ?? null,
    },
    times: {
      averagePrep: average(prepTimes),
      averageDelivery: average(deliveryTimes),
      averageTotal: average(totalTimes),
      sampleSize: totalTimes.length,
    },
    byHour,
    bySource: [...bySource.entries()].map(([source, data]) => ({ source, ...data })),
    week,
    topItems: topItems.map((t) => ({
      name: t.productName,
      quantity: t._sum.quantity ?? 0,
      revenue: toNumber(t._sum.total),
    })),
    generatedAt: now,
  };
}

/** Relatório de vendas por período, com quebra por origem e pagamento. */
export async function getSalesReport(
  organizationId: string,
  period: Period,
  from?: Date,
  to?: Date,
) {
  const { start, end } = periodRange(period, from, to);

  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      createdAt: { gte: start, lte: end },
      status: { not: 'CANCELLED' },
    },
    select: {
      id: true,
      displayId: true,
      source: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      subtotal: true,
      deliveryFee: true,
      discount: true,
      total: true,
      createdAt: true,
      deliveredAt: true,
      customerName: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const revenue = round2(orders.reduce((acc, o) => acc + toNumber(o.total), 0));
  const subtotal = round2(orders.reduce((acc, o) => acc + toNumber(o.subtotal), 0));
  const deliveryFees = round2(orders.reduce((acc, o) => acc + toNumber(o.deliveryFee), 0));
  const discounts = round2(orders.reduce((acc, o) => acc + toNumber(o.discount), 0));

  const bySource = aggregate(orders, (o) => o.source);
  const byPayment = aggregate(orders, (o) => o.paymentMethod);

  // Série diária.
  const dayMap = new Map<string, { orders: number; revenue: number }>();
  for (const order of orders) {
    const key = dayKey(new Date(order.createdAt));
    const entry = dayMap.get(key) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue = round2(entry.revenue + toNumber(order.total));
    dayMap.set(key, entry);
  }

  // Produtos vendidos no período.
  const items = await prisma.orderItem.groupBy({
    by: ['productName'],
    where: {
      order: {
        organizationId,
        createdAt: { gte: start, lte: end },
        status: { not: 'CANCELLED' },
      },
    },
    _sum: { quantity: true, total: true },
    orderBy: { _sum: { total: 'desc' } },
    take: 30,
  });

  return {
    range: { start, end },
    totals: {
      orders: orders.length,
      revenue,
      subtotal,
      deliveryFees,
      discounts,
      averageTicket: orders.length > 0 ? round2(revenue / orders.length) : 0,
    },
    bySource,
    byPayment,
    daily: [...dayMap.entries()]
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: items.map((i) => ({
      name: i.productName,
      quantity: i._sum.quantity ?? 0,
      revenue: toNumber(i._sum.total),
    })),
    orders: orders.map((o) => ({
      ...o,
      subtotal: toNumber(o.subtotal),
      deliveryFee: toNumber(o.deliveryFee),
      discount: toNumber(o.discount),
      total: toNumber(o.total),
    })),
  };
}

export type SalesReport = Awaited<ReturnType<typeof getSalesReport>>;

/** Relatório operacional: tempos, entregadores, gargalos. */
export async function getOperationsReport(
  organizationId: string,
  period: Period = '7d',
  from?: Date,
  to?: Date,
) {
  const { start, end } = periodRange(period, from, to);

  const [orders, driverStats] = await Promise.all([
    prisma.order.findMany({
      where: { organizationId, createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        acceptedAt: true,
        preparingAt: true,
        readyAt: true,
        dispatchedAt: true,
        deliveredAt: true,
        cancelledAt: true,
        driverId: true,
        total: true,
      },
    }),
    prisma.order.groupBy({
      by: ['driverId'],
      where: {
        organizationId,
        status: 'DELIVERED',
        deliveredAt: { gte: start, lte: end },
        driverId: { not: null },
      },
      _count: { _all: true },
      _sum: { deliveryFee: true, total: true },
    }),
  ]);

  const delivered = orders.filter((o) => o.status === 'DELIVERED');
  const cancelled = orders.filter((o) => o.status === 'CANCELLED');

  const prepTimes: number[] = [];
  const dispatchWait: number[] = [];
  const deliveryTimes: number[] = [];
  const totalTimes: number[] = [];

  for (const o of delivered) {
    if (o.acceptedAt && o.readyAt) prepTimes.push(minutes(o.acceptedAt, o.readyAt));
    if (o.readyAt && o.dispatchedAt) dispatchWait.push(minutes(o.readyAt, o.dispatchedAt));
    if (o.dispatchedAt && o.deliveredAt) deliveryTimes.push(minutes(o.dispatchedAt, o.deliveredAt));
    if (o.createdAt && o.deliveredAt) totalTimes.push(minutes(o.createdAt, o.deliveredAt));
  }

  const drivers = await prisma.driver.findMany({
    where: { organizationId, id: { in: driverStats.map((d) => d.driverId!).filter(Boolean) } },
    select: { id: true, name: true, vehicleType: true },
  });
  const driverMap = new Map(drivers.map((d) => [d.id, d]));

  return {
    range: { start, end },
    totals: {
      orders: orders.length,
      delivered: delivered.length,
      cancelled: cancelled.length,
      cancelRate: orders.length > 0 ? round2((cancelled.length / orders.length) * 100) : 0,
      inProgress: orders.filter((o) =>
        ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'WAITING_DRIVER', 'DISPATCHED'].includes(o.status),
      ).length,
    },
    times: {
      averagePrep: average(prepTimes),
      averageDispatchWait: average(dispatchWait),
      averageDelivery: average(deliveryTimes),
      averageTotal: average(totalTimes),
      maxTotal: totalTimes.length > 0 ? Math.max(...totalTimes) : 0,
    },
    drivers: driverStats
      .filter((d) => d.driverId && driverMap.has(d.driverId))
      .map((d) => ({
        id: d.driverId!,
        name: driverMap.get(d.driverId!)!.name,
        vehicleType: driverMap.get(d.driverId!)!.vehicleType,
        deliveries: d._count._all,
        deliveryFees: toNumber(d._sum.deliveryFee),
        orderValue: toNumber(d._sum.total),
      }))
      .sort((a, b) => b.deliveries - a.deliveries),
  };
}

export type OperationsReport = Awaited<ReturnType<typeof getOperationsReport>>;

// ── auxiliares ─────────────────────────────────────────────────────────

function minutes(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function aggregate<T>(
  items: T[],
  keyOf: (item: T) => string,
): Array<{ key: string; orders: number; revenue: number }> {
  const map = new Map<string, { orders: number; revenue: number }>();
  for (const item of items) {
    const key = keyOf(item);
    const entry = map.get(key) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue = round2(
      entry.revenue + toNumber((item as { total?: unknown }).total),
    );
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([key, data]) => ({ key, ...data }))
    .sort((a, b) => b.revenue - a.revenue);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
