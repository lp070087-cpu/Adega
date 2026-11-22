'use server';
import { z } from 'zod';
import { MAX_CATALOG_SELECTION } from '@/lib/stock-policy';
import { revalidatePath } from 'next/cache';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { OperationError } from '@/lib/operation-error';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { buildStockPublicationPreview, stockPublicationDigest } from '@/lib/stock-publication';

const changeSchema = z.object({ id: z.string().min(1).max(100), stock: z.number().int().min(0).max(999999), minimumStock: z.number().int().min(0).max(999999), active: z.boolean(), available: z.boolean(), trackStock: z.boolean() });
const requestSchema = z.object({ mode: z.enum(['INITIALIZE','PUBLISH']), requestId: z.string().uuid(), changes: z.array(changeSchema).min(1).max(MAX_CATALOG_SELECTION), reason: z.string().trim().min(10).max(300), confirm: z.boolean(), previewDigest: z.string().regex(/^[a-f0-9]{64}$/).optional() });

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
      const products = await tx.product.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true, price: true, stock: true, minimumStock: true, active: true, available: true, trackStock: true, updatedAt: true, combo: { select: { id: true } } } });
      if (products.length !== ids.length) throw new OperationError('Produto excluído ou não encontrado nesta loja. Gere uma nova seleção.');
      const pendingOrders = await tx.orderItem.findMany({ where: { productId: { in: ids }, order: { organizationId, status: { notIn: ['DELIVERED','CANCELLED'] } } }, select: { productId: true }, distinct: ['productId'] });
      const reserved = new Set(pendingOrders.map(item => item.productId));
      // Components of a combo already ordered are also protected from a batch recount.
      const pendingCombos = await tx.combo.findMany({ where: { organizationId, items: { some: { productId: { in: ids } } }, product: { orderItems: { some: { order: { organizationId, status: { notIn: ['DELIVERED','CANCELLED'] } } } } } }, select: { items: { select: { productId: true } } } });
      for (const combo of pendingCombos) for (const item of combo.items) reserved.add(item.productId);
      const changes = new Map(data.changes.map((change) => [change.id, change]));
      const excluded = new Map<string, string>();
      for (const product of products) {
        const proposed = changes.get(product.id)!;
        if (product.combo) excluded.set(product.id, 'Combo: revise os componentes na gestão de combos.');
        else if (reserved.has(product.id)) excluded.set(product.id, 'Produto participa de pedido em andamento.');
        else if (!product.active && proposed.active && Number(product.price) <= 0) excluded.set(product.id, 'Defina o preço de venda no Estoque antes de publicar.');
        else if (!product.active && proposed.active && proposed.trackStock && proposed.stock === 0) excluded.set(product.id, 'Informe o saldo físico antes de publicar.');
      }
      const rows = buildStockPublicationPreview(products, data.changes, excluded);
      const digest = stockPublicationDigest({ organizationId, mode: data.mode, rows });
      if (data.confirm) {
        if (data.previewDigest !== digest) throw new OperationError('O catálogo ou estoque mudou desde a prévia. Revise antes de confirmar.');
        if (Object.keys(operations).length >= 200) throw new OperationError('O histórico de lotes atingiu o limite seguro. Contate o suporte; nenhum histórico foi apagado.');
        const eligible = rows.filter(row => !row.excluded);
        if (!eligible.length) throw new OperationError('Nenhum produto elegível. Os produtos protegidos foram preservados.');
        // Update the whole selection in one statement, checking the version
        // of each product against the reviewed snapshot.
        const updates = eligible.map(({ proposed, updatedAt }) => ({ ...proposed, updatedAt }));
        const updated = await tx.$executeRaw`
          UPDATE "Product" AS product
          SET stock = input.stock, "minimumStock" = input."minimumStock",
              active = input.active, available = input.available,
              "trackStock" = input."trackStock", "updatedAt" = timezone('UTC', now())
          FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS input(
            id text, stock int, "minimumStock" int, active boolean, available boolean,
            "trackStock" boolean, "updatedAt" timestamp
          )
          WHERE product.id = input.id AND product."organizationId" = ${organizationId}
            AND product."updatedAt" = input."updatedAt"
        `;
        if (updated !== eligible.length) throw new OperationError('O catálogo mudou. Revise a seleção novamente.');

        const movements = eligible.filter(({ previous, proposed }) => previous.stock !== proposed.stock);
        if (movements.length) {
          const prefix = data.mode === 'INITIALIZE' ? 'Inicialização conferida' : 'Publicação conferida';
          await tx.inventoryMovement.createMany({ data: movements.map((row) => ({
            organizationId, productId: row.id, userId: ctx.user.id, type: 'ADJUSTMENT',
            quantity: Math.abs(row.proposed.stock - row.previous.stock),
            previousStock: row.previous.stock, newStock: row.proposed.stock, reason: `${prefix}: ${data.reason}`,
          })) });
        }
        await tx.organization.update({ where: { id: organizationId }, data: { settings: { ...settings, stockPublicationOperations: { ...operations, [data.requestId]: { fingerprint, count: eligible.length, userId: ctx.user.id, createdAt: new Date().toISOString(), mode: data.mode, reason: data.reason, products: eligible } } } } });
        await tx.notification.create({ data: { organizationId, userId: ctx.user.id, type: 'SYSTEM', title: data.mode === 'INITIALIZE' ? 'Inicialização de estoque registrada' : 'Publicação no catálogo registrada', message: `${eligible.length} produtos conferidos por ${ctx.user.name}. Motivo: ${data.reason}`, href: '/app/estoque' } });
        return { organization: { id: organizationId, name: organization.name }, rows, digest, changed: eligible.length, repeated: false };
      }
      return { organization: { id: organizationId, name: organization.name }, rows, digest, changed: 0, repeated: false };
    });
    if (data.confirm) ['/app/estoque','/app/catalogo','/app/biblioteca','/app/dashboard','/loja'].forEach(path => revalidatePath(path, 'layout'));
    return { ok: true as const, data: result };
  } catch (error) { return { ok: false as const, error: error instanceof z.ZodError ? 'Confira as quantidades e os campos do lote e tente novamente.' : toActionError(error).error }; }
}
