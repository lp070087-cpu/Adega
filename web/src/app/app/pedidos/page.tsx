import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getOrders } from '@/lib/data/orders';
import { getDrivers } from '@/lib/data/drivers';
import { OrdersBoard } from '@/components/orders/OrdersBoard';
import type { DrawerOrder } from '@/components/orders/OrderDrawer';

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

  const [orders, drivers] = await Promise.all([
    getOrders(ctx.organizationId, { perPage: 100, status: undefined }),
    can(ctx.role, 'MANAGE_DRIVERS')
      ? getDrivers(ctx.organizationId, { active: true })
      : Promise.resolve([]),
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
          Acompanhe e avance cada pedido. Últimos {serialized.length} pedidos da loja.
        </p>
      </div>

      <OrdersBoard
        orders={serialized}
        drivers={drivers.map((driver) => ({
          id: driver.id,
          name: driver.name,
          status: driver.status,
        }))}
        canManageOrders={can(ctx.role, 'MANAGE_ORDERS')}
        canManageDrivers={can(ctx.role, 'MANAGE_DRIVERS')}
      />
    </div>
  );
}

