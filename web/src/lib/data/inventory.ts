import 'server-only';
import type { InventoryMovementType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { toNumber } from '@/lib/db';

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
export async function getStockProducts(organizationId: string, limit = 500) {
  return prisma.product.findMany({
    where: { organizationId, trackStock: true },
    orderBy: [{ stock: 'asc' }, { name: 'asc' }],
    take: limit,
    select: {
      id: true,
      name: true,
      emoji: true,
      sku: true,
      stock: true,
      minimumStock: true,
      cost: true,
      price: true,
      trackStock: true,
      active: true,
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
  if (quantity === 0) throw new Error('Informe uma quantidade diferente de zero.');

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, organizationId },
      select: { id: true, name: true, stock: true, trackStock: true },
    });
    if (!product) throw new Error('Produto não encontrado.');

    const previousStock = product.stock;
    const newStock = previousStock + quantity;
    if (newStock < 0) {
      throw new Error(
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
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, organizationId },
      select: { id: true, name: true, stock: true },
    });
    if (!product) throw new Error('Produto não encontrado.');

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
export async function deductOrderStock(organizationId: string, orderId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw new Error('Pedido não encontrado.');

    // Já baixado: não faz nada. Esta é a proteção contra baixa dupla.
    if (order.stockDeducted) {
      return { alreadyDeducted: true, movements: 0 };
    }

    let movements = 0;

    for (const item of order.items) {
      if (!item.productId) continue;

      const product = await tx.product.findFirst({
        where: { id: item.productId, organizationId },
        select: { id: true, name: true, stock: true, trackStock: true },
      });
      // Produto sem controle de estoque (ou removido) não gera movimento.
      if (!product || !product.trackStock) continue;

      const previousStock = product.stock;
      // Nunca deixa o saldo negativo: a venda é registrada, mas o
      // estoque para em zero e o lojista vê a divergência no extrato.
      const newStock = Math.max(0, previousStock - item.quantity);

      await tx.product.update({ where: { id: product.id }, data: { stock: newStock } });

      await tx.inventoryMovement.create({
        data: {
          organizationId,
          productId: product.id,
          type: 'SALE',
          quantity: item.quantity,
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
  });
}

/** Devolve o estoque de um pedido cancelado. Idempotente pelo tipo CANCELLATION. */
export async function restoreOrderStock(organizationId: string, orderId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw new Error('Pedido não encontrado.');
    if (!order.stockDeducted) return { restored: false, movements: 0 };

    // Se já existe um cancelamento registrado, não devolve de novo.
    const already = await tx.inventoryMovement.count({
      where: { organizationId, orderId, type: 'CANCELLATION' },
    });
    if (already > 0) return { restored: false, movements: 0 };

    let movements = 0;
    for (const item of order.items) {
      if (!item.productId) continue;
      const product = await tx.product.findFirst({
        where: { id: item.productId, organizationId },
        select: { id: true, stock: true, trackStock: true },
      });
      if (!product || !product.trackStock) continue;

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
  });
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
