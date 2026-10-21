'use server';
import { revalidatePath } from 'next/cache';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { stockInlineSchema } from '@/lib/stock-inline';
import { OperationError } from '@/lib/operation-error';
import { z } from 'zod';

export async function updateStockInlineAction(input: z.input<typeof stockInlineSchema>) {
  try {
    const data = stockInlineSchema.parse(input);
    const ctx = await requirePermission(data.field === 'stock' || data.field === 'minimumStock' ? 'MANAGE_STOCK' : 'MANAGE_PRODUCTS');
    await withOrganizationTransaction(ctx.organizationId, async tx => {
      const product = await tx.product.findFirst({ where: { id: data.productId, organizationId: ctx.organizationId }, select: { id: true, name: true, stock: true, minimumStock: true, cost: true, price: true, promotionalPrice: true, trackStock: true } });
      if (!product) throw new OperationError('Produto não encontrado nesta loja.');
      const previous = product[data.field] === null ? null : Number(product[data.field]);
      if (previous !== data.previousValue) throw new OperationError('Este valor mudou desde a abertura da edição. Atualize a página e confira novamente.');
      if (data.field === 'stock' && !product.trackStock) throw new OperationError('Ative o controle de estoque antes de corrigir a quantidade.');
      if (data.field === 'price' && product.promotionalPrice !== null && Number(product.promotionalPrice) > data.value) throw new OperationError('O preço de venda não pode ficar abaixo do preço promocional vigente. Revise a promoção no catálogo.');
      if (previous === data.value) return;
      const changed = await tx.product.updateMany({ where: {
        id: product.id, organizationId: ctx.organizationId,
        [data.field]: data.previousValue,
        ...(data.field === 'price' ? { promotionalPrice: product.promotionalPrice } : {}),
      }, data: { [data.field]: data.value } });
      if (changed.count !== 1) throw new OperationError('O produto mudou durante a edição. Atualize e confira novamente.');
      if (data.field === 'stock') await tx.inventoryMovement.create({ data: { organizationId: ctx.organizationId, productId: product.id, userId: ctx.user.id, type: 'ADJUSTMENT', previousStock: previous!, newStock: data.value, quantity: Math.abs(data.value - previous!), reason: data.reason } });
      await tx.notification.create({ data: { organizationId: ctx.organizationId, userId: ctx.user.id, type: 'SYSTEM', title: 'Edição de estoque registrada', message: `${product.name} · ${data.field}: ${previous ?? 'não definido'} → ${data.value}. Responsável: ${ctx.user.id}. Motivo: ${data.reason}`, href: '/app/estoque' } });
    });
    ['/app/estoque', '/app/catalogo', '/app/dashboard', '/loja'].forEach(path => revalidatePath(path, 'layout'));
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: toActionError(error).error }; }
}
