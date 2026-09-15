'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { copyByType } from '@/data/business-copy';
import type { BusinessType } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CABEÇALHO DA LOJA PÚBLICA
 * -----------------------------------------------------------------------
 * O mesmo cabeçalho serve hamburgueria, mercado ou adega: os rótulos vêm
 * de BUSINESS_COPY e o nome vem do banco. Nenhum nome de loja está escrito
 * aqui — se estivesse, todas as lojas da plataforma teriam o mesmo.
 *
 * ── Sobre o menu mobile ──
 * Duas armadilhas conhecidas estão tratadas de propósito:
 *
 *   1. FECHAR AO TOCAR FORA. Sem isso o cliente abre o menu e fica preso
 *      nele, porque o menu cobre a tela e não há botão de fechar visível
 *      em alguns navegadores de celular.
 *
 *   2. NÃO TRAVAR O SCROLL. O painel antigo travava o body com
 *      `overflow: hidden` e, quando o menu fechava por outro caminho, o
 *      scroll ficava travado até recarregar a página. Aqui o menu é um
 *      painel que rola por conta própria e o body nunca é tocado.
 *
 * Os links são âncoras para as seções da MESMA página — não há navegação
 * que recarregue, então fechar o menu ao clicar é só uma questão de estado.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type StoreHeaderSection = {
  /** id do elemento na página, sem '#'. */
  id: string;
  label: string;
};

export function StoreHeader({
  storeName,
  slug,
  brandColor,
  logoUrl,
  businessType,
  storeStatus,
  sections,
  cartCount,
  onCartClick,
}: {
  storeName: string;
  slug: string;
  brandColor: string;
  logoUrl: string | null;
  businessType: BusinessType | null;
  storeStatus: string;
  sections: StoreHeaderSection[];
  cartCount: number;
  onCartClick: () => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  // Sombra só depois que a página rola: no topo o cabeçalho se funde com o
  // hero, e uma borda ali cortaria a composição sem motivo.
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Toque fora fecha. O listener só existe enquanto o menu está aberto —
  // deixá-lo ligado sempre custaria um evento em cada toque da página.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-store-menu]')) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  // Esc fecha — mesma saída rápida do resto do sistema.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const open = storeStatus === 'OPEN';
  const noun = copyByType(businessType).noun;

  return (
    <header
      data-store-menu
      className={cn(
        'sticky top-0 z-50 border-b transition-colors',
        scrolled ? 'border-ink-100 bg-white/95 backdrop-blur' : 'border-transparent bg-white',
      )}
      style={{ ['--brand' as string]: brandColor }}
    >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-4 sm:px-5">
        <a href="#inicio" className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={storeName}
              className="h-10 w-10 flex-shrink-0 rounded object-cover"
            />
          ) : (
            <span
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded text-[0.82rem] font-extrabold text-white"
              style={{ backgroundColor: brandColor }}
              aria-hidden="true"
            >
              {initials(storeName)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[0.94rem] font-extrabold leading-tight text-ink-900">
              {storeName}
            </span>
            <span className="hidden text-[0.7rem] font-semibold text-ink-400 sm:block">
              {open ? 'Aberta agora' : 'Fechada agora'} · {noun}
            </span>
          </span>
        </a>

        {/* ── Navegação (desktop) ── */}
        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Seções da loja">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-sm px-3 py-2 text-[0.82rem] font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <button
            type="button"
            onClick={onCartClick}
            className="relative flex h-10 items-center gap-2 rounded-full border-2 border-ink-200 px-3.5 text-[0.82rem] font-bold text-ink-700 transition-all hover:border-ink-300"
            aria-label={`Abrir sacola (${cartCount} ${cartCount === 1 ? 'item' : 'itens'})`}
          >
            <span aria-hidden="true">🛍️</span>
            <span className="hidden sm:inline">Sacola</span>
            {cartCount > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.68rem] font-extrabold text-white"
                style={{ backgroundColor: brandColor }}
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>

          <a
            href="#cardapio"
            className="hidden h-10 items-center rounded-full px-4 text-[0.82rem] font-extrabold text-white transition-transform hover:-translate-y-0.5 sm:flex"
            style={{ backgroundColor: brandColor }}
          >
            Peça agora
          </a>

          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            aria-controls="store-mobile-menu"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            className="flex h-10 w-10 flex-col items-center justify-center gap-[5px] rounded-sm border-2 border-ink-200 lg:hidden"
          >
            <span
              className={cn(
                'block h-[2px] w-5 bg-ink-700 transition-transform',
                menuOpen && 'translate-y-[7px] rotate-45',
              )}
            />
            <span className={cn('block h-[2px] w-5 bg-ink-700 transition-opacity', menuOpen && 'opacity-0')} />
            <span
              className={cn(
                'block h-[2px] w-5 bg-ink-700 transition-transform',
                menuOpen && '-translate-y-[7px] -rotate-45',
              )}
            />
          </button>
        </div>
      </div>

      {/*
        Menu mobile. É um painel no fluxo do documento (não fixed): assim
        ele empurra o conteúdo em vez de flutuar sobre ele, e não existe
        estado em que o cliente role a página por baixo de um menu aberto.
      */}
      {menuOpen && (
        <nav
          id="store-mobile-menu"
          className="border-t border-ink-100 bg-white px-4 pb-4 pt-2 lg:hidden"
          aria-label="Seções da loja"
        >
          <ul>
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  // Fecha ao clicar. Sem isto o menu fica aberto cobrindo
                  // justamente a seção para onde o cliente acabou de ir.
                  onClick={() => setMenuOpen(false)}
                  className="block border-b border-ink-100 py-3 text-[0.9rem] font-semibold text-ink-700"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>

          <a
            href="#cardapio"
            onClick={() => setMenuOpen(false)}
            className="mt-4 flex h-11 items-center justify-center rounded-full text-[0.88rem] font-extrabold text-white"
            style={{ backgroundColor: brandColor }}
          >
            Peça agora
          </a>

          <p className="mt-3 text-center text-[0.7rem] text-ink-400">
            {storeName} · /loja/{slug}
          </p>
        </nav>
      )}
    </header>
  );
}

/** Mesma regra de iniciais do resto do sistema. */
function initials(name: string): string {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'LO';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
