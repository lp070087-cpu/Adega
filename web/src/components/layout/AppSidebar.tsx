'use client';

import Link from 'next/link';
import { X, ExternalLink, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { initialsFromName } from '@/data/business-copy';
import type { Permission } from '@/lib/permissions';
import { BrandMark } from '@/components/ui/BrandMark';
import { STORE_OPEN_STATE_LABEL, type StoreOpenState } from '@/lib/schedule';

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
  badgeKey?: 'novos' | 'emAndamento' | 'aguardandoEntregador' | 'atendimento';
};

export type NavSection = { title?: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  { title: 'Operação', items: [
    { href: '/app/dashboard', label: 'Visão geral', icon: 'dashboard', permission: 'VIEW_DASHBOARD' },
    { href: '/app/pedidos', label: 'Pedidos', icon: 'orders', permission: 'MANAGE_ORDERS', badgeKey: 'novos' },
    { href: '/app/atendimento', label: 'Atendimento', icon: 'chat', permission: 'MANAGE_SETTINGS', badgeKey: 'atendimento' },
    { href: '/app/expedicao', label: 'Expedição', icon: 'dispatch', permission: 'MANAGE_DRIVERS' },
    { href: '/app/entregadores', label: 'Entregadores', icon: 'drivers', permission: 'MANAGE_DRIVERS' },
  ] },
  { title: 'Catálogo', items: [
    { href: '/app/catalogo', label: 'Produtos', icon: 'catalog', permission: 'MANAGE_PRODUCTS' },
    { href: '/app/combos', label: 'Combos', icon: 'combos', permission: 'MANAGE_PRODUCTS' },
    { href: '/app/estoque', label: 'Estoque', icon: 'stock', permission: 'MANAGE_STOCK' },
  ] },
  { title: 'Financeiro', items: [
    { href: '/app/caixa', label: 'Caixa', icon: 'cash', permission: 'MANAGE_CASH' },
    { href: '/app/vendas', label: 'Vendas', icon: 'sales', permission: 'VIEW_REPORTS' },
    { href: '/app/relatorios', label: 'Relatórios', icon: 'reports', permission: 'VIEW_REPORTS' },
  ] },
  { title: 'Clientes e marketing', items: [
    { href: '/app/clientes', label: 'Clientes', icon: 'users', permission: 'VIEW_CUSTOMERS' },
    { href: '/app/campanhas', label: 'Campanhas', icon: 'campaign', permission: 'MANAGE_SETTINGS' },
    { href: '/app/fidelidade', label: 'Programa de pontos', icon: 'points', permission: 'MANAGE_SETTINGS' },
    { href: '/app/banners', label: 'Banners da loja', icon: 'banners', permission: 'MANAGE_SETTINGS' },
  ] },
  { title: 'Sistema', items: [
    { href: '/app/configuracoes', label: 'Configurações', icon: 'settings', permission: 'MANAGE_SETTINGS' },
  ] },
];
export type SidebarProps = {
  organizationName: string;
  organizationSlug: string;
  brandColor: string;
  logoUrl: string | null;
  roleLabel: string;
  permissions: Permission[];
  counters?: { novos?: number; emAndamento?: number; aguardandoEntregador?: number; atendimento?: number };
  storeStatus: 'OPEN' | 'PAUSED' | 'CLOSED';
  effectiveStoreState?: StoreOpenState;
  /** No mobile a sidebar é uma gaveta: este estado vem do AppShell. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  centralAccess?: boolean;
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
  effectiveStoreState,
  mobileOpen,
  onCloseMobile,
  centralAccess = false,
}: SidebarProps) {
  const pathname = usePathname();
  // Grupos recolhíveis: o da página atual sempre aberto; o resto lembra a escolha.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setCollapsed(JSON.parse(window.localStorage.getItem('df-nav-collapsed') ?? '{}')); } catch { /* sem preferências */ } }, []);
  const toggleGroup = (title: string) => setCollapsed((current) => {
    const next = { ...current, [title]: !current[title] };
    try { window.localStorage.setItem('df-nav-collapsed', JSON.stringify(next)); } catch { /* modo privativo */ }
    return next;
  });

  const allowed = (item: NavItem) => !item.permission || permissions.includes(item.permission);

  const storeLabel = effectiveStoreState === 'CLOSED_BY_SCHEDULE'
    ? 'Fechada pelo horário'
    : STORE_OPEN_STATE_LABEL[effectiveStoreState ?? storeStatus];

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
          'panel-sidebar fixed inset-y-0 left-0 z-[500] flex w-[260px] flex-col transition-transform duration-300 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="px-5 pb-2 pt-5"><BrandMark tone="light"/></div>
        <div className="mx-3 mt-2 flex items-center gap-3 rounded-xl bg-white/[0.06] p-3">
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
            <p className="truncate text-[0.86rem] font-bold leading-tight text-white">
              {organizationName}
            </p>
            <p className="truncate text-[0.68rem] text-white/50">/{organizationSlug}</p>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fechar menu"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="Navegação do estabelecimento" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[10px_8px]">
          {NAV_SECTIONS.map((section, index) => {
            const visible = section.items.filter(allowed);
            if (visible.length === 0) return null;
            const hasActive = visible.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
            const isCollapsed = Boolean(section.title && collapsed[section.title] && !hasActive);

            return (
              <div key={section.title ?? `section-${index}`}>
                {section.title && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(section.title!)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center justify-between px-3.5 pb-1.5 pt-4 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
                  >
                    {section.title}
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isCollapsed && '-rotate-90')} aria-hidden />
                  </button>
                )}

                {!isCollapsed && visible.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const badge = item.badgeKey ? counters?.[item.badgeKey] : undefined;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={onCloseMobile}
                      className={cn(
                        'relative flex items-center gap-3 rounded-lg px-3.5 py-[11px] text-[0.88rem] font-medium transition-colors duration-200',
                        active
                          ? 'bg-brand font-semibold text-white shadow-[0_6px_16px_-6px_rgba(8,126,164,.7)]'
                          : 'text-white/70 hover:bg-white/[0.07] hover:text-white',
                      )}
                    >
                      <span className="w-6 flex-shrink-0 text-center text-[1.15rem]" aria-hidden>
                        <Icon name={item.icon} className="h-[19px] w-[19px]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {badge !== undefined && badge > 0 && (
                        <span className={cn('ml-auto min-w-[20px] rounded-full px-2 py-px text-center text-[0.66rem] font-bold', active ? 'bg-white text-brand' : 'bg-brand text-white')}>
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
          {centralAccess && <Link href="/admin" onClick={onCloseMobile} className="mt-1 flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-[#BFE6FF] hover:bg-white/[0.07]"><Icon name="settings"/>Admin Central</Link>}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">

          <Link href={`/loja/${organizationSlug}`} target="_blank" rel="noopener noreferrer" className="mb-2 flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium text-white/70 hover:bg-white/[0.07] hover:text-white">Abrir loja pública <ExternalLink className="h-3.5 w-3.5" /></Link>
          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] p-[10px_12px]">
            <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-brand text-[0.8rem] font-bold text-white">
              {initialsFromName(roleLabel)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.76rem] font-bold text-white">{roleLabel}</p>
              <p className="truncate text-[0.68rem] text-white/55">{storeLabel}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
