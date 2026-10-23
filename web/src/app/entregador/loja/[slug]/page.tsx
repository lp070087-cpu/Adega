import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { driverLogoutAction } from '@/app/actions/auth';
import { driverMailReady } from '@/lib/auth/driver-access';
import { driverStoreBySlug } from '@/lib/data/driver-link';
import { DriverAuthCard } from '@/components/driver/DriverAuthCard';
import { DriverEntry } from '@/components/driver/DriverEntry';
import { OpenDriverApp } from '@/components/driver/OpenDriverApp';
import { StaffSessionNotice } from '@/components/driver/StaffSessionNotice';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Área do Entregador', robots: { index: false, follow: false }, referrer: 'same-origin' };

/**
 * Link único e permanente da loja para os entregadores. A loja já vem
 * identificada; o entregador entra com o e-mail que a loja cadastrou.
 */
export default async function DriverStoreLink({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await driverStoreBySlug(slug);
  if (!store) {
    return (
      <DriverAuthCard>
        <p className="mt-3 text-sm text-ink-500">Este link de entregadores não existe ou foi digitado incompleto. Peça o link novamente à loja.</p>
        <a href="/entregador/" className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand">Ir para o aplicativo</a>
      </DriverAuthCard>
    );
  }

  const session = await auth();
  if (session?.user?.id) {
    if (session.user.role === 'DRIVER') {
      const linked = await prisma.driver.findFirst({
        where: { organizationId: store.id, userId: session.user.id, active: true, user: { organizations: { some: { organizationId: store.id, role: 'DRIVER', active: true } } } },
        select: { id: true },
      });
      if (linked) {
        return (
          <DriverAuthCard store={store}>
            <p className="mt-3 text-sm text-ink-500">Abrindo suas entregas nesta loja…</p>
            <OpenDriverApp href={`/entregador/loja/${store.slug}/abrir`} />
          </DriverAuthCard>
        );
      }
    }
    return (
      <DriverAuthCard store={store}>
        {session.user.role === 'DRIVER' ? (
          <>
            <p role="alert" className="mt-4 text-sm text-ink-600">Sua conta ainda não está cadastrada como entregador desta loja, ou o acesso aqui está suspenso. Peça à loja para adicionar o seu e-mail na área de entregadores.</p>
            <div className="mt-5 grid gap-2">
              <a href="/entregador/" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-200 font-semibold text-ink-800">Abrir minhas outras lojas</a>
              <form action={driverLogoutAction}><button type="submit" className="min-h-11 w-full rounded-lg bg-brand px-5 font-semibold text-white">Sair e entrar com outra conta</button></form>
            </div>
          </>
        ) : (
          <StaffSessionNotice />
        )}
      </DriverAuthCard>
    );
  }

  return (
    <DriverAuthCard store={store}>
      <p className="mt-1.5 text-[0.84rem] text-ink-500">Entre com o e-mail que a loja cadastrou para você. É o primeiro acesso? Toque em “Primeiro acesso” para criar sua senha.</p>
      <DriverEntry store={store.slug} mailReady={driverMailReady()} />
    </DriverAuthCard>
  );
}
