'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  BadgeCheck, ChevronRight, Clock, CreditCard, LayoutGrid, MapPin, Menu,
  MessageCircle, Package, Receipt, Store, Truck, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BASE = '/app/configuracoes';
const STORE = `${BASE}/minha-loja`;
const GROUPS = [
  { label: 'Configurações', items: [
    { href: BASE, label: 'Visão geral', icon: LayoutGrid },
    { href: STORE, tab: 'identidade', label: 'Identidade da loja', icon: Store },
    { href: STORE, tab: 'endereco', label: 'Endereço', icon: MapPin },
    { href: STORE, tab: 'horarios', label: 'Horários', icon: Clock },
    { href: STORE, tab: 'entrega', label: 'Entregas e frete', icon: Truck },
  ] },
  { label: 'Vendas e atendimento', items: [
    { href: `${BASE}/pagamentos`, label: 'Pagamentos', icon: CreditCard },
    { href: `${BASE}/fiscal`, label: 'Documentos fiscais', icon: Receipt },
    { href: `${BASE}/whatsapp`, label: 'WhatsApp e IA', icon: MessageCircle },
  ] },
  { label: 'Gestão da loja', items: [
    { href: '/app/equipe', label: 'Equipe', icon: Users },
    { href: '/app/assinatura', label: 'Plano e assinatura', icon: BadgeCheck },
    { href: '/app/estoque', label: 'Estoque', icon: Package },
  ] },
];

export function SettingsNav() {
  const pathname = usePathname();
  const tab = useSearchParams().get('aba');
  const drawer = useRef<HTMLDialogElement>(null);
  const selectedTab = tab === 'endereco' || tab === 'horarios' || tab === 'entrega' ? tab : 'identidade';
  const current = GROUPS.flatMap((group) => group.items).find(
    (item) => pathname === item.href && (item.href !== STORE || item.tab === selectedTab),
  );

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (desktop.matches) drawer.current?.close();
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  function renderLinks(closeOnSelect = false) {
    return (
      <nav aria-label="Seções das configurações" className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-xs font-semibold text-ink-500">{group.label}</p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const { icon: Icon, label } = item;
                const href = item.tab && item.tab !== 'identidade' ? `${item.href}?aba=${item.tab}` : item.href;
                const active = current === item;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      onClick={closeOnSelect ? () => drawer.current?.close() : undefined}
                      className={cn(
                        'flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                        active ? 'bg-brand-light text-brand-dark' : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900',
                      )}
                    >
                      <Icon size={17} className="shrink-0" aria-hidden />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <div data-testid="settings-nav" className="lg:sticky lg:top-20">
      <aside className="hidden max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-ink-100 bg-white p-3 lg:block">
        {renderLinks()}
      </aside>

      <button
        type="button"
        aria-haspopup="dialog"
        aria-controls="settings-drawer"
        onClick={() => drawer.current?.showModal()}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 text-left text-sm font-semibold text-ink-700 lg:hidden"
      >
        <Menu size={18} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Menu de configurações</span>
        <span className="hidden text-xs text-ink-500 sm:inline">{current?.label}</span>
        <ChevronRight size={16} className="shrink-0" aria-hidden />
      </button>

      <dialog
        id="settings-drawer"
        ref={drawer}
        aria-labelledby="settings-drawer-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) drawer.current?.close();
        }}
        className="fixed inset-y-0 left-0 right-auto m-0 h-[100dvh] max-h-none w-72 max-w-[calc(100vw-2rem)] overflow-hidden border-0 bg-white p-0 text-ink-900 shadow-xl backdrop:bg-black/45"
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ink-100 p-3">
            <h2 id="settings-drawer-title" className="px-2 text-sm font-bold">Configurações</h2>
            <button
              type="button"
              aria-label="Fechar menu de configurações"
              onClick={() => drawer.current?.close()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50"
            >
              <X size={19} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{renderLinks(true)}</div>
        </div>
      </dialog>
    </div>
  );
}
