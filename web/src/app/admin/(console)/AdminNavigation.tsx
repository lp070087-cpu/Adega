'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft, Building2, CreditCard, Layers3, LayoutDashboard, LifeBuoy, Menu,
  Plug, ScrollText, Settings, Users, Wallet, X, type LucideIcon,
} from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  '': LayoutDashboard,
  estabelecimentos: Building2,
  planos: Layers3,
  assinaturas: CreditCard,
  financeiro: Wallet,
  recebimentos: CreditCard,
  integracoes: Plug,
  servicos: Settings,
  usuarios: Users,
  suporte: LifeBuoy,
  configuracoes: Settings,
  auditoria: ScrollText,
};

export function AdminNavigation({ items, role }: {
  items: ReadonlyArray<readonly [slug: string, label: string]>;
  role: string;
}) {
  const pathname = usePathname();
  const section = pathname.split('/')[2] ?? '';
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <aside className="platform-sidebar" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        setOpenPath(null);
        toggle.current?.focus();
      }
    }}>
      <div className="platform-sidebar-header">
        <Link href="/admin" className="platform-brand" onClick={() => setOpenPath(null)}>
          DEL FLASH<span>PLATAFORMA</span>
        </Link>
        <button
          ref={toggle}
          type="button"
          className="platform-menu-toggle"
          aria-expanded={open}
          aria-controls="platform-menu"
          onClick={() => setOpenPath(open ? null : pathname)}
        >
          {open ? <X aria-hidden size={19} /> : <Menu aria-hidden size={19} />}
          Menu
        </button>
      </div>
      <div id="platform-menu" className="platform-menu" data-open={open}>
        <div className="platform-context">Administração central</div>
        <nav aria-label="Administração central">
          {items.map(([slug, label]) => {
            const Icon = icons[slug];
            const current = slug === section;
            const href = slug ? `/admin/${slug}` : '/admin';
            return (
              <Link key={slug} href={href} aria-current={current ? 'page' : undefined} onClick={() => setOpenPath(null)}>
                <Icon size={18} aria-hidden />{label}
              </Link>
            );
          })}
        </nav>
        <div className="platform-account">
          <span>Operador · {role}</span>
          <Link href="/app"><ArrowLeft size={15} aria-hidden />Painel do estabelecimento</Link>
        </div>
      </div>
    </aside>
  );
}
