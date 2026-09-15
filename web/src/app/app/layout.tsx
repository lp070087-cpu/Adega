import { redirect } from 'next/navigation';
import { requireOrg } from '@/lib/auth/guards';
import { AuthError } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { permissionsOf } from '@/lib/permissions';
import { ROLE_LABEL } from '@/data/business-copy';
import { getOrderCounters } from '@/lib/data/orders';
import { AppShell } from '@/components/layout/AppShell';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAYOUT DO PAINEL
 * -----------------------------------------------------------------------
 * Este é o portão de /app/*. Antes de qualquer página renderizar, o
 * servidor confirma: existe sessão? existe vínculo ativo com uma
 * organização? Só então a casca é montada com os dados daquele tenant.
 *
 * O organizationId vem daqui e desce por props — nenhuma página de /app
 * aceita organização vinda da URL.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireOrg();
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === 'UNAUTHENTICATED') redirect('/login');
      if (error.code === 'NO_ORGANIZATION') redirect('/onboarding');
      redirect('/login?acessoRemovido=1');
    }
    throw error;
  }

  const [organization, counters, notifications] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: {
        name: true,
        slug: true,
        brandColor: true,
        logoUrl: true,
        storeStatus: true,
      },
    }),
    getOrderCounters(ctx.organizationId),
    prisma.notification.findMany({
      where: {
        organizationId: ctx.organizationId,
        read: false,
        OR: [{ userId: null }, { userId: ctx.user.id }],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, title: true, message: true, href: true, createdAt: true },
    }),
  ]);

  // Organização apagada com sessão ainda válida.
  if (!organization) redirect('/login?acessoRemovido=1');

  return (
    <AppShell
      organizationName={organization.name}
      organizationSlug={organization.slug}
      brandColor={organization.brandColor}
      logoUrl={organization.logoUrl}
      role={ctx.role}
      roleLabel={ROLE_LABEL[ctx.role] ?? ctx.role}
      permissions={permissionsOf(ctx.role)}
      counters={{
        novos: counters.novos,
        emAndamento: counters.emAndamento,
        aguardandoEntregador: counters.aguardandoEntregador,
      }}
      storeStatus={organization.storeStatus}
      notifications={notifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        href: n.href,
        createdAt: n.createdAt.toISOString(),
      }))}
      user={{ name: ctx.user.name }}
    >
      {children}
    </AppShell>
  );
}
