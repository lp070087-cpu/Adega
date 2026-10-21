'use server';
import { OperationError } from '@/lib/operation-error';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { stockDefaults } from '@/lib/stock-policy';

const request = z.object({ ids: z.array(z.string().min(1)).min(1).max(500), initialStock: z.number().int().min(0).max(999999), minimumStock: z.number().int().min(0).max(999999), reason: z.string().trim().min(5).max(200), confirm: z.boolean() });
export async function initializeStockAction(input: z.infer<typeof request>) {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_STOCK');
    const data = request.parse(input);
    const result = await withOrganizationTransaction(organizationId, async tx => {
      const ids = [...new Set(data.ids)];
      const products = await tx.product.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true, stock: true, trackStock: true } });
      if (products.length !== ids.length) throw new OperationError('Produto não encontrado nesta loja.');
      const moved = await tx.inventoryMovement.findMany({ where: { organizationId, productId: { in: ids } }, select: { productId: true }, distinct: ['productId'] });
      const withHistory = new Set(moved.map(movement => movement.productId));
      const eligible: typeof products = [];
      for (const product of products) {
        if (product.trackStock && product.stock === 0 && !withHistory.has(product.id)) eligible.push(product);
      }
      if (data.confirm) {
        if (eligible.length !== ids.length) throw new OperationError('O saldo ou histórico mudou. Revise a prévia; produtos com saldo ou movimentos são preservados.');
        await tx.product.updateMany({ where: { organizationId, id: { in: eligible.map(product => product.id) } }, data: { stock: data.initialStock, minimumStock: data.minimumStock } });
        await tx.inventoryMovement.createMany({ data: eligible.map(product => ({ organizationId, productId: product.id, type: 'ADJUSTMENT' as const, quantity: data.initialStock, previousStock: 0, newStock: data.initialStock, reason: data.reason, userId: user.id })) });
      }
      return { products: eligible.map(p => ({ id: p.id, name: p.name })), skipped: ids.length - eligible.length };
    });
    if (data.confirm) ['/app/estoque', '/app/catalogo', '/app/dashboard', '/loja'].forEach(path => revalidatePath(path, 'layout'));
    return { ok: true as const, data: result };
  } catch (error) { return { ok: false as const, error: toActionError(error).error }; }
}

export async function saveStockDefaultsAction(input: { initialStock: number; minimumStock: number }) {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const value = request.pick({ initialStock: true, minimumStock: true }).parse(input);
    await withOrganizationTransaction(organizationId, async tx => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
      const settings = org.settings && typeof org.settings === 'object' && !Array.isArray(org.settings) ? org.settings : {};
      await tx.organization.update({ where: { id: organizationId }, data: { settings: { ...settings, inventoryDefaults: stockDefaults({ inventoryDefaults: value }) } } });
    });
    revalidatePath('/app/estoque');
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: toActionError(error).error }; }
}
