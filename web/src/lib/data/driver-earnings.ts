import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma, toNumber } from '@/lib/db';
import { driverPayCents, earningsPeriodStart, earningsTimezone, readDriverPayRule, type EarningsPeriod } from '@/lib/driver-earnings';

/**
 * Ganhos por entrega. Um lançamento por pedido (`orderId` único), criado na
 * mesma transação que conclui a entrega: repetir a conclusão não duplica, e
 * cancelada ou devolvida nunca chega aqui. Mudar a regra não mexe no passado,
 * porque o valor fica gravado com a regra daquele momento.
 */
export async function recordDriverEarning(tx: Prisma.TransactionClient, organizationId: string, orderId: string) {
  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId, status: 'DELIVERED', deliveryType: 'DELIVERY', driverId: { not: null } },
    select: { id: true, driverId: true, deliveredAt: true, deliveryFee: true },
  });
  if (!order?.driverId || !order.deliveredAt) return;
  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const rule = readDriverPayRule(organization?.settings);
  if (!rule) return;
  const deliveryFeeCents = Math.round(toNumber(order.deliveryFee) * 100);
  await tx.driverEarning.createMany({
    data: [{
      organizationId,
      driverId: order.driverId,
      orderId: order.id,
      amountCents: driverPayCents(rule, deliveryFeeCents),
      deliveryFeeCents,
      ruleSnapshot: rule,
      completedAt: order.deliveredAt,
    }],
    skipDuplicates: true,
  });
}

export type EarningRow = {
  id: string;
  displayId: number;
  driverName: string;
  /** null: entrega concluída sem regra de remuneração na época. */
  amountCents: number | null;
  completedAt: string;
  /** Só na área da loja. O entregador nunca recebe valores do pedido. */
  deliveryFee?: number;
  orderTotal?: number;
};

export type DriverEarningsTotal = { driverId: string; name: string; deliveries: number; amountCents: number; deliveryFee: number; revenue: number };

export type EarningsSummary = {
  configured: boolean;
  amountCents: number;
  count: number;
  unpricedCount: number;
  rows: EarningRow[];
  /** Só na área da loja: uma linha por entregador. */
  drivers?: DriverEarningsTotal[];
  /** Só na área da loja. */
  store?: { revenue: number; deliveryFee: number };
};

const ROW_LIMIT = 200;

/** Com `driverId`, só os dados daquele entregador; com null, a visão da loja. Sempre por organização. */
export async function getDriverEarnings(organizationId: string, driverId: string | null, period: EarningsPeriod): Promise<EarningsSummary> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const now = new Date();
  const start = earningsPeriodStart(period, now, earningsTimezone(org?.settings));
  const where: Prisma.OrderWhereInput = {
    organizationId,
    status: 'DELIVERED',
    deliveryType: 'DELIVERY',
    driverId: driverId ?? { not: null },
    deliveredAt: { gte: start, lte: now },
  };

  const [orders, earnings, grouped] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { deliveredAt: 'desc' },
      take: ROW_LIMIT,
      select: { id: true, displayId: true, total: true, deliveryFee: true, deliveredAt: true, driver: { select: { name: true } }, driverEarning: { select: { amountCents: true } } },
    }),
    prisma.driverEarning.groupBy({ by: ['driverId'], where: { organizationId, order: where }, _sum: { amountCents: true }, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['driverId'], where, _count: { _all: true }, _sum: { total: true, deliveryFee: true } }),
  ]);

  const paid = new Map(earnings.map((row) => [row.driverId, row]));
  const count = grouped.reduce((sum, row) => sum + row._count._all, 0);
  const priced = earnings.reduce((sum, row) => sum + row._count._all, 0);
  const summary: EarningsSummary = {
    configured: Boolean(readDriverPayRule(org?.settings)),
    amountCents: earnings.reduce((sum, row) => sum + (row._sum.amountCents ?? 0), 0),
    count,
    unpricedCount: count - priced,
    rows: orders.map((order) => ({
      id: order.id,
      displayId: order.displayId,
      driverName: order.driver?.name ?? 'Entregador',
      amountCents: order.driverEarning?.amountCents ?? null,
      completedAt: order.deliveredAt!.toISOString(),
      ...(driverId ? {} : { deliveryFee: toNumber(order.deliveryFee), orderTotal: toNumber(order.total) }),
    })),
  };
  if (driverId) return summary;

  const names = await prisma.driver.findMany({ where: { organizationId, id: { in: grouped.map((row) => row.driverId!).filter(Boolean) } }, select: { id: true, name: true } });
  const nameOf = new Map(names.map((driver) => [driver.id, driver.name]));
  summary.drivers = grouped
    .map((row) => ({
      driverId: row.driverId!,
      name: nameOf.get(row.driverId!) ?? 'Entregador',
      deliveries: row._count._all,
      amountCents: paid.get(row.driverId!)?._sum.amountCents ?? 0,
      deliveryFee: toNumber(row._sum.deliveryFee),
      revenue: toNumber(row._sum.total),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  summary.store = {
    revenue: summary.drivers.reduce((sum, row) => sum + row.revenue, 0),
    deliveryFee: summary.drivers.reduce((sum, row) => sum + row.deliveryFee, 0),
  };
  return summary;
}
