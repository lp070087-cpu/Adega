import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getOrderBoard } from '@/lib/data/orders';
import { getDriverMap } from '@/lib/data/drivers';
import { getOrganizationById } from '@/lib/data/organization';
import { DispatchBoard } from '@/components/dispatch/DispatchBoard';
import type { DispatchOrder, DispatchDriver } from '@/components/dispatch/DispatchBoard';

export const metadata = { title: 'Mapa / Expedição' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MAPA / EXPEDIÇÃO
 * -----------------------------------------------------------------------
 * Reúne o que a Central de Pedidos separa em colunas: só os pedidos que
 * precisam de entregador, e só os entregadores com a posição que o app
 * deles reportou.
 *
 * As coordenadas vêm do banco — nunca de um parâmetro de URL. A loja do
 * centro do radar é a da sessão.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function DispatchPage() {
  const ctx = await requireOrgPage('MANAGE_DRIVERS');

  const [board, driversRaw, organization] = await Promise.all([
    getOrderBoard(ctx.organizationId, 48),
    getDriverMap(ctx.organizationId),
    getOrganizationById(ctx.organizationId),
  ]);

  // Esperando entregador: pronto sem entregador, mais o que aguarda
  // despacho. Pedido já atribuído continua na lista — mas sinalizado,
  // porque é justamente aí que mora o engano de despachar duas vezes.
  const relevant = [
    ...(board.READY ?? []),
    ...(board.WAITING_DRIVER ?? []),
  ];

  const orders: DispatchOrder[] = relevant.map((order) => ({
    id: order.id,
    displayId: order.displayId,
    status: order.status,
    customerName: order.customerName,
    deliveryDistrict: order.deliveryDistrict ?? null,
    // Opcional no banco (pedido de retirada não tem endereço).
    deliveryAddress: order.deliveryAddress ?? '',
    deliveryFee: order.deliveryFee,
    total: order.total,
    createdAt: order.createdAt.toISOString(),
    readyAt: order.readyAt ? order.readyAt.toISOString() : null,
    driverId: order.driverId ?? null,
    driverName: order.driver?.name ?? null,
    itemCount: order.items.length,
  }));

  const drivers: DispatchDriver[] = driversRaw.map((driver) => ({
    id: driver.id,
    name: driver.name,
    status: driver.status,
    vehiclePlate: driver.vehiclePlate,
    position: driver.position
      ? {
          latitude: driver.position.latitude,
          longitude: driver.position.longitude,
          at: driver.position.at.toISOString(),
        }
      : null,
    activeOrders: driver.activeOrders.length,
  }));

  const storePosition =
    organization?.latitude != null && organization?.longitude != null
      ? { latitude: organization.latitude, longitude: organization.longitude }
      : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Mapa / Expedição</h2>
        <p className="text-[0.8rem] text-ink-500">
          O que precisa sair, quem está na rua e onde cada um está.
        </p>
      </div>

      <DispatchBoard
        orders={orders}
        drivers={drivers}
        storePosition={storePosition}
        canDispatch={can(ctx.role, 'MANAGE_DRIVERS')}
      />
    </div>
  );
}
