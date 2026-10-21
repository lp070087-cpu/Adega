import 'server-only';
import { OperationError } from '@/lib/operation-error';
import type { InventoryMovementType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { toNumber } from '@/lib/db';
import { withOrganizationTransaction } from '@/lib/data/transaction';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ESTOQUE — livro-razão
 * -----------------------------------------------------------------------
 * Product.stock é o SALDO. InventoryMovement é a HISTÓRIA.
 * Toda mudança de saldo grava um movimento — sem exceção. É o que
 * permite auditar ("por que tem 3 e não 8?") e reverter um erro.
 *
 * Baixa dupla: Order.stockDeducted é a trava. A baixa roda dentro da
 * mesma transação que marca a flag, então dois cliques simultâneos não
 * descontam duas vezes.
 * ═══════════════════════════════════════════════════════════════════════
 */

export async function getInventoryMovements(
  organizationId: string,
  filters: {
    productId?: string;
    type?: InventoryMovementType;
    from?: Date;
    to?: Date;
    page?: number;
    perPage?: number;
  } = {},
) {
  const { productId, type, from, to, page = 1, perPage = 50 } = filters;

  const where: Prisma.InventoryMovementWhereInput = {
    organizationId,
    ...(productId ? { productId } : {}),
    ...(type ? { type } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        product: { select: { id: true, name: true, emoji: true, sku: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.inventoryMovement.count({ where }),
  ]);

  return { items, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/**
 * Produtos com controle de estoque — o saldo da tela de Estoque.
 *
 * Só entra o que tem `trackStock`: produto sem controle não tem saldo
 * para mostrar nem ajuste para fazer, e listá-lo aqui só criaria a
 * ilusão de que o número significa alguma coisa.
 */
export async function getStockProducts(organizationId: string, limit?: number, includeUncontrolled = false) {
  return prisma.product.findMany({
    where: { organizationId, ...(includeUncontrolled ? {} : { trackStock: true }) },
    orderBy: [{ stock: 'asc' }, { name: 'asc' }],
    ...(limit === undefined ? {} : { take: limit }),
    select: {
      id: true,
      name: true,
      emoji: true,
      sku: true,
      customImageUrl: true,
      imageUrl: true,
      globalProduct: { select: { defaultImageUrl: true } },
      stock: true,
      minimumStock: true,
      cost: true,
      price: true,
      trackStock: true,
      active: true,
      available: true,
      category: { select: { name: true } },
    },
  });
}

/** Produtos que precisam de reposição. */
export async function getLowStockProducts(organizationId: string, limit = 50) {
  return prisma.product.findMany({
    where: {
      organizationId,
      trackStock: true,
      active: true,
      stock: { lte: prisma.product.fields.minimumStock },
    },
    orderBy: { stock: 'asc' },
    take: limit,
    select: {
      id: true,
      name: true,
      emoji: true,
      sku: true,
      stock: true,
      minimumStock: true,
      cost: true,
      category: { select: { name: true } },
    },
  });
}

/**
 * Ajuste relativo: quantity positivo entra, negativo sai.
 * Usa updateMany com organizationId no where — um id de outra loja
 * simplesmente não encontra registro.
 */
export async function adjustStock(
  organizationId: string,
  productId: string,
  quantity: number,
  reason: string | undefined,
  userId?: string,
) {
  if (!Number.isSafeInteger(quantity) || quantity === 0) throw new OperationError('Informe uma quantidade inteira diferente de zero.');

  return withOrganizationTransaction(organizationId, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, organizationId },
      select: { id: true, name: true, stock: true, trackStock: true },
    });
    if (!product) throw new OperationError('Produto não encontrado.');
    if ('trackStock' in product && !product.trackStock) throw new OperationError('Ative o controle de estoque antes de ajustar este produto.');

    const previousStock = product.stock;
    const newStock = previousStock + quantity;
    if (newStock < 0) {
      throw new OperationError(
        `Estoque insuficiente: ${product.name} tem ${previousStock} un. e a saída pede ${Math.abs(quantity)}.`,
      );
    }

    await tx.product.update({
      where: { id: productId },
      data: { stock: newStock },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        organizationId,
        productId,
        type: quantity > 0 ? 'IN' : 'OUT',
        quantity: Math.abs(quantity),
        previousStock,
        newStock,
        reason: reason ?? null,
        userId: userId ?? null,
      },
    });

    return { ...movement, productName: product.name, previousStock, newStock };
  });
}

/** Inventário: define o saldo absoluto e registra a diferença. */
export async function setStock(
  organizationId: string,
  productId: string,
  newStock: number,
  reason: string | undefined,
  userId?: string,
  expectedStock?: number,
) {
  if (!Number.isSafeInteger(newStock) || newStock < 0) throw new OperationError('Informe um saldo inteiro não negativo.');
  return withOrganizationTransaction(organizationId, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, organizationId },
      select: { id: true, name: true, stock: true, trackStock: true },
    });
    if (!product) throw new OperationError('Produto não encontrado.');
    if ('trackStock' in product && !product.trackStock) throw new OperationError('Ative o controle de estoque antes de ajustar este produto.');

    if (expectedStock !== undefined && product.stock !== expectedStock) throw new OperationError('A quantidade mudou desde a abertura da contagem. Atualize e confira novamente.');
    const previousStock = product.stock;
    const diff = newStock - previousStock;

    await tx.product.update({ where: { id: productId }, data: { stock: newStock } });

    if (diff !== 0) {
      await tx.inventoryMovement.create({
        data: {
          organizationId,
          productId,
          type: 'ADJUSTMENT',
          quantity: Math.abs(diff),
          previousStock,
          newStock,
          reason: reason ?? 'Ajuste de inventário',
          userId: userId ?? null,
        },
      });
    }

    return { productName: product.name, previousStock, newStock, diff };
  });
}

