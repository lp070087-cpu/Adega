'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar, NAV_SECTIONS } from './AppSidebar';
import { AppHeader } from './AppHeader';
import type { Permission } from '@/lib/permissions';
import { storeOpenState, type WeekdaySchedule } from '@/lib/schedule';

/**
 * Casca do painel: sidebar + header + conteúdo.
 *
 * A sidebar é fixa no desktop e gaveta no mobile. O título do header sai
 * da própria lista de navegação — assim não existe um segundo lugar
 * onde o nome da página pode divergir do nome do menu.
 */

export type AppShellProps = {
  organizationName: string;
  organizationSlug: string;
  brandColor: string;
  logoUrl: string | null;
  role: string;
  roleLabel: string;
  permissions: Permission[];
  counters: { novos: number; emAndamento: number; aguardandoEntregador: number };
  storeStatus: 'OPEN' | 'PAUSED' | 'CLOSED';
  openingSchedule?: WeekdaySchedule[];
  statusObservedAt?: string;
  notifications: Array<{
    id: string;
    title: string;
    message: string | null;
    href: string | null;
    createdAt: string;
  }>;
  user: { name: string };
  children: React.ReactNode;
  centralAccess?: boolean;
};

export function AppShell({
  organizationName,
  organizationSlug,
  brandColor,
  logoUrl,
  role,
  roleLabel,
  permissions,
  counters,
  storeStatus,
  openingSchedule = [],
  statusObservedAt,
  notifications,
  user,
  children,
  centralAccess = false,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState<Date | undefined>(() => statusObservedAt ? new Date(statusObservedAt) : undefined);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const effectiveStoreState = storeOpenState(storeStatus, openingSchedule, now);

  // Trocar de página fecha a gaveta: no mobile ela cobriria o conteúdo.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Título a partir da rota — mesma fonte da sidebar.
  const current = NAV_SECTIONS.flatMap((s) => s.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  const canChangeStatus = permissions.includes('MANAGE_ORDERS');

  return (
    <div className="panel-shell flex min-h-screen bg-ink-50">
      <AppSidebar
        centralAccess={centralAccess}
        organizationName={organizationName}
        organizationSlug={organizationSlug}
        brandColor={brandColor}
        logoUrl={logoUrl}
        roleLabel={roleLabel}
        permissions={permissions}
        counters={counters}
        storeStatus={storeStatus}
        effectiveStoreState={effectiveStoreState}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title={current?.label ?? 'Painel'}
          subtitle={organizationName}
          storeStatus={storeStatus}
          effectiveStoreState={effectiveStoreState}
          canChangeStatus={canChangeStatus}
          userName={user.name}
          roleLabel={roleLabel}
          notifications={notifications}
          onOpenMenu={() => setMobileOpen(true)}
        />

        <main className="panel-content min-w-0 flex-1 p-4 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
