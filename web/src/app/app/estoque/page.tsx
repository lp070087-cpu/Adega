import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import {
  getInventoryMovements,
  getInventoryValue,
  getStockProducts,
} from '@/lib/data/inventory';
import { StockManager } from '@/components/stock/StockManager';
import type { StockMovement, StockProduct } from '@/components/stock/StockManager';

export const metadata = { title: 'Estoque' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ESTOQUE
 * -----------------------------------------------------------------------
 * Saldo e livro-razão vêm do servidor. A tela não calcula valor de
 * estoque nem soma quantidade: `getInventoryValue` faz isso no banco.
 *
 * O ajuste nunca chega como saldo final calculado pelo navegador — o
 * servidor relê o saldo atual dentro da transação, recusa saída maior
 * que o estoque e grava o movimento correspondente.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function StockPage() {
  const ctx = await requireOrgPage('MANAGE_STOCK');

  const [productsRaw, movementsPage, summary] = await Promise.all([
    getStockProducts(ctx.organizationId),
    getInventoryMovements(ctx.organizationId, { perPage: 100 }),
    getInventoryValue(ctx.organizationId),
  ]);

  const products: StockProduct[] = productsRaw.map((product) => ({
    id: product.id,
    name: product.name,
    emoji: product.emoji,
    sku: product.sku,
    categoryName: product.category?.name ?? null,
    stock: product.stock,
    minimumStock: product.minimumStock,
    cost: product.cost === null ? null : Number(product.cost),
    price: Number(product.price),
    trackStock: product.trackStock,
    active: product.active,
  }));

  const movements: StockMovement[] = movementsPage.items.map((movement) => ({
    id: movement.id,
    type: movement.type,
    quantity: movement.quantity,
    previousStock: movement.previousStock,
    newStock: movement.newStock,
    reason: movement.reason,
    createdAt: movement.createdAt.toISOString(),
    productName: movement.product.name,
    productEmoji: movement.product.emoji,
    userName: movement.user?.name ?? null,
  }));

  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= p.minimumStock).length;
  const outOfStock = products.filter((p) => p.stock === 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Estoque</h2>
        <p className="text-[0.8rem] text-ink-500">
          Saldo por produto e o histórico de tudo que mudou o saldo.
        </p>
      </div>

      <StockManager
        products={products}
        movements={movements}
        summary={{
          productCount: summary.productCount,
          units: summary.units,
          costValue: summary.costValue,
          saleValue: summary.saleValue,
          lowStock,
          outOfStock,
        }}
        canManage={can(ctx.role, 'MANAGE_STOCK')}
      />
    </div>
  );
}
