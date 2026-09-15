import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma, toNumber } from '@/lib/db';
import { onlyDigits } from '@/lib/utils';

/**
 * Clientes. Métricas (pedidos, total gasto, ticket médio, último pedido)
 * são DERIVADAS dos pedidos reais — não existe contador gravado que
 * possa divergir da verdade.
 */

export type CustomerWithStats = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: Date;
  orderCount: number;
  totalSpent: number;
  averageTicket: number;
  lastOrderAt: Date | null;
};

export async function getCustomers(
  organizationId: string,
  filters: { search?: string; page?: number; perPage?: number } = {},
): Promise<{ items: CustomerWithStats[]; total: number; page: number; totalPages: number }> {
  const { search, page = 1, perPage = 30 } = filters;

  const where: Prisma.CustomerWhereInput = {
    organizationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: onlyDigits(search) } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        _count: { select: { orders: true } },
        orders: {
          // Só o necessário para as métricas; pedido cancelado não entra.
          where: { status: { not: 'CANCELLED' } },
          select: { total: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const items: CustomerWithStats[] = customers.map((c) => {
    const orderCount = c.orders.length;
    const totalSpent =
      Math.round(c.orders.reduce((acc, o) => acc + toNumber(o.total), 0) * 100) / 100;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      createdAt: c.createdAt,
      orderCount,
      totalSpent,
      averageTicket: orderCount > 0 ? Math.round((totalSpent / orderCount) * 100) / 100 : 0,
      lastOrderAt: c.orders[0]?.createdAt ?? null,
    };
  });

  return {
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getCustomerById(organizationId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    include: {
      addresses: { orderBy: { isDefault: 'desc' } },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          displayId: true,
          status: true,
          total: true,
          createdAt: true,
          source: true,
        },
      },
    },
  });
  if (!customer) return null;

  const validOrders = customer.orders.filter((o) => o.status !== 'CANCELLED');
  const totalSpent = validOrders.reduce((acc, o) => acc + toNumber(o.total), 0);

  return {
    ...customer,
    orders: customer.orders.map((o) => ({ ...o, total: toNumber(o.total) })),
    stats: {
      orderCount: validOrders.length,
      totalSpent: Math.round(totalSpent * 100) / 100,
      averageTicket:
        validOrders.length > 0 ? Math.round((totalSpent / validOrders.length) * 100) / 100 : 0,
      lastOrderAt: customer.orders[0]?.createdAt ?? null,
    },
  };
}

/**
 * Cria ou atualiza pelo telefone — a mesma regra usada no checkout.
 * Evita a lista de clientes virar uma pilha de duplicatas do mesmo freguês.
 */
export async function upsertCustomer(
  organizationId: string,
  input: { name: string; phone: string; email?: string; notes?: string },
) {
  const phone = onlyDigits(input.phone);

  const existing = await prisma.customer.findUnique({
    where: { organizationId_phone: { organizationId, phone } },
  });

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        email: input.email || existing.email,
        notes: input.notes ?? existing.notes,
      },
    });
  }

  return prisma.customer.create({
    data: {
      organizationId,
      name: input.name,
      phone,
      email: input.email || null,
      notes: input.notes || null,
    },
  });
}

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  input: { name: string; phone: string; email?: string | null; notes?: string | null },
) {
  const result = await prisma.customer.updateMany({
    where: { id: customerId, organizationId },
    data: {
      name: input.name,
      phone: onlyDigits(input.phone),
      email: input.email ?? null,
      notes: input.notes ?? null,
    },
  });
  if (result.count === 0) throw new Error('Cliente não encontrado.');
  return { ok: true };
}

export async function deleteCustomer(organizationId: string, customerId: string) {
  const result = await prisma.customer.deleteMany({
    where: { id: customerId, organizationId },
  });
  if (result.count === 0) throw new Error('Cliente não encontrado.');
  return { ok: true };
}

/**
 * Endereço do cliente. Confere o dono antes de gravar — sem isso daria
 * para pendurar endereço em cliente de outra loja passando um id.
 */
export async function createAddress(
  organizationId: string,
  input: {
    customerId: string;
    label?: string;
    street: string;
    number?: string;
    complement?: string;
    district?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    isDefault: boolean;
  },
) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, organizationId },
    select: { id: true },
  });
  if (!customer) throw new Error('Cliente não encontrado.');

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      // Só um endereço padrão por cliente.
      await tx.address.updateMany({
        where: { customerId: customer.id },
        data: { isDefault: false },
      });
    }

    return tx.address.create({
      data: {
        customerId: customer.id,
        label: input.label ?? null,
        street: input.street,
        number: input.number ?? null,
        complement: input.complement ?? null,
        district: input.district ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        zipCode: input.zipCode ?? null,
        isDefault: input.isDefault,
      },
    });
  });
}

/** Clientes recorrentes — quem mais compra, para ação de retenção. */
export async function getTopCustomers(organizationId: string, limit = 10) {
  const grouped = await prisma.order.groupBy({
    by: ['customerId'],
    where: {
      organizationId,
      status: { not: 'CANCELLED' },
      customerId: { not: null },
    },
    _sum: { total: true },
    _count: { _all: true },
    orderBy: { _sum: { total: 'desc' } },
    take: limit,
  });

  const ids = grouped.map((g) => g.customerId!).filter(Boolean);
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, name: true, phone: true },
  });
  const byId = new Map(customers.map((c) => [c.id, c]));

  return grouped
    .filter((g) => g.customerId && byId.has(g.customerId))
    .map((g) => ({
      customer: byId.get(g.customerId!)!,
      orders: g._count._all,
      totalSpent: toNumber(g._sum.total),
    }));
}

/** Resumo do topo da página de clientes. */
export async function getCustomerSummary(organizationId: string) {
  const [total, withOrders, aggregate] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }),
    prisma.customer.count({ where: { organizationId, orders: { some: {} } } }),
    prisma.order.aggregate({
      where: { organizationId, status: { not: 'CANCELLED' }, customerId: { not: null } },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);

  const revenue = toNumber(aggregate._sum.total);
  const orders = aggregate._count._all;

  return {
    total,
    withOrders,
    revenue,
    averageTicket: orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0,
  };
}
