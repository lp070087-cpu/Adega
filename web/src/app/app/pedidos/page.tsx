import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { prisma, toNumber } from '@/lib/db';
import { getOrders } from '@/lib/data/orders';
import { getDrivers } from '@/lib/data/drivers';
import { OrdersBoard } from '@/components/orders/OrdersBoard';
import type { DrawerOrder } from '@/components/orders/OrderDrawer';
import { readAutoAccept } from '@/lib/order-flow';

export const metadata = { title: 'Central de Pedidos' };
export const dynamic = 'force-dynamic';

/**
 * Central de Pedidos.
 *
 * O servidor busca os pedidos DESTA organização (organizationId da
 * sessão) e entrega ao quadro. O kanban arrasta no cliente, mas cada
 * mudança de status é uma server action que revalida tudo: permissão,
 * transição válida e vínculo do entregador.
 */
export default async function OrdersPage() {
  const ctx = await requireOrgPage('MANAGE_ORDERS');

  const [orders, drivers, products, organization] = await Promise.all([
    getOrders(ctx.organizationId, { perPage: 100, status: undefined }),
    can(ctx.role, 'MANAGE_DRIVERS')
      ? getDrivers(ctx.organizationId, { active: true })
      : Promise.resolve([]),
    prisma.product.findMany({
      where: { organizationId: ctx.organizationId, active: true, available: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, price: true, promotionalPrice: true,
        variations: { where: { active: true }, select: { id: true, name: true, priceAdjustment: true } },
        addonGroups: { select: { id: true, name: true, required: true, minSelections: true, maxSelections: true,
          addons: { where: { active: true }, select: { id: true, name: true, price: true } } } } },
    }),
    prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } }),
  ]);

  // Só os campos que a tela usa — nada de mandar o objeto Prisma inteiro.
  const serialized: DrawerOrder[] = orders.items.map((order) => ({
    id: order.id,
    displayId: order.displayId,
    source: order.source,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    total: order.total,
    deliveryFee: order.deliveryFee,
    deliveryType: order.deliveryType,
    subtotal: order.subtotal,
    discount: order.discount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    // Opcional no banco (pedido de retirada); a tela mostra string.
    deliveryAddress: order.deliveryAddress ?? '',
    deliveryNumber: order.deliveryNumber,
    deliveryDistrict: order.deliveryDistrict,
    deliveryCity: order.deliveryCity,
    deliveryZipCode: order.deliveryZipCode,
    notes: order.notes,
    createdAt: (order.createdAt as Date).toISOString(),
    acceptedAt: order.acceptedAt ? (order.acceptedAt as Date).toISOString() : null,
    readyAt: order.readyAt ? (order.readyAt as Date).toISOString() : null,
    dispatchedAt: order.dispatchedAt ? (order.dispatchedAt as Date).toISOString() : null,
    deliveredAt: order.deliveredAt ? (order.deliveredAt as Date).toISOString() : null,
    cancelledAt: order.cancelledAt ? (order.cancelledAt as Date).toISOString() : null,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      variationName: item.variationName,
      notes: item.notes,
      total: Number(item.total),
      options: item.options.map((option) => ({
        id: option.id,
        name: option.name,
        price: Number(option.price),
        quantity: option.quantity,
      })),
    })),
    driver: order.driver
      ? { id: order.driver.id, name: order.driver.name, status: order.driver.status }
      : null,
  }));

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Central de Pedidos</h2>
        <p className="text-[0.8rem] text-ink-500">
          Um cartão por pedido, com o botão da próxima etapa. Últimos {serialized.length} pedidos da loja.
        </p>
      </div>

      <OrdersBoard
        orders={serialized}
        products={products.map((product) => ({
          id: product.id, name: product.name, price: toNumber(product.promotionalPrice ?? product.price),
          variations: product.variations.map((v) => ({ ...v, priceAdjustment: toNumber(v.priceAdjustment) })),
          addonGroups: product.addonGroups.map((g) => ({ ...g, addons: g.addons.map((a) => ({ ...a, price: toNumber(a.price) })) })),
        }))}
        drivers={drivers.filter((driver) => driver.active).map((driver) => ({
          id: driver.id,
          name: driver.name,
          status: driver.status,
          activeOrders: driver.activeOrders,
          accessPending: driver.accessPending,
        }))}
        canManageOrders={can(ctx.role, 'MANAGE_ORDERS')}
        canManageDrivers={can(ctx.role, 'MANAGE_DRIVERS')}
        canManageSettings={can(ctx.role, 'MANAGE_SETTINGS')}
        autoAccept={readAutoAccept(organization?.settings)}
      />
    </div>
  );
}

