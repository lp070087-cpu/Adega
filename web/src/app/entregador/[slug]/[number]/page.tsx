import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveRegistrationLink, registrationPath } from '@/lib/data/driver-applications';
import { driverMailReady } from '@/lib/auth/driver-access';
import { applicationLabels, type ApplicationStatus } from '@/lib/driver-applications-rules';
import { DriverStoreAccess, DriverJoinStore } from '@/components/driver/DriverApplicationForm';
import { driverLogoutAction } from '@/app/actions/auth';
import { leaveDriverRegistrationAction } from '@/app/actions/driver-applications';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Área do entregador', robots: { index: false, follow: false } };

/**
 * The single, permanent link of a store's driver area. One URL for every
 * situation: sign in, create an account, ask to work for the store, follow
 * the request and, once approved, go straight to the deliveries.
 */
export default async function DriverStoreLinkPage({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const link = await resolveRegistrationLink(number);
  if (!link) notFound();
  const path = registrationPath(link);
  if (slug !== link.slug || number !== String(link.number).padStart(4, '0')) redirect(path);
  const store = link.organization;
  const session = await auth();
  const user = session?.user;
  const staff = Boolean(user?.role && user.role !== 'DRIVER');

  let status: ApplicationStatus | null = null;
  if (user?.id && !staff) {
    const [application, driver] = await Promise.all([
      prisma.driverApplication.findUnique({ where: { organizationId_userId: { organizationId: store.id, userId: user.id } }, select: { status: true } }),
      prisma.driver.findFirst({ where: { organizationId: store.id, userId: user.id, active: true, user: { organizations: { some: { organizationId: store.id, role: 'DRIVER', active: true } } } }, select: { id: true } }),
    ]);
    // Approved (or a legacy driver already linked without a request): straight to the deliveries.
    if (driver && (!application || application.status === 'APPROVED')) redirect(`${path}/abrir`);
    status = (application?.status as ApplicationStatus | undefined) ?? null;
  }

  return (
    <main className="driver-link-shell">
      <section className="driver-link-card">
        <header className="driver-link-store">
          {store.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={store.logoUrl} alt="" width={56} height={56} className="driver-link-logo" />
            : <span className="driver-link-logo driver-link-initial" style={{ background: store.brandColor ?? '#087EA4' }} aria-hidden>{store.name.charAt(0).toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="driver-link-kicker">Del Flash Entregador</p>
            <h1 className="driver-link-title">{store.name}</h1>
          </div>
        </header>

        {staff ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">Você está conectado com a conta do estabelecimento. Para trabalhar como entregador, use sua conta individual de entregador.</p>
            <form action={leaveDriverRegistrationAction}><input type="hidden" name="storeNumber" value={String(link.number)} /><button className="driver-link-primary">Sair e entrar como entregador</button></form>
          </div>
        ) : !user?.id ? (
          <DriverStoreAccess number={String(link.number)} storeName={store.name} mailReady={driverMailReady()} />
        ) : status === 'PENDING' ? (
          <StatusCard tone="info" title="Solicitação enviada" text={`Sua solicitação para entregar pela ${store.name} está aguardando a aprovação da loja. Você poderá acessar as entregas assim que ela for aprovada.`} path={path} />
        ) : status === 'REJECTED' ? (
          <StatusCard tone="danger" title={applicationLabels.REJECTED} text={`A ${store.name} não aprovou sua solicitação. Se acredita que houve engano, fale com a loja.`} path={path} />
        ) : status === 'SUSPENDED' || status === 'REVOKED' ? (
          <StatusCard tone="danger" title={applicationLabels[status]} text={`Seu acesso às entregas da ${store.name} está ${status === 'SUSPENDED' ? 'suspenso' : 'revogado'}. Fale com a loja para mais informações.`} path={path} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">Você está conectado como <strong>{user.name}</strong>. Solicite o vínculo para entregar pela {store.name}; a loja precisa aprovar antes de você receber entregas.</p>
            <DriverJoinStore number={String(link.number)} />
            <Link href="/entregador" className="driver-link-secondary">Ir para minhas entregas</Link>
            <form action={driverLogoutAction}><button className="driver-link-ghost">Sair e usar outra conta</button></form>
          </div>
        )}
      </section>
      <p className="driver-link-foot">Este é o link permanente da área de entregadores da {store.name}.</p>
    </main>
  );
}

function StatusCard({ tone, title, text, path }: { tone: 'info' | 'danger'; title: string; text: string; path: string }) {
  return (
    <div className="space-y-4">
      <div className="driver-link-status" data-tone={tone} role="status">
        <p className="font-bold">{title}</p>
        <p className="mt-1 text-sm">{text}</p>
      </div>
      <a href={path} className="driver-link-primary">Atualizar situação</a>
      <form action={driverLogoutAction}><button className="driver-link-ghost">Sair e usar outra conta</button></form>
    </div>
  );
}