/**
 * Baixa de estoque por venda.
 *
 * Chamada quando o pedido é confirmado/pago. A trava é
 * Order.stockDeducted: se já baixou, sai sem fazer nada. A leitura da
 * flag e a gravação acontecem na MESMA transação, então dois cliques
 * simultâneos não geram baixa dupla.
 */
export async function deductOrderStock(organizationId: string, orderId: string, userId?: string, transaction?: Prisma.TransactionClient) {
  return withOrganizationTransaction(organizationId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw new OperationError('Pedido não encontrado.');

    // Já baixado: não faz nada. Esta é a proteção contra baixa dupla.
    if (order.stockDeducted) {
      return { alreadyDeducted: true, movements: 0 };
    }

    let movements = 0;
    const demand = new Map<string, number>();
    for (const item of order.items) {
      if (!item.productId) continue;
      demand.set(item.productId, (demand.get(item.productId) ?? 0) + item.quantity);
      const combo = await tx.combo.findFirst({
        where: { organizationId, productId: item.productId },
        select: { items: { select: { productId: true, quantity: true } } },
      });
      for (const component of combo?.items ?? []) {
        demand.set(component.productId, (demand.get(component.productId) ?? 0) + component.quantity * item.quantity);
      }
    }

    for (const [productId, quantity] of demand) {
      const product = await tx.product.findFirst({
        where: { id: productId, organizationId },
        select: { id: true, name: true, stock: true, trackStock: true },
      });
      // Produto sem controle de estoque (ou removido) não gera movimento.
      if (!product || !product.trackStock) continue;

      const previousStock = product.stock;
      if (previousStock < quantity) throw new OperationError(`Estoque insuficiente: ${product.name}.`);
      const newStock = previousStock - quantity;

      await tx.product.update({ where: { id: product.id }, data: { stock: newStock } });

      await tx.inventoryMovement.create({
        data: {
          organizationId,
          productId: product.id,
          type: 'SALE',
          quantity,
          previousStock,
          newStock,
          reason: `Pedido #${order.displayId}`,
          orderId: order.id,
          userId: userId ?? null,
        },
      });
      movements++;
    }

    await tx.order.update({ where: { id: order.id }, data: { stockDeducted: true } });

    return { alreadyDeducted: false, movements };
  }, transaction);
}

/** Devolve o estoque de um pedido cancelado. Idempotente pelo tipo CANCELLATION. */
export async function restoreOrderStock(organizationId: string, orderId: string, userId?: string, transaction?: Prisma.TransactionClient) {
  return withOrganizationTransaction(organizationId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw new OperationError('Pedido não encontrado.');
    if (!order.stockDeducted) return { restored: false, movements: 0 };

    // Se já existe um cancelamento registrado, não devolve de novo.
    const already = await tx.inventoryMovement.count({
      where: { organizationId, orderId, type: 'CANCELLATION' },
    });
    if (already > 0) return { restored: false, movements: 0 };

    let movements = 0;
    // Restore what was actually deducted, including combo components even
    // when the catalog or stock-control setting changed after the sale.
    const sold = await tx.inventoryMovement.findMany({
      where: { organizationId, orderId, type: 'SALE' },
      select: { productId: true, quantity: true },
    });
    for (const item of sold) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, organizationId },
        select: { id: true, stock: true, trackStock: true },
      });
      if (!product) continue;

      const previousStock = product.stock;
      const newStock = previousStock + item.quantity;

      await tx.product.update({ where: { id: product.id }, data: { stock: newStock } });
      await tx.inventoryMovement.create({
        data: {
          organizationId,
          productId: product.id,
          type: 'CANCELLATION',
          quantity: item.quantity,
          previousStock,
          newStock,
          reason: `Cancelamento do pedido #${order.displayId}`,
          orderId: order.id,
          userId: userId ?? null,
        },
      });
      movements++;
    }

    await tx.order.update({ where: { id: order.id }, data: { stockDeducted: false } });
    return { restored: true, movements };
  }, transaction);
}

/** Valor total do estoque parado (custo × quantidade). */
export async function getInventoryValue(organizationId: string) {
  const products = await prisma.product.findMany({
    where: { organizationId, trackStock: true },
    select: { stock: true, cost: true, price: true },
  });

  let costValue = 0;
  let saleValue = 0;
  let units = 0;

  for (const p of products) {
    units += p.stock;
    costValue += p.stock * toNumber(p.cost);
    saleValue += p.stock * toNumber(p.price);
  }

  return {
    costValue: Math.round(costValue * 100) / 100,
    saleValue: Math.round(saleValue * 100) / 100,
    units,
    productCount: products.length,
  };
}
