'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDown, Home, MapPin, Package, Bell, ShieldCheck, Star } from 'lucide-react';

const ICONS = { '': Home, pedidos: Package, enderecos: MapPin, dados: ShieldCheck, notificacoes: Bell, pontos: Star } as const;

/**
 * Menu da área do cliente. No celular fica recolhido num botão com a seção
 * atual (abre a lista ao tocar); no computador vira uma coluna lateral fixa.
 */
export function CustomerMenu({ base, items, current }: { base: string; items: Array<[string, string]>; current: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [current]);
  const currentLabel = items.find(([path]) => path === current)?.[1] ?? 'Minha conta';
  return (
    <nav className="customer-menu" aria-label="Área do cliente" data-open={open || undefined}>
      <button type="button" className="customer-menu-toggle" aria-expanded={open} aria-controls="customer-menu-list" onClick={() => setOpen((v) => !v)}>
        <span><small>Minha conta</small>{currentLabel}</span>
        <ChevronDown size={18} aria-hidden />
      </button>
      <ul id="customer-menu-list" className="customer-menu-list">
        {items.map(([path, label]) => {
          const Icon = ICONS[path as keyof typeof ICONS] ?? Home;
          return (
            <li key={path}>
              <Link aria-current={current === path ? 'page' : undefined} href={`${base}/conta${path ? `/${path}` : ''}`} onClick={() => setOpen(false)}>
                <Icon size={17} aria-hidden />{label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
