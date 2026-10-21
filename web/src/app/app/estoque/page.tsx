import { prisma } from '@/lib/db';
import { stockDefaults } from '@/lib/stock-policy';
import { StockInitialization } from '@/components/stock/StockInitialization';
import { StockPublication } from '@/components/stock/StockPublication';
import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import {
  getInventoryMovements,
  getStockProducts,
} from '@/lib/data/inventory';
import { StockManager } from '@/components/stock/StockManager';
import type { StockMovement, StockProduct } from '@/components/stock/StockManager';

export const metadata = { title: 'Estoque' };
export const dynamic = 'force-dynamic';

/** One product snapshot feeds the list, publication preview and controlled inventory totals. */
export default async function StockPage() {
  const ctx = await requireOrgPage('MANAGE_STOCK');

  const [org, productsRaw, movementsPage] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { settings: true } }),
    getStockProducts(ctx.organizationId, undefined, true),
    getInventoryMovements(ctx.organizationId, { perPage: 100 }),
  ]);

  const products: StockProduct[] = productsRaw.map((product) => ({
    id: product.id,
    name: product.name,
    emoji: product.emoji,
    sku: product.sku,
    customImageUrl: product.customImageUrl ?? product.imageUrl,
    globalImageUrl: product.globalProduct?.defaultImageUrl ?? null,
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
    productId: movement.product.id,
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

  const controlledProducts = products.filter(product => product.trackStock);
  const summary = controlledProducts.reduce((sum, p) => ({ productCount: sum.productCount + 1, units: sum.units + p.stock, costValue: sum.costValue + p.stock * (p.cost ?? 0), saleValue: sum.saleValue + p.stock * p.price }), { productCount: 0, units: 0, costValue: 0, saleValue: 0 });
  const lowStock = controlledProducts.filter((p) => p.stock > 0 && p.stock <= p.minimumStock).length;
  const outOfStock = controlledProducts.filter((p) => p.stock === 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Estoque</h2>
        <p className="text-[0.8rem] text-ink-500">
          Quantidades, reposições e histórico de movimentações.
        </p>
      </div>

      <details className="rounded-xl border border-ink-100 bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">Padrões e inicialização conferida</summary><StockInitialization products={products} defaults={stockDefaults(org.settings)} canConfigure={can(ctx.role, 'MANAGE_SETTINGS')} /></details>
      {can(ctx.role, 'MANAGE_PRODUCTS') && <StockPublication products={productsRaw.map(product => ({id:product.id,name:product.name,stock:product.stock,minimumStock:product.minimumStock,active:product.active,available:product.available,trackStock:product.trackStock}))} canInitialize={can(ctx.role, 'MANAGE_SETTINGS')} />}
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
        canManageProducts={can(ctx.role, 'MANAGE_PRODUCTS')}
      />
    </div>
  );
}
