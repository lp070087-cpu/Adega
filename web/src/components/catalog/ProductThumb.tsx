'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CATALOG_BASE_PATH, CATALOG_EXTENSIONS } from '@/lib/catalog-images';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MINIATURA DE PRODUTO
 * -----------------------------------------------------------------------
 * Uma <img> comum não resolve o problema real do acervo: o arquivo pode
 * existir como .webp, .jpg ou .png, e o banco não sabe qual. Em vez de
 * fazer uma consulta ao servidor para descobrir, o componente TENTA os
 * caminhos em ordem e fica com o primeiro que carregar.
 *
 * Ordem de tentativa:
 *   1. customImageUrl   (foto do lojista — URL ou caminho)
 *   2. defaultImageUrl  (imagem global, compartilhada)
 *   3. emoji            (reserva, quando não há arquivo nenhum)
 *
 * Nenhuma tentativa gera erro visível: se todas falharem, aparece o
 * emoji. É por isso que o acervo pode estar pela metade sem quebrar a
 * interface.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type ProductThumbProps = {
  /** Foto própria do estabelecimento. Tem prioridade sobre a global. */
  customImageUrl?: string | null;
  /** Imagem da biblioteca global. */
  globalImageUrl?: string | null;
  /**
   * Caminho-base sem extensão para tentar as variações de arquivo.
   * Ex.: "bebidas/refrigerantes/coca-cola-350ml".
   */
  basePath?: string | null;
  /** Reserva quando não há imagem. */
  emoji?: string | null;
  alt: string;
  size?: number;
  className?: string;
  /** Cantos: quadrado (catálogo) ou circular (avatar de categoria). */
  rounded?: 'md' | 'full';
};

function toUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return `${CATALOG_BASE_PATH}/${trimmed.replace(/^\/+/, '')}`;
}

/** Expande um caminho-base nas extensões aceitas. */
function expand(base: string | null | undefined): string[] {
  if (!base || !base.trim()) return [];
  const clean = base.trim().replace(/^\/+/, '');
  // Se já tem extensão, é um arquivo — não expande.
  if (/\.(webp|jpe?g|png|avif)$/i.test(clean)) {
    const url = toUrl(clean);
    return url ? [url] : [];
  }
  return CATALOG_EXTENSIONS.map((ext) => `${CATALOG_BASE_PATH}/${clean}${ext}`);
}

export function ProductThumb({
  customImageUrl,
  globalImageUrl,
  basePath,
  emoji,
  alt,
  size = 48,
  className,
  rounded = 'md',
}: ProductThumbProps) {
  // Lista de URLs a tentar, na ordem de precedência.
  const candidates = React.useMemo(() => {
    const list: string[] = [];
    const custom = toUrl(customImageUrl);
    if (custom) list.push(custom);
    const global = toUrl(globalImageUrl);
    if (global) list.push(global);
    list.push(...expand(basePath));
    return Array.from(new Set(list));
  }, [customImageUrl, globalImageUrl, basePath]);

  const [index, setIndex] = React.useState(0);

  // Trocar de produto recomeça a tentativa do zero — sem isso o índice
  // antigo vazaria para o produto seguinte e a foto sumiria.
  React.useEffect(() => {
    setIndex(0);
  }, [candidates.join('|')]);

  const src = candidates[index];
  const showFallback = !src;

  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-center justify-center overflow-hidden bg-ink-100',
        rounded === 'full' ? 'rounded-full' : 'rounded',
        className,
      )}
      style={{ width: size, height: size, minWidth: size }}
      aria-label={showFallback ? alt : undefined}
      role={showFallback ? 'img' : undefined}
    >
      {showFallback ? (
        <span style={{ fontSize: size * 0.45 }} aria-hidden="true">
          {emoji || '📦'}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setIndex((current) => current + 1)}
        />
      )}
    </div>
  );
}
