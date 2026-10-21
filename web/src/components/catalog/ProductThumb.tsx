'use client';

import * as React from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { productImageCandidates } from '@/lib/catalog-images';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MINIATURA DE PRODUTO
 * -----------------------------------------------------------------------
 * Uma <img> comum não resolve o problema real do acervo: o arquivo pode
 * existir como .webp, .jpg ou .png, e o banco não sabe qual — ele guarda o
 * caminho SEM extensão de propósito. Em vez de fazer uma consulta ao
 * servidor para descobrir, o componente TENTA os caminhos em ordem e fica
 * com o primeiro que carregar.
 *
 * Ordem de tentativa:
 *   1. customImageUrl   (foto do lojista — URL ou caminho)
 *   2. globalImageUrl   (imagem global, compartilhada)
 *   3. basePath         (nome do arquivo, quando difere do global)
 *   4. emoji            (reserva, quando não há arquivo nenhum)
 *
 * Nenhuma tentativa gera erro visível: se todas falharem, aparece o
 * emoji. É por isso que o acervo pode estar pela metade sem quebrar a
 * interface.
 *
 * ── Quem monta a lista é `productImageCandidates()` ──
 * A montagem do caminho NÃO mora mais aqui. Havia duas implementações
 * divergentes: esta expandia as extensões de `basePath`, mas passava
 * `globalImageUrl` por um `toUrl()` que só prefixava — e `globalImageUrl` é
 * exatamente o campo que vem sem extensão do banco. Resultado: a loja
 * pública tentava `/catalog/bebidas/cervejas/heineken-lata-350ml`, recebia
 * 404 e caía no texto alternativo, enquanto o arquivo
 * `heineken-lata-350ml.jpeg` estava lá. Agora a regra é uma só, em
 * `src/lib/catalog-images.ts`, e vale para os seis consumidores.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type ProductThumbProps = {
  /** Foto própria do estabelecimento. Tem prioridade sobre a global. */
  customImageUrl?: string | null;
  /** Foto própria legada; preservada atrás da personalizada e da biblioteca global. */
  imageUrl?: string | null;
  /** Imagem da biblioteca global (guardada no banco SEM extensão). */
  globalImageUrl?: string | null;
  /**
   * Caminho-base para tentar as variações de arquivo. Ex.:
   * "bebidas/refrigerantes/coca-cola" ou o valor já com extensão.
   */
  basePath?: string | null;
  /**
   * Quando basePath é uma VARIAÇÃO do produto (onboarding), ele deve ser
   * tentado antes da imagem global. Ver `productImageCandidates()`.
   */
  preferBasePath?: boolean;
  /** Reserva quando não há imagem. */
  emoji?: string | null;
  alt: string;
  size?: number;
  className?: string;
  /** Cantos: quadrado (catálogo) ou circular (avatar de categoria). */
  rounded?: 'md' | 'full';
};

export function ProductThumb({
  customImageUrl,
  imageUrl,
  globalImageUrl,
  basePath,
  preferBasePath = false,
  alt,
  size = 48,
  className,
  rounded = 'md',
}: ProductThumbProps) {
  // Lista de URLs a tentar, na ordem de precedência.
  const candidates = React.useMemo(
    () => productImageCandidates({ customImageUrl, globalImageUrl, imageUrl, basePath, preferBasePath, productName: alt }),
    [customImageUrl, globalImageUrl, imageUrl, basePath, preferBasePath, alt],
  );

  const [index, setIndex] = React.useState(0);
  const [loadedSource, setLoadedSource] = React.useState<string>();
  const imageRef = React.useRef<HTMLImageElement>(null);
  const resetKey = candidates.join('|');

  // Trocar de produto recomeça a tentativa do zero — sem isso o índice
  // antigo vazaria para o produto seguinte e a foto sumiria.
  React.useEffect(() => {
    setIndex(0);
  }, [resetKey]);

  // Passar do fim da lista significa "nenhum arquivo serviu". O índice
  // para no tamanho da lista para não continuar incrementando para sempre
  // a cada novo erro.
  const src = index < candidates.length ? candidates[index] : undefined;
  const showFallback = !src;
  const advance = React.useCallback(() => {
    setIndex(current => current === index ? Math.min(current + 1, candidates.length) : current);
  }, [index, candidates.length]);

  // A falha pode ocorrer no HTML inicial, antes de os handlers serem ligados.
  // O navegador não repete esse evento depois da hidratação.
  React.useEffect(() => {
    const image = imageRef.current;
    if (!src || !image?.complete) return;
    if (image.naturalWidth === 0) advance();
    else setLoadedSource(src);
  }, [src, advance]);

  return (
    <div
      className={cn(
        'relative flex flex-shrink-0 items-center justify-center overflow-hidden bg-ink-100',
        rounded === 'full' ? 'rounded-full' : 'rounded',
        className,
      )}
      style={{ width: size, height: size, minWidth: size }}
      aria-label={showFallback ? alt : undefined}
      role={showFallback ? 'img' : undefined}
    >
      {(showFallback || loadedSource !== src) && (
        <Package size={Math.min(40, size * 0.45)} strokeWidth={1.2} className="text-ink-300" aria-hidden="true" />
      )}
      {!showFallback && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // Sem `key`, o React reaproveita o mesmo nó quando só o `src`
          // muda e o navegador pode não recarregar. Com a chave por URL,
          // cada candidato é um <img> novo e a tentativa seguinte é de
          // fato disparada.
          key={src}
          ref={imageRef}
          src={src}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain"
          style={{ visibility: loadedSource === src ? 'visible' : 'hidden' }}
          onLoad={() => setLoadedSource(src)}
          onError={advance}
        />
      )}
    </div>
  );
}
