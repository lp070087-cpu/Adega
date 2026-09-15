'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { initialsFromName } from '@/data/business-copy';
import type { Permission } from '@/lib/permissions';

/**
 * Sidebar do painel — mesmas seções, ícones e badges de plataforma.html.
 *
 * Os itens são filtrados por PERMISSÃO para não mostrar o que a pessoa
 * não pode abrir, mas isso é conveniência de interface: cada página
 * confere a permissão de novo no servidor. Esconder link não é segurança.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
  badgeKey?: 'novos' | 'emAndamento' | 'aguardandoEntregador';
};

export type NavSection = { title?: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: '/app/dashboard', label: 'Visão Geral', icon: '📊', permission: 'VIEW_DASHBOARD' },
      {
        href: '/app/pedidos',
        label: 'Central de Pedidos',
        icon: '🧭',
        permission: 'MANAGE_ORDERS',
        badgeKey: 'novos',
      },
      { href: '/app/minha-loja', label: 'Minha Loja', icon: '🏪', permission: 'MANAGE_SETTINGS' },
      { href: '/app/catalogo', label: 'Catálogo', icon: '🏷️', permission: 'MANAGE_PRODUCTS' },
      { href: '/app/combos', label: 'Combos', icon: '🎁', permission: 'MANAGE_PRODUCTS' },
      { href: '/app/banners', label: 'Banners', icon: '🖼️', permission: 'MANAGE_SETTINGS' },
      { href: '/app/clientes', label: 'Clientes', icon: '👥', permission: 'VIEW_CUSTOMERS' },
      { href: '/app/entregadores', label: 'Entregadores', icon: '🛵', permission: 'MANAGE_DRIVERS' },
      { href: '/app/expedicao', label: 'Mapa / Expedição', icon: '🗺️', permission: 'MANAGE_DRIVERS' },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { href: '/app/caixa', label: 'Caixa', icon: '🧾', permission: 'MANAGE_CASH' },
      { href: '/app/estoque', label: 'Estoque', icon: '📦', permission: 'MANAGE_STOCK' },
      { href: '/app/vendas', label: 'Vendas', icon: '💰', permission: 'VIEW_REPORTS' },
      { href: '/app/relatorios', label: 'Relatórios', icon: '📈', permission: 'VIEW_REPORTS' },
    ],
  },
  {
    title: 'Integrações',
    items: [
      {
        href: '/app/integracoes',
        label: 'Integrações',
        icon: '🔌',
        permission: 'MANAGE_INTEGRATIONS',
      },
    ],
  },
  {
    title: 'Configurações',
    items: [
      { href: '/app/equipe', label: 'Equipe / Funcionários', icon: '👤', permission: 'MANAGE_TEAM' },
      { href: '/app/configuracoes', label: 'Configurações', icon: '⚙️', permission: 'MANAGE_SETTINGS' },
    ],
  },
];

export type SidebarProps = {
  organizationName: string;
  organizationSlug: string;
  brandColor: string;
  logoUrl: string | null;
  roleLabel: string;
  permissions: Permission[];
  counters?: { novos?: number; emAndamento?: number; aguardandoEntregador?: number };
  storeStatus: 'OPEN' | 'PAUSED' | 'CLOSED';
  /** No mobile a sidebar é uma gaveta: este estado vem do AppShell. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function AppSidebar({
  organizationName,
  organizationSlug,
  brandColor,
  logoUrl,
  roleLabel,
  permissions,
  counters,
  storeStatus,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();

  const allowed = (item: NavItem) => !item.permission || permissions.includes(item.permission);

  const storeLabel =
    storeStatus === 'OPEN' ? 'Loja aberta' : storeStatus === 'PAUSED' ? 'Loja pausada' : 'Loja fechada';

  return (
    <>
      {/* Fundo escurecido no mobile — clicar fora fecha. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[490] bg-black/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[500] flex w-[260px] flex-col border-r border-ink-200 bg-white transition-transform duration-300 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 border-b border-ink-100 p-[16px_18px]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={organizationName}
              className="h-10 w-10 flex-shrink-0 rounded-sm object-cover"
            />
          ) : (
            <span className="brand-mark h-10 w-10 text-[0.72rem]" style={{ background: brandColor }}>
              {initialsFromName(organizationName)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.88rem] font-extrabold leading-tight text-ink-900">
              {organizationName}
            </p>
            <p className="truncate text-[0.68rem] text-ink-400">/{organizationSlug}</p>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fechar menu"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm text-ink-400 hover:bg-ink-100 lg:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-[10px_8px]">
          {NAV_SECTIONS.map((section, index) => {
            const visible = section.items.filter(allowed);
            if (visible.length === 0) return null;

            return (
              <div key={section.title ?? `section-${index}`}>
                {section.title && (
                  <p className="px-3.5 pb-1.5 pt-3.5 text-[0.64rem] font-bold uppercase tracking-[0.06em] text-ink-400">
                    {section.title}
                  </p>
                )}

                {visible.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const badge = item.badgeKey ? counters?.[item.badgeKey] : undefined;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      className={cn(
                        'relative flex items-center gap-3 rounded-sm px-3.5 py-[11px] text-[0.88rem] font-medium transition-all duration-200',
                        active
                          ? 'bg-brand-light font-semibold text-brand'
                          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                      )}
                    >
                      <span className="w-6 flex-shrink-0 text-center text-[1.15rem]" aria-hidden>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {badge !== undefined && badge > 0 && (
                        <span className="ml-auto min-w-[20px] rounded-full bg-brand px-2 py-px text-center text-[0.66rem] font-bold text-white">
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-ink-100 p-2.5">
          <div className="flex items-center gap-2.5 rounded border border-ink-200 bg-ink-50 p-[10px_12px]">
            <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-brand text-[0.8rem] font-bold text-white">
              {initialsFromName(roleLabel)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.76rem] font-bold text-ink-800">{roleLabel}</p>
              <p className="truncate text-[0.68rem] text-ink-500">{storeLabel}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
