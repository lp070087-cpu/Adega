import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireDriver, AuthError } from '@/lib/auth/guards';
import { getDriverOrders } from '@/lib/data/orders';
import { getOrganizationById } from '@/lib/data/organization';
import { DriverApp, type DriverOrder } from '@/components/driver/DriverApp';
import { DriverLoginForm } from '@/components/driver/DriverLoginForm';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * /entregador — APP DO ENTREGADOR (login + área autenticada)
 * -----------------------------------------------------------------------
 * Sem sessão, mostra a tela de login da Área do Entregador (e-mail OU
 * nome de usuário) — não o login do painel. Com sessão, confere o vínculo
 * com o cadastro de Driver no banco (requireDriver) e mostra o app.
 *
 * ISOLAMENTO — duas travas, nesta ordem:
 *   1. requireDriver() amarra o usuário logado a um registro Driver da
 *      organização dele;
 *   2. getDriverOrders(organizationId, driver.id) filtra por driverId.
 *
 * Consequência: não existe parâmetro nesta rota capaz de mostrar a
 * entrega de outro entregador nem de outra loja.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const metadata = { title: 'Área do Entregador' };

// Sem cache: o entregador recarrega a tela na rua, esperando o pedido
// que acabou de ser atribuído.
export const dynamic = 'force-dynamic';

export default async function DriverPage() {
  const session = await auth();

  // Sem sessão: formulário de login da área do entregador. O middleware
  // não barra /entregador (ver src/middleware.ts) exatamente para este
  // estado existir.
  if (!session?.user?.id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-50 p-4">
        <div className="w-full max-w-[460px] rounded-xl bg-white p-10 text-center shadow-xl">
          <span className="mx-auto mb-4 flex h-[46px] w-[46px] items-center justify-center rounded bg-brand-light text-[1.3rem]">
            🛵
          </span>

          <h1 className="text-[1.35rem] font-extrabold text-ink-900">Área do Entregador</h1>
          <p className="mt-1.5 text-[0.84rem] text-ink-500">
            Entre para ver as entregas atribuídas a você. E-mail ou nome de usuário — o que a loja
            cadastrou para o seu acesso.
          </p>

          <DriverLoginForm />

          <p className="mt-6 text-[0.8rem] text-ink-500">
            É dono ou atendente da loja?{' '}
            <a href="/login" className="font-semibold text-brand hover:underline">
              Entrar no painel
            </a>
          </p>
        </div>
      </main>
    );
  }

  // Anotação explícita de propósito: sem ela o `ctx` fica como any
  // evolutivo e o TypeScript perde a garantia de que ele está atribuído
  // depois do try/catch (o catch só sai por redirect ou throw).
  let ctx: Awaited<ReturnType<typeof requireDriver>>;

  try {
    ctx = await requireDriver();
  } catch (error) {
    // Quem está logado mas não é entregador volta ao painel em vez de ver
    // uma tela de erro.
    if (error instanceof AuthError) {
      redirect(error.code === 'UNAUTHENTICATED' ? '/login' : '/app?semPermissao=1');
    }
    throw error;
  }

  const [orders, organization] = await Promise.all([
    getDriverOrders(ctx.organizationId, ctx.driver.id),
    getOrganizationById(ctx.organizationId),
  ]);

  // A API de pedidos devolve Decimal e Date; o cliente React recebe
  // apenas o que precisa, já serializado.
  const serialized: DriverOrder[] = orders.map((order) => ({
    id: order.id,
    displayId: order.displayId,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    total: order.total,
    deliveryFee: order.deliveryFee,
    // No banco o campo é opcional (pedido de balcão não tem endereço de
    // entrega). O app do entregador só recebe pedidos de entrega, mas o
    // tipo não pode mentir: string vazia em vez de null.
    deliveryAddress: order.deliveryAddress ?? '',
    deliveryNumber: order.deliveryNumber,
    deliveryDistrict: order.deliveryDistrict,
    deliveryCity: order.deliveryCity,
    deliveryLatitude: order.deliveryLatitude,
    deliveryLongitude: order.deliveryLongitude,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    dispatchedAt: order.dispatchedAt ? order.dispatchedAt.toISOString() : null,
    deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      variationName: item.variationName,
      notes: item.notes,
      options: item.options.map((option) => ({ id: option.id, name: option.name })),
    })),
    delivery: order.delivery
      ? {
          status: order.delivery.status,
          arrivedAt: order.delivery.arrivedAt ? order.delivery.arrivedAt.toISOString() : null,
          pickedUpAt: order.delivery.pickedUpAt ? order.delivery.pickedUpAt.toISOString() : null,
          deliveredAt: order.delivery.deliveredAt
            ? order.delivery.deliveredAt.toISOString()
            : null,
          notes: order.delivery.notes,
          proofType: order.delivery.proofType,
        }
      : null,
  }));

  return (
    <DriverApp
      driver={{
        name: ctx.driver.name,
        vehicleType: ctx.driver.vehicleType,
        vehiclePlate: ctx.driver.vehiclePlate,
        status: ctx.driver.status,
      }}
      store={{
        name: organization?.name ?? 'Estabelecimento',
        logoUrl: organization?.logoUrl ?? null,
        brandColor: organization?.brandColor ?? '#F15A24',
        latitude: organization?.latitude ?? null,
        longitude: organization?.longitude ?? null,
      }}
      orders={serialized}
    />
  );
}
