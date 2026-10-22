import { auth } from '@/lib/auth';
import { driverLogoutAction as logoutAction } from '@/app/actions/auth';
import { requireDriver, AuthError } from '@/lib/auth/guards';
import { getDriverOrders } from '@/lib/data/orders';
import { getOrganizationById } from '@/lib/data/organization';
import { DriverApp, type DriverOrder } from '@/components/driver/DriverApp';
import { DriverLoginForm } from '@/components/driver/DriverLoginForm';
import { InstallLink } from '@/components/pwa/InstallLink';
import { redirect } from 'next/navigation';
import { getPendingDriverInvitation } from '@/lib/auth/driver-invitation';
import { prisma } from '@/lib/db';
import { ownDriverApplications } from '@/lib/data/driver-applications';
import { applicationLabels,type ApplicationStatus } from '@/lib/driver-applications-rules';
import { selectDriverStoreAction } from '@/app/actions/driver-applications';

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
        <div className="w-full min-w-0 max-w-[460px] rounded-xl bg-white p-5 text-center shadow-xl sm:p-10">
          <span className="mx-auto mb-4 flex h-[46px] w-[46px] items-center justify-center rounded bg-brand-light text-[1.3rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pwa/driver-192.png" alt="" width={46} height={46} className="rounded-xl"/>
          </span>

          <h1 className="text-[1.35rem] font-extrabold text-ink-900">Del Flash Entregador</h1>
          <p className="mt-1.5 text-[0.84rem] text-ink-500">
            Entre com o e-mail da sua conta individual. Para solicitar cadastro, use o link fornecido pela loja. Acessos antigos por usuário continuam aceitos.
          </p>

          <DriverLoginForm />
          <InstallLink href="/entregador/instalar">Instalar app no celular</InstallLink>

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

  const pendingInvitation = await getPendingDriverInvitation(session.user.id);
  if (pendingInvitation) redirect(`/entregador/convite/${encodeURIComponent(pendingInvitation)}`);
  const memberships=session.user.role==='DRIVER'?await prisma.organizationUser.findMany({where:{userId:session.user.id,role:'DRIVER',active:true,organization:{drivers:{some:{userId:session.user.id,active:true}}}},select:{organizationId:true,organization:{select:{name:true}}}}):[];
  const applications=await ownDriverApplications(session.user.id);
  const storePreference=process.env.DRIVER_APPLICATIONS_ENABLED==='true'?(await (await import('next/headers')).cookies()).get('driver-store')?.value:session.user.organizationId;
  const selectedStore=memberships.some(m=>m.organizationId===storePreference)?storePreference:session.user.organizationId??memberships[0]?.organizationId;
  const storeSelector=memberships.length>1?<form action={selectDriverStoreAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-3"><label className="min-w-0 flex-1 text-sm">Loja de trabalho<select name="organizationId" className="mt-1 min-h-11 w-full rounded-lg border p-2" defaultValue={selectedStore??undefined}>{memberships.map(m=><option key={m.organizationId} value={m.organizationId}>{m.organization.name}</option>)}</select></label><button className="min-h-11 rounded-lg bg-brand px-4 text-white">Selecionar loja</button></form>:null;

  // Anotação explícita de propósito: sem ela o `ctx` fica como any
  // evolutivo e o TypeScript perde a garantia de que ele está atribuído
  // depois do try/catch (o catch só sai por redirect ou throw).
  let ctx: Awaited<ReturnType<typeof requireDriver>>;

  try {
    ctx = await requireDriver();
  } catch (error) {
    // Um vínculo DRIVER desativado não pode voltar a /app, que redireciona
    // para cá. Exibir recuperação local evita esse ciclo de navegação.
    if (error instanceof AuthError) {
      if(session.user.role==='DRIVER'&&applications.length&&!memberships.length&&error.code!=='UNAUTHENTICATED')return <main className="flex min-h-screen items-center justify-center bg-ink-50 p-4"><section className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">{applicationLabels[applications[0].status as ApplicationStatus]}</h1><p className="text-sm text-ink-500">O acesso às entregas depende da aprovação e ativação pela loja. Sua conta individual foi preservada.</p>{applications.map(a=><p key={a.id} className="rounded-lg bg-ink-50 p-3 text-sm">{a.organization.name}: <strong>{applicationLabels[a.status as ApplicationStatus]}</strong></p>)}<a href="/entregador" className="inline-flex min-h-11 items-center font-semibold text-brand">Atualizar situação</a><a href="/entregador/acesso?modo=reset" className="inline-flex min-h-11 items-center font-semibold text-brand">Esqueci minha senha</a><form action={logoutAction}><button className="min-h-11 rounded-lg bg-brand p-3 text-white">Sair e entrar com outra conta</button></form></section></main>;
      return (
        <main className="flex min-h-screen items-center justify-center bg-ink-50 p-4">
          <div role="alert" className="w-full max-w-[460px] rounded-xl bg-white p-6 text-center shadow-xl sm:p-10">
            <h1 className="text-xl font-extrabold text-ink-900">{session.user.role !== 'DRIVER' ? 'Entre com a conta do entregador' : 'Confira seu acesso de entregador'}</h1>
            {storeSelector}
            {applications.map(a=><p key={a.id} className="mt-3 rounded-lg bg-ink-50 p-3 text-sm">{a.organization.name}: {applicationLabels[a.status as ApplicationStatus]}. {a.status==='PENDING'?'Sua solicitação foi enviada e ainda não permite acesso às entregas.':''}</p>)}
            <p className="mt-3 text-sm text-ink-500">{session.user.role !== 'DRIVER'
              ? 'Este aplicativo está usando sua sessão do estabelecimento. O acesso do proprietário não cria um cadastro de entregador. Saia e entre com o e-mail individual cadastrado pela loja.'
              : `${error.message} Solicite à loja a conferência do vínculo e do estado ativo do cadastro. Se recebeu um convite, conclua o primeiro acesso pelo link da loja.`}</p>
            <a href="/entregador/acesso" className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand hover:underline">Primeiro acesso ou recuperação de senha</a>
            <form action={logoutAction} className="mt-6">
              <button type="submit" className="min-h-11 rounded-xl bg-brand px-5 py-3 font-semibold text-white">Sair e entrar com outra conta</button>
            </form>
            {session.user.role !== 'DRIVER' && (
              <a href="/app" className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand hover:underline">Abrir painel do estabelecimento</a>
            )}
          </div>
        </main>
      );
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

  return (<div>{storeSelector}
    {applications.some(a=>a.status!=='APPROVED')&&<details className="m-3 rounded-lg bg-white p-3 text-sm"><summary className="min-h-11 cursor-pointer font-semibold">Suas solicitações em outras lojas</summary>{applications.filter(a=>a.status!=='APPROVED').map(a=><p key={a.id} className="py-2">{a.organization.name}: <strong>{applicationLabels[a.status as ApplicationStatus]}</strong></p>)}</details>}
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
    /></div>
  );
}
