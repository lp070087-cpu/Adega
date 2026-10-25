'use server';

import { requirePermission, toActionError } from '@/lib/auth/guards';
import { groupTopProducts, zonedMidnight, zonedStart, type TopSlice } from '@/lib/top-products';

export type TopProductsResult =
  | { ok: true; slices: TopSlice[]; total: number; quantity: number; orders: number; from: string; to: string }
  | { ok: false; error: string };

/**
 * Produtos mais vendidos da loja logada. Só pedidos ENTREGUES (vendas
 * concluídas) do período; cancelados ficam fora. Cada item de pedido conta
 * uma vez. Período no fuso da loja.
 */
export async function getTopProductsAction(input: { range: 'today' | 'month' | 'custom'; from?: string; to?: string }): Promise<TopProductsResult> {
  try {
    const { organizationId } = await requirePermission('VIEW_DASHBOARD');
    const { prisma } = await import('@/lib/db');
    const { storeTimeZone } = await import('@/lib/schedule');
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    const timeZone = storeTimeZone(org?.settings);
    const now = new Date();
    let start: Date, end: Date;
    if (input?.range === 'custom') {
      const valid = (v?: string) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (!valid(input.from) || !valid(input.to)) return { ok: false, error: 'Informe a data inicial e a final.' };
      if (input.from! > input.to!) return { ok: false, error: 'A data inicial precisa ser antes da final.' };
      start = zonedMidnight(input.from!, timeZone);
      end = new Date(zonedMidnight(input.to!, timeZone).getTime() + 86_400_000);
      if (end.getTime() - start.getTime() > 400 * 86_400_000) return { ok: false, error: 'Escolha um período de até 400 dias.' };
    } else {
      start = zonedStart(now, timeZone, input?.range === 'month' ? 'month' : 'day');
      end = now;
    }
    const where = { organizationId, status: 'DELIVERED' as const, createdAt: { gte: start, lt: end } };
    const [items, orders] = await Promise.all([
      prisma.orderItem.findMany({ where: { order: where }, select: { productId: true, productName: true, quantity: true, total: true } }),
      prisma.order.count({ where }),
    ]);
    const grouped = groupTopProducts(items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, total: Number(i.total) })), 5);
    return { ok: true, ...grouped, orders, from: start.toISOString(), to: end.toISOString() };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}
