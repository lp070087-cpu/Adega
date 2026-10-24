import { storeOpeningMode, storeTimeZone } from '@/lib/schedule';
import { redirect } from 'next/navigation';
import { requireOrg } from '@/lib/auth/guards';
import { AuthError } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { permissionsOf } from '@/lib/permissions';
import { ROLE_LABEL } from '@/data/business-copy';
import { getOrderCounters } from '@/lib/data/orders';
import { AppShell } from '@/components/layout/AppShell';
import { getCommercialAccess } from '@/lib/platform/access';
import type { Metadata } from 'next';
import { InstallApp } from '@/components/pwa/InstallApp';
import { requirePlatformOperator } from '@/lib/platform/auth';
import { normalizeSchedule } from '@/lib/schedule';

export const metadata: Metadata = {
  manifest: '/pwa/panel.webmanifest',
  applicationName: 'Del Flash',
  icons: { apple: '/pwa/panel-192.png', icon: '/pwa/panel-192.png' },
  appleWebApp: { capable: true, title: 'Del Flash', statusBarStyle: 'default' },
};

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

  if (ctx.role === 'DRIVER') redirect('/entregador');
  const commercial = await getCommercialAccess(ctx.organizationId);
  const centralAccess = await requirePlatformOperator().then(() => true).catch(() => false);

  const [organization, counters, notifications, atendimento] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: {
        name: true,
        slug: true,
        brandColor: true,
        logoUrl: true,
        storeStatus: true,
        settings: true,
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
    waitingConversations(ctx.organizationId),
  ]);

  // Organização apagada com sessão ainda válida.
  if (!organization) redirect('/login?acessoRemovido=1');

  return (
    <AppShell
      centralAccess={centralAccess}
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
        atendimento,
      }}
      openingTimeZone={storeTimeZone(organization.settings)}
      openingMode={storeOpeningMode(organization.settings, organization.storeStatus)}
      storeStatus={organization.storeStatus}
      openingSchedule={normalizeSchedule((organization.settings as Record<string, unknown> | null)?.openingHours)}
      statusObservedAt={new Date().toISOString()}
      notifications={notifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        href: n.href,
        createdAt: n.createdAt.toISOString(),
      }))}
      user={{ name: ctx.user.name }}
    >
      {commercial.message && <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{commercial.message}</div>}
      {children}
      <div className="mt-8 border-t border-ink-100 pt-2 [&_section]:my-0 [&_section]:bg-transparent [&_section]:p-0"><InstallApp name="Del Flash" worker="/pwa/panel-sw.js" scope="/app/" /></div>
    </AppShell>
  );
}

/** Conversas do WhatsApp cuja última mensagem é do cliente (aguardando resposta). */
async function waitingConversations(organizationId: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM (
        SELECT DISTINCT ON (m."threadId") m."direction" FROM "AssistantMessage" m
        JOIN "AssistantThread" t ON t."id" = m."threadId" AND t."organizationId" = m."organizationId"
        WHERE m."organizationId" = ${organizationId} AND t."status" <> 'CLOSED'
        ORDER BY m."threadId", m."createdAt" DESC
      ) last WHERE last."direction" = 'IN'`;
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}
