'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { OperationError } from '@/lib/operation-error';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { buildStockPublicationPreview, stockPublicationDigest } from '@/lib/stock-publication';

const changeSchema = z.object({ id: z.string().min(1).max(100), stock: z.number().int().min(0).max(999999), minimumStock: z.number().int().min(0).max(999999), active: z.boolean(), available: z.boolean(), trackStock: z.boolean() });
const requestSchema = z.object({ mode: z.enum(['INITIALIZE','PUBLISH']), requestId: z.string().uuid(), changes: z.array(changeSchema).min(1).max(100), reason: z.string().trim().min(10).max(300), confirm: z.boolean(), previewDigest: z.string().regex(/^[a-f0-9]{64}$/).optional() });

export async function stockPublicationAction(input: z.infer<typeof requestSchema>) {
  try {
    const ctx = await requirePermission('MANAGE_STOCK');
    if (!can(ctx.role, 'MANAGE_PRODUCTS')) throw new OperationError('Seu perfil não pode publicar produtos.');
    const data = requestSchema.parse(input);
    if (data.mode === 'INITIALIZE' && !can(ctx.role, 'MANAGE_SETTINGS')) throw new OperationError('A inicialização em lote exige administração da loja.');
    if (data.mode === 'INITIALIZE' && data.changes.some(row => row.stock !== 25 || row.minimumStock !== 5 || !row.active || !row.available || !row.trackStock)) throw new OperationError('A inicialização padrão aplica saldo 25, mínimo 5 e disponibilidade ativa. Para outra contagem, use publicação conferida.');
    if (new Set(data.changes.map(row => row.id)).size !== data.changes.length) throw new OperationError('Selecione cada produto uma única vez.');
    const organizationId = ctx.organizationId;
    const fingerprint = stockPublicationDigest({ mode: data.mode, changes: [...data.changes].sort((a,b) => a.id.localeCompare(b.id)), reason: data.reason });
    const result = await withOrganizationTransaction(organizationId, async tx => {
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, settings: true } });
      const settings = organization.settings && typeof organization.settings === 'object' && !Array.isArray(organization.settings) ? organization.settings : {};
      const operations = settings.stockPublicationOperations && typeof settings.stockPublicationOperations === 'object' && !Array.isArray(settings.stockPublicationOperations) ? settings.stockPublicationOperations as Record<string, { fingerprint: string; count: number }> : {};
      const previousOperation = operations[data.requestId];
      if (previousOperation) {
        if (previousOperation.fingerprint !== fingerprint) throw new OperationError('A referência já pertence a outra operação. Gere uma nova prévia.');
        return { organization: { id: organizationId, name: organization.name }, rows: [], digest: '', changed: previousOperation.count, repeated: true };
      }
      const ids = data.changes.map(row => row.id);
      const products = await tx.product.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true, stock: true, minimumStock: true, active: true, available: true, trackStock: true, updatedAt: true, combo: { select: { id: true } } } });
      if (products.length !== ids.length) throw new OperationError('Produto excluído ou não encontrado nesta loja. Gere uma nova seleção.');
      const pendingOrders = await tx.orderItem.findMany({ where: { productId: { in: ids }, order: { organizationId, status: { notIn: ['DELIVERED','CANCELLED'] } } }, select: { productId: true }, distinct: ['productId'] });
      const reserved = new Set(pendingOrders.map(item => item.productId));
      // Components of a combo already ordered are also protected from a batch recount.
      const pendingCombos = await tx.combo.findMany({ where: { organizationId, items: { some: { productId: { in: ids } } }, product: { orderItems: { some: { order: { organizationId, status: { notIn: ['DELIVERED','CANCELLED'] } } } } } }, select: { items: { select: { productId: true } } } });
      for (const combo of pendingCombos) for (const item of combo.items) reserved.add(item.productId);
      const excluded = new Map<string,string>();
      for (const product of products) {
        if (product.combo) excluded.set(product.id, 'Combo: revise os componentes na gestão de combos.');
        else if (reserved.has(product.id)) excluded.set(product.id, 'Produto participa de pedido em andamento.');
      }
      const rows = buildStockPublicationPreview(products, data.changes, excluded);
      const digest = stockPublicationDigest({ organizationId, mode: data.mode, rows });
      if (data.confirm) {
        if (data.previewDigest !== digest) throw new OperationError('O catálogo ou estoque mudou desde a prévia. Revise antes de confirmar.');
        if (Object.keys(operations).length >= 200) throw new OperationError('O histórico de lotes atingiu o limite seguro. Contate o suporte; nenhum histórico foi apagado.');
        const eligible = rows.filter(row => !row.excluded);
        if (!eligible.length) throw new OperationError('Nenhum produto elegível. Os produtos protegidos foram preservados.');
        for (const row of eligible) {
          await tx.product.update({ where: { id: row.id, organizationId }, data: { stock: row.proposed.stock, minimumStock: row.proposed.minimumStock, active: row.proposed.active, available: row.proposed.available, trackStock: row.proposed.trackStock } });
          if (row.previous.stock !== row.proposed.stock) await tx.inventoryMovement.create({ data: { organizationId, productId: row.id, userId: ctx.user.id, type: 'ADJUSTMENT', quantity: Math.abs(row.proposed.stock - row.previous.stock), previousStock: row.previous.stock, newStock: row.proposed.stock, reason: `${data.mode === 'INITIALIZE' ? 'Inicialização conferida' : 'Publicação conferida'}: ${data.reason}` } });
        }
        await tx.organization.update({ where: { id: organizationId }, data: { settings: { ...settings, stockPublicationOperations: { ...operations, [data.requestId]: { fingerprint, count: eligible.length, userId: ctx.user.id, createdAt: new Date().toISOString(), mode: data.mode, reason: data.reason, products: eligible } } } } });
        await tx.notification.create({ data: { organizationId, userId: ctx.user.id, type: 'SYSTEM', title: data.mode === 'INITIALIZE' ? 'Inicialização de estoque registrada' : 'Publicação no catálogo registrada', message: `${eligible.length} produtos conferidos por ${ctx.user.name}. Motivo: ${data.reason}`, href: '/app/estoque' } });
        return { organization: { id: organizationId, name: organization.name }, rows, digest, changed: eligible.length, repeated: false };
      }
      return { organization: { id: organizationId, name: organization.name }, rows, digest, changed: 0, repeated: false };
    });
    if (data.confirm) ['/app/estoque','/app/catalogo','/app/dashboard','/loja'].forEach(path => revalidatePath(path, 'layout'));
    return { ok: true as const, data: result };
  } catch (error) { return { ok: false as const, error: toActionError(error).error }; }
}
