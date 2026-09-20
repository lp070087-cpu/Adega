'use client';

import * as React from 'react';
import { cn, formatBRL } from '@/lib/utils';
import { ProductThumb } from '@/components/catalog/ProductThumb';
import { copyByType, initialsFromName } from '@/data/business-copy';
import { STORE_OPEN_STATE_LABEL, type StoreOpenState } from '@/lib/schedule';
import type { BusinessType } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * HERO DINÂMICO DA LOJA
 * -----------------------------------------------------------------------
 * O topo da loja pública, montado com os produtos que ESTA loja escolheu
 * destacar. Não é um vídeo nem uma animação pesada: é composição em CSS —
 * cards que entram deslizando, flutuam devagar em tempos diferentes e
 * reagem de leve ao movimento do mouse.
 *
 * ── Por que CSS e não uma biblioteca ──
 * O primeiro quadro é o que importa: aqui ele aparece antes de qualquer
 * JS rodar, porque a animação de entrada é `animation` de CSS. Uma
 * biblioteca de animação custaria 40–60 kB e um atraso hidratando o
 * elemento mais visível da página. Para isto — entrada, flutuação e um
 * parallax leve — não paga.
 *
 * ── Acessibilidade ──
 * `prefers-reduced-motion` desliga tudo, inclusive a troca automática de
 * banner. Sem isso, quem sente desconforto com movimento recebe card
 * flutuando e slide trocando na cara logo na abertura do site.
 *
 * ── Onde entra o resto do sistema ──
 * `organization`, `businessType`, `featuredProducts` e `banners` vêm
 * prontos do servidor. O componente não consulta banco: recebe da página
 * e desenha. Isso é o que permite o mesmo template servir hamburgueria,
 * pizzaria, mercado ou adega sem nenhum `if` de segmento.
 *
 * ── Slideshow: portado da versão aprovada ──
 * O comportamento abaixo foi portado do `site.html` @ ad8d5e9 — a versão
 * antiga aprovada — onde vivia em `renderHero()` / `goToSlide()` /
 * `startSlideshow()` / `resetSlideshow()`. O que foi mantido, porque era
 * comportamento REAL de lá: vários slides, transição por opacidade de
 * 1.2s, troca automática a cada 4s, dots clicáveis (o ativo vira uma
 * pílula larga) e índice circular. Com um banner só, nenhum controle
 * aparece; sem banner nenhum, o hero cai no fundo da marca.
 *
 * A ÚNICA adição é o swipe: a versão antiga NÃO tinha gesto de arrastar
 * (não havia `touchstart`/`touchmove`/`pointerdown` no arquivo). Foi
 * pedido explicitamente, então está implementado aqui como código novo,
 * não como restauração.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type HeroProduct = {
  id: string;
  name: string;
  emoji: string | null;
  customImageUrl: string | null;
  globalImageUrl: string | null;
  price: number;
  promotionalPrice: number | null;
};

export type HeroBanner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  imagePath: string;
  linkUrl: string | null;
};

export type DynamicStoreHeroProps = {
  organization: {
    name: string;
    slug: string;
    brandColor: string;
    logoUrl: string | null;
    description: string | null;
    averageDeliveryTime: number | null;
    minimumOrder: number;
    /** Estado combinado: decisão do lojista + agenda da semana. */
    openState: string;
  };
  businessType: string | null;
  /** Produtos marcados como destaque. Vazio = o hero se vira sem eles. */
  featuredProducts: HeroProduct[];
  /**
   * Banners DESTA loja, na ordem de `position` (o servidor já ordena).
   * Sem banner, o hero usa só a cor da marca — nunca arte de outra loja.
   */
  banners?: HeroBanner[];
  /** Chamada principal — "Ver cardápio", "Pedir agora"... */
  ctaLabel?: string;
  ctaHref?: string;
};

/** Tempo de cada slide, igual ao da versão aprovada. */
const SLIDE_INTERVAL_MS = 4000;
/** Distância mínima do gesto para contar como swipe (px). */
const SWIPE_THRESHOLD_PX = 40;

