'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CreditCard, LayoutGrid, MessageCircle, Receipt, Store, Truck, Users, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/app/configuracoes', label: 'Visão geral', icon: LayoutGrid, match: (p: string) => p === '/app/configuracoes' },
  { href: '/app/configuracoes/minha-loja', label: 'Loja', icon: Store, match: (p: string, aba: string | null) => p === '/app/configuracoes/minha-loja' && aba !== 'entrega' },
  { href: '/app/configuracoes/minha-loja?aba=entrega', label: 'Entregas e frete', icon: Truck, match: (p: string, aba: string | null) => p === '/app/configuracoes/minha-loja' && aba === 'entrega' },
  { href: '/app/configuracoes/pagamentos', label: 'Pagamentos', icon: CreditCard, match: (p: string) => p.startsWith('/app/configuracoes/pagamentos') },
  { href: '/app/configuracoes/fiscal', label: 'Fiscal', icon: Receipt, match: (p: string) => p.startsWith('/app/configuracoes/fiscal') },
  { href: '/app/configuracoes/whatsapp', label: 'WhatsApp e IA', icon: MessageCircle, match: (p: string) => p.startsWith('/app/configuracoes/whatsapp') },
  { href: '/app/equipe', label: 'Equipe', icon: Users, match: () => false },
  { href: '/app/assinatura', label: 'Plano', icon: BadgeCheck, match: () => false },
];

/** Menu único das configurações: coluna no computador, faixa rolável no celular. */
export function SettingsNav() {
  const pathname = usePathname();
  const aba = useSearchParams().get('aba');
  return (
    <nav aria-label="Seções das configurações" className="settings-nav -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" data-testid="settings-nav">
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname, aba);
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={cn('flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3 text-[0.84rem] font-semibold transition-colors', active ? 'bg-brand text-white shadow-sm' : 'text-ink-600 hover:bg-white hover:text-ink-900')}>
            <Icon size={17} aria-hidden />{label}
          </Link>
        );
      })}
    </nav>
  );
}