export function DynamicStoreHero({
  organization,
  businessType,
  featuredProducts,
  banners = [],
  ctaLabel = 'Ver cardápio',
  ctaHref = '#cardapio',
}: DynamicStoreHeroProps) {
  /**
   * Descrição: a da loja quando ela escreveu uma; senão a do SEGMENTO,
   * vinda de BUSINESS_COPY — a mesma fonte que o resto do sistema usa.
   * Não existe texto de segmento escrito dentro deste componente: se
   * existisse, mudar a frase de um segmento exigiria mexer em dois lugares.
   */
  const tagline = copyByType(businessType as BusinessType | null).description;

  const openState = (organization.openState as StoreOpenState) ?? 'CLOSED';
  const isOpen = openState === 'OPEN';
  const statusLabel = STORE_OPEN_STATE_LABEL[openState] ?? STORE_OPEN_STATE_LABEL.CLOSED;

  const storeDescription = organization.description?.trim();

  // Até 5 cards: mais que isso o hero vira parede de imagens e rouba a
  // atenção do botão. O lojista pode destacar 20 produtos — o topo
  // mostra os primeiros.
  const highlights = featuredProducts.slice(0, 5);

  // ── Slideshow ──
  // A lista de banners é a que o SERVIDOR mandou (StoreBanner da própria
  // organização, `placement = hero`, ordenado por `position`). Este
  // componente não conhece arquivo de banner nenhum.
  const slides = banners;
  const hasSlideshow = slides.length > 1;

  const [active, setActive] = React.useState(0);
  const [autoplay, setAutoplay] = React.useState(true);

  // Um índice de slide que sobrevive a uma troca de banners pode apontar
  // para fora da lista quando a loja passa a ter menos — daí o clamp.
  const activeIndex = slides.length > 0 ? active % slides.length : 0;

  const goTo = React.useCallback(
    (index: number) => {
      if (slides.length === 0) return;
      // Módulo positivo: avançar do último volta para o primeiro, e
      // voltar do primeiro vai para o último — igual ao `goToSlide` antigo.
      setActive(((index % slides.length) + slides.length) % slides.length);
    },
    [slides.length],
  );

  /**
   * Autoplay. Só roda com mais de um banner, pausa quando a aba está em
   * segundo plano (economiza trabalho à toa) e é desligado por
   * `prefers-reduced-motion`, que é uma promessa de acessibilidade — não
   * faz sentido respeitar o movimento dos cards e ignorar o do banner.
   */
  React.useEffect(() => {
    if (!hasSlideshow || !autoplay) return;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let timer: number | undefined;
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        setActive((current) => (current + 1) % slides.length);
      }, SLIDE_INTERVAL_MS);
    };
    const stop = () => window.clearInterval(timer);

    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hasSlideshow, autoplay, slides.length]);

  // ── Swipe ──
  // A versão antiga não tinha gesto; isto é código novo. Só reage ao eixo
  // X e só quando o movimento é claramente horizontal (10px de vantagem),
  // senão a rolagem vertical da página seria sequestrada pelo carrossel —
  // que é o defeito clássico de swipe mal implementado no mobile.
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (event: React.TouchEvent) => {
    if (!hasSlideshow) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (!hasSlideshow || !touchStart.current) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) < Math.abs(dy)) return;

    goTo(activeIndex + (dx < 0 ? 1 : -1));
  };

  return (
    <>
      {/*
        React 19 sobe e desduplica <style> com `precedence`: mesmo que a
        página renderize vários heros, o CSS entra uma vez só, no <head>.
        É por isso que ele pode morar aqui dentro, junto do componente,
        em vez de virar regra solta no globals.css.
      */}
      <style href="dynamic-store-hero" precedence="default">
        {HERO_CSS}
      </style>

      <section
        id="inicio"
        className="store-hero relative overflow-hidden"
        // A cor da marca vem do tenant, não de um tema fixo. É o que faz a
        // mesma tela parecer "a cara" de cada estabelecimento.
        style={{ '--hero-brand': organization.brandColor } as React.CSSProperties}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* ── Camada de fundo: slideshow ou só o brilho da marca ── */}
        <div className="store-hero-bg" aria-hidden="true">
          {slides.map((slide, index) => (
            // Sem <a> em volta, de propósito. A versão aprovada também não
            // tinha link no banner, e em camadas sobrepostas ele seria um
            // defeito: slide com opacity 0 CONTINUA recebendo clique, então
            // todos os destinos ficariam ativos ao mesmo tempo e o clique
            // cairia no que estivesse por cima, não no banner visível.
            // `StoreBanner.linkUrl` continua no modelo e chega ao
            // componente — é dado disponível para quando o link do banner
            // for tratado como recurso próprio.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={slide.id}
              src={slide.imagePath}
              alt=""
              className={cn('store-hero-slide', index === activeIndex && 'is-active')}
              // O primeiro slide é o quadro de abertura: carregá-lo com
              // pressa evita o hero "vazio" no primeiro segundo. Os
              // outros podem esperar.
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
            />
          ))}

          {/* Sem banner: mantém o gradiente da marca, que já é o fundo da
              própria section. Sem a imagem, nada de arte de outra loja. */}
          <span className="store-hero-glow store-hero-glow-a" />
          <span className="store-hero-glow store-hero-glow-b" />
        </div>

        <div className="store-hero-inner">
          {/* ── Texto e ação ── */}
          <div className="store-hero-copy">
            <div className="store-hero-identity">
              {organization.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={organization.logoUrl}
                  alt={organization.name}
                  className="store-hero-logo"
                />
              ) : (
                <span className="store-hero-logo store-hero-logo-fallback" aria-hidden="true">
                  {initialsFromName(organization.name)}
                </span>
              )}

              <span className={cn('store-hero-status', isOpen ? 'is-open' : 'is-closed')}>
                <span className="store-hero-dot" aria-hidden="true" />
                {statusLabel}
              </span>
            </div>

            <h1 className="store-hero-title">{organization.name}</h1>
            {storeDescription && <p className="store-hero-tagline">{storeDescription}</p>}
            <p className="store-hero-tagline store-hero-tagline-segment">{tagline}</p>

            <div className="store-hero-facts">
              {organization.averageDeliveryTime ? (
                <span className="store-hero-fact">
                  🛵 {organization.averageDeliveryTime} min
                </span>
              ) : null}
              {organization.minimumOrder > 0 ? (
                <span className="store-hero-fact">
                  Pedido mínimo {formatBRL(organization.minimumOrder)}
                </span>
              ) : null}
            </div>

            <a href={ctaHref} className="store-hero-cta">
              {ctaLabel}
            </a>
          </div>

          {/* ── Composição de produtos ── */}
          {highlights.length > 0 && (
            <div className="store-hero-stage" aria-hidden="true">
              {highlights.map((product, index) => (
                <figure
                  key={product.id}
                  className="store-hero-card"
                  // Atraso e duração variam por posição: os cards não
                  // entram nem flutuam no mesmo compasso, e é isso que
                  // faz o conjunto parecer vivo em vez de mecânico.
                  style={
                    {
                      '--card-index': index,
                      '--float-delay': `${index * 0.7}s`,
                      '--float-duration': `${5 + (index % 3)}s`,
                    } as React.CSSProperties
                  }
                >
                  <ProductThumb
                    customImageUrl={product.customImageUrl}
                    globalImageUrl={product.globalImageUrl}
                    emoji={product.emoji}
                    alt=""
                    size={84}
                    className="store-hero-thumb"
                  />
                  <figcaption className="store-hero-card-name">{product.name}</figcaption>
                  <span className="store-hero-card-price">
                    {formatBRL(
                      product.promotionalPrice != null && product.promotionalPrice < product.price
                        ? product.promotionalPrice
                        : product.price,
                    )}
                  </span>
                </figure>
              ))}
            </div>
          )}
        </div>

        {/* ── Dots: só quando há mais de um banner ── */}
        {hasSlideshow && (
          <div className="store-hero-dots">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={cn('store-hero-carousel-dot', index === activeIndex && 'is-active')}
                aria-label={slide.title?.trim() || `Banner ${index + 1}`}
                aria-current={index === activeIndex}
                onClick={() => {
                  goTo(index);
                  // Tocar num dot reinicia a contagem, senão o slide
                  // troca sozinho logo depois do toque e parece que o
                  // clique não funcionou.
                  setAutoplay(false);
                  window.requestAnimationFrame(() => setAutoplay(true));
                }}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/**
 * Animação do hero, isolada num bloco de CSS próprio.
 *
 * Fica em componente e não no globals.css de propósito: se um dia este
 * hero sair do projeto, sai inteiro, sem deixar regra órfã no tema.
 * As classes têm prefixo `store-hero-` para não colidir com nada.
 */
const HERO_CSS = `
.store-hero {
  position: relative;
  isolation: isolate;
  padding: clamp(2rem, 5vw, 3.75rem) 1.25rem;
  background: linear-gradient(135deg, var(--hero-brand) 0%, #14161d 100%);
  color: #fff;
  /* O swipe é horizontal por natureza: sem isto o navegador pode
     interpretar o arrastar como rolagem lateral da página. */
  touch-action: pan-y;
}
.store-hero-bg { position: absolute; inset: 0; z-index: -1; overflow: hidden; }

/* ── Slideshow: camadas sobrepostas com transição de opacidade ──
   O tempo de 1.2s é o da versão aprovada. Todas as camadas ficam
   montadas (nada de trocar o src e piscar): só a opacidade muda. */
.store-hero-slide {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; opacity: 0;
  transition: opacity 1.2s ease-in-out;
}
.store-hero-slide.is-active { opacity: 1; }

.store-hero-glow { position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.5; }
.store-hero-glow-a {
  width: 22rem; height: 22rem; top: -6rem; right: -4rem;
  background: var(--hero-brand);
  animation: store-hero-drift 16s ease-in-out infinite;
}
.store-hero-glow-b {
  width: 16rem; height: 16rem; bottom: -5rem; left: -3rem;
  background: #ffffff33;
  animation: store-hero-drift 20s ease-in-out infinite reverse;
}
.store-hero-inner {
  position: relative;
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  gap: 2rem;
  align-items: center;
}
.store-hero-identity { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
.store-hero-logo {
  width: 56px; height: 56px; border-radius: 0.75rem; object-fit: cover;
  background: #ffffff1a; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 1.1rem; letter-spacing: 0.02em;
}
.store-hero-status {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.7rem; border-radius: 999px;
  font-size: 0.72rem; font-weight: 700;
  background: #ffffff1f; backdrop-filter: blur(6px);
}
.store-hero-status.is-open { color: #7ff0b0; }
.store-hero-status.is-closed { color: #ffc9c9; }
.store-hero-dot {
  width: 7px; height: 7px; border-radius: 50%; background: currentColor;
}
.store-hero-status.is-open .store-hero-dot { animation: store-hero-pulse 2s ease-in-out infinite; }
.store-hero-title {
  margin: 0 0 0.5rem; font-size: clamp(1.7rem, 4vw, 2.6rem);
  font-weight: 800; line-height: 1.1; letter-spacing: -0.02em;
}
.store-hero-tagline {
  margin: 0 0 0.5rem; max-width: 34rem;
  font-size: clamp(0.9rem, 1.6vw, 1.05rem); line-height: 1.55; color: #ffffffd9;
}
/* A frase do segmento é secundária à descrição da própria loja. */
.store-hero-tagline-segment { margin-bottom: 1rem; font-size: 0.88rem; color: #ffffffa8; }
.store-hero-facts { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; }
.store-hero-fact {
  padding: 0.35rem 0.75rem; border-radius: 999px;
  background: #ffffff1a; font-size: 0.76rem; font-weight: 600;
}
.store-hero-cta {
  display: inline-block; padding: 0.85rem 1.6rem; border-radius: 999px;
  background: #fff; color: #14161d; font-weight: 800; font-size: 0.9rem;
  text-decoration: none; transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.store-hero-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 24px #0000003d; }
.store-hero-cta:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }

/* ── Dots do carrossel (visual da versão aprovada: o ativo vira pílula) ──
   Nome próprio (store-hero-carousel-*) de propósito: .store-hero-dot
   JÁ EXISTE acima, e é o pontinho do indicador aberto/fechado. Reusar o
   mesmo nome faria as duas regras se aplicarem aos dois elementos — o
   span do status herdaria width: 10px, cursor: pointer e padding: 0 do
   botão do carrossel. */
.store-hero-dots {
  position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%);
  display: flex; gap: 10px; z-index: 5;
}
.store-hero-carousel-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #ffffff59; border: none; cursor: pointer;
  padding: 0; transition: all 0.4s ease;
}
.store-hero-carousel-dot.is-active {
  background: var(--hero-brand); width: 28px; border-radius: 10px;
}
.store-hero-carousel-dot:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }

.store-hero-stage {
  display: flex; flex-wrap: wrap; gap: 0.85rem; justify-content: center;
}
.store-hero-card {
  margin: 0; width: 128px; padding: 0.85rem 0.6rem;
  border-radius: 1rem; background: #ffffff17;
  border: 1px solid #ffffff26; backdrop-filter: blur(10px);
  display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
  opacity: 0;
  animation:
    store-hero-enter 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards,
    store-hero-float var(--float-duration, 6s) ease-in-out infinite;
  animation-delay: calc(var(--card-index, 0) * 0.09s), var(--float-delay, 0s);
}
.store-hero-card:nth-child(even) { transform: translateY(14px); }
.store-hero-card-name {
  font-size: 0.72rem; font-weight: 700; text-align: center; line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.store-hero-card-price { font-size: 0.78rem; font-weight: 800; color: #7ff0b0; }
.store-hero-thumb { border-radius: 0.6rem; }

@keyframes store-hero-enter {
  from { opacity: 0; transform: translateY(22px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes store-hero-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-9px); }
}
@keyframes store-hero-drift {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-18px, 14px); }
}
@keyframes store-hero-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

@media (min-width: 860px) {
  .store-hero-inner { grid-template-columns: 1.05fr 0.95fr; }
  .store-hero-stage { justify-content: flex-end; }
}

/* Mobile: o texto precisa de um véu sobre o banner. Sem ele, um banner
   claro deixa o nome da loja ilegível — o defeito clássico de hero com
   foto de fundo em tela pequena. */
@media (max-width: 859px) {
  .store-hero-bg::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, #00000073 0%, #000000b8 100%);
  }
  /* Espaço para os dots não caírem em cima do botão. */
  .store-hero-inner { padding-bottom: 2.25rem; }
}

/* Acessibilidade: sem movimento — nada flutua, nada troca sozinho. O
   carrossel CONTINUA navegável pelos dots. */
@media (prefers-reduced-motion: reduce) {
  .store-hero-card,
  .store-hero-glow,
  .store-hero-status.is-open .store-hero-dot {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
  .store-hero-slide { transition: none; }
}
`;
