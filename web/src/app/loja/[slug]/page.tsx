import { readBannerMeta } from '@/lib/banner-meta';
import { readStorefrontCategories } from '@/lib/storefront-categories';
import { StoreAvailabilitySync } from '@/components/store/StoreAvailabilitySync';
import { storeOpeningMode, storeTimeZone } from '@/lib/schedule';
import { brandRgb } from '@/lib/brand';
import './store.css';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getPublicStoreBySlug,
  getPublicCatalog,
  getFeaturedProducts,
} from '@/lib/data/organization';
import { getBannersForStore } from '@/lib/data/global-catalog';
import { DynamicStoreHero } from '@/components/store/DynamicStoreHero';
import { StoreCatalog, type StoreProduct } from '@/components/store/StoreCatalog';
import { StoreAbout, StoreFooter } from '@/components/store/StoreAbout';
import { copyByType } from '@/data/business-copy';
import { normalizeSchedule, storeOpenState, type WeekdaySchedule } from '@/lib/schedule';
import { formatBRL } from '@/lib/utils';
import type { BusinessType } from '@prisma/client';
import { getCommercialAccess } from '@/lib/platform/access';
import { selectHeroProducts } from '@/lib/store-hero-products';
import { storeProductAvailability } from '@/lib/store-product-availability';
import { growthState } from '@/lib/growth';
import { getPublicMobileBanners } from '@/lib/data/store-ops';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LOJA PÚBLICA — /loja/[slug]
 * -----------------------------------------------------------------------
 * O MESMO template atende qualquer segmento. Não existe "site de
 * hamburgueria" e "site de adega": existe esta página, que lê o tipo do
 * estabelecimento e monta a vitrine a partir dos dados dele.
 *
 * O que o servidor entrega:
 *   · branding      → nome, logo, cor da marca, descrição
 *   · categorias    → as que a loja criou no onboarding, na ordem dela
 *   · produtos      → só os vendáveis (ativo, disponível, com estoque)
 *   · destaques     → os que o lojista marcou para o topo
 *   · banners       → os da loja; sem banner próprio, o hero usa a marca
 *
 * ── Isolamento ──
 * O slug é a chave, e cada consulta já filtra por organizationId. Não há
 * caminho em que esta página leia dado de outra loja. Slug inexistente
 * vira 404 real — nunca o catálogo de uma loja qualquer.
 *
 * ── Imagem ──
 * A foto do produto vindo da biblioteca NÃO é copiada: o registro aponta
 * para o arquivo global. Por isso a vitrine precisa carregar o vínculo —
 * sem ele, 500 lojas vendendo a mesma Coca-Cola apareceriam sem foto.
 * ═══════════════════════════════════════════════════════════════════════
 */

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const store = await getPublicStoreBySlug(slug);

  if (!store || store.status === 'CANCELLED') {
    // Sem `metadataBase` no layout raiz, `canonical` e `openGraph.url`
    // relativos quebrariam o build de metadata. Aqui devolvemos só o
    // título: a página vai chamar notFound() de qualquer forma.
    return { title: 'Estabelecimento não encontrado' };
  }

  const copy = copyByType(store.businessType);
  const description =
    store.description?.trim() ||
    `${store.name} — ${copy.noun} com pedidos online. ${copy.description}`;

  const canonical = `/loja/${store.slug}/`;

  return {
    title: store.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: store.name,
      description,
      url: canonical,
      siteName: store.name,
      // Logo da loja quando existe. Sem ela, NÃO caímos em imagem de outra
      // loja nem em banner genérico: o card apenas fica sem imagem.
      images: store.logoUrl ? [{ url: store.logoUrl }] : undefined,
    },
    twitter: {
      card: 'summary',
      title: store.name,
      description,
      images: store.logoUrl ? [store.logoUrl] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicStorePage({ params }: PageProps) {
  const { slug } = await params;
  const store = await getPublicStoreBySlug(slug);

  // Loja cancelada não tem vitrine.
  //
  // SUSPENDED continua no ar de propósito: a pendência é comercial, entre
  // a plataforma e o lojista. Tirar a loja do ar por causa dela puniria o
  // cliente final, que não tem nada a ver com a cobrança — e ainda
  // derrubaria as vendas de quem está tentando pagar. O bloqueio
  // operacional é o `storeStatus` (OPEN/CLOSED/PAUSED), que é decisão do
  // próprio lojista.
  if (!store || store.status === 'CANCELLED') notFound();

  const [catalog, featured, banners, mobileBanners] = await Promise.all([
    getPublicCatalog(store.id),
    getFeaturedProducts(store.id, 6),
    getBannersForStore(store.id, store.businessType as BusinessType | null, 'hero'),
    getPublicMobileBanners(store.id),
  ]);

  const settings = (store.settings as Record<string, unknown> | null) ?? {};
  const schedule = normalizeSchedule(settings.openingHours as WeekdaySchedule[] | undefined);

  /**
   * Estado combinado: o que o lojista decidiu (storeStatus) cruzado com o
   * que a agenda diz. Sem o cruzamento, uma loja que fecha às 23h apareceria
   * "aberta" às 2h da manhã só porque ninguém trocou o status.
   */
  const openState = storeOpenState(store.storeStatus, schedule, undefined, storeOpeningMode(settings, store.storeStatus), storeTimeZone(settings));
  const commercial = await getCommercialAccess(store.id);

  // Sem destaques configurados, mostrar produtos reais do próprio catálogo.
  // Isso não cria promoção nem associa um banner à organização.
  const heroProducts = selectHeroProducts(featured, catalog.products).map((product) => ({
    id: product.id,
    name: product.name,
    emoji: product.emoji,
    customImageUrl: product.customImageUrl ?? product.imageUrl,
    globalImageUrl: product.globalProduct?.defaultImageUrl ?? null,
    price: Number(product.price),
    promotionalPrice:
      product.promotionalPrice === null ? null : Number(product.promotionalPrice),
  }));

  const products: StoreProduct[] = catalog.products.map((product) => ({
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    emoji: product.emoji,
    customImageUrl: product.customImageUrl ?? product.imageUrl,
    globalImageUrl: product.globalProduct?.defaultImageUrl ?? null,
    // O acervo pode não ter o arquivo ainda: o ProductThumb tenta as
    // extensões em ordem e cai no emoji. Nada quebra por falta de imagem.
    basePath: null,
    price: Number(product.price),
    promotionalPrice:
      product.promotionalPrice === null ? null : Number(product.promotionalPrice),
    ...storeProductAvailability(product, store.id),
    type: product.type,
    comboItems:
      product.combo?.items.filter(item=>item.product.organizationId===store.id).map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        unitPrice: Number(item.product.price),
        quantity: item.quantity,
        active: item.product.active,
      })) ?? [],
    variations: product.variations.map((variation) => ({
      id: variation.id,
      name: variation.name,
      priceAdjustment: Number(variation.priceAdjustment),
    })),
    addonGroups: product.addonGroups.map((group) => ({
      id: group.id,
      name: group.name,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      required: group.required,
      addons: group.addons.map((addon) => ({
        id: addon.id,
        name: addon.name,
        price: Number(addon.price),
      })),
    })),
  }));

  const addressLine =
    [store.address, store.addressNumber].filter(Boolean).join(', ') || null;
  const fullAddress = [addressLine, store.district, store.city, store.state]
    .filter((part) => part && String(part).trim())
    .join(' · ');

  /**
   * O menu reflete o que ESTA loja tem. "Promoções" só entra quando existe
   * promoção real, "Contato" só quando existe algum dado de contato. Uma
   * âncora para uma seção que não existe não é neutra: o cliente toca nela
   * e nada acontece — pior do que não oferecer o link.
   *
   * A regra espelha exatamente a de `StoreAbout`, que devolve `null` quando
   * não há nada a mostrar.
   */
  const hasPromos = products.some(
    (product) => product.promotionalPrice != null && product.promotionalPrice < product.price,
  );
  const hasCombos = products.some((product) => product.comboItems.length > 0);
  const hasContact = Boolean(
    store.phone || store.whatsapp || store.email || fullAddress || store.openingHours,
  );
  const hasAbout = hasContact || Boolean(store.description?.trim());

  const sections = [
    { id: 'inicio', label: 'Início' },
    ...(products.length > 0 ? [{ id: 'cardapio', label: 'Produtos' }] : []),
    ...(hasPromos ? [{ id: 'promocoes', label: 'Promoções' }] : []),
    ...(hasCombos ? [{ id: 'combos', label: 'Combos' }] : []),
    ...(hasAbout ? [{ id: 'sobre', label: 'Sobre' }] : []),
    ...(hasContact ? [{ id: 'contato', label: 'Contato' }] : []),
  ];

  const hero = (
    <DynamicStoreHero
        organization={{
          name: store.name,
          slug: store.slug,
          brandColor: store.brandColor,
          logoUrl: store.logoUrl,
          description: store.description,
          averageDeliveryTime: store.averageDeliveryTime,
          minimumOrder: Number(store.minimumOrder),
          openState,
        }}
        businessType={store.businessType}
        mobileBanners={mobileBanners.filter(b=>b.placement==='hero-mobile')}
        featuredProducts={heroProducts}
        banners={banners.map((banner) => ({
          id: banner.id,
          title: banner.title,
          subtitle: banner.subtitle,
          imagePath: banner.imagePath,
          linkUrl: banner.linkUrl,
          ...readBannerMeta(settings, banner.id),
        }))}
      />
  );

  return (
    <main className="storefront min-h-screen bg-white" style={{ "--store-brand": store.brandColor, "--brand": store.brandColor, "--orange": store.brandColor, "--brand-rgb": brandRgb(store.brandColor) } as React.CSSProperties}>
      <StoreAvailabilitySync slug={slug} initialState={openState} mode={storeOpeningMode(settings,store.storeStatus)} />
      <StoreCatalog
        transitionBanners={mobileBanners.filter(b=>b.placement.startsWith('transition:'))}
        hero={hero}
          store={{
            id: store.id,
            slug: store.slug,
            name: store.name,
            brandColor: store.brandColor,
            logoUrl: store.logoUrl,
            businessType: store.businessType,
            whatsapp: store.whatsapp,
            phone: store.phone,
            email: store.email,
            openingHours: store.openingHours,
            minimumOrder: Number(store.minimumOrder),
            baseDeliveryFee: Number(store.baseDeliveryFee),
            extraKmFee: Number(store.extraKmFee),
            averageDeliveryTime: store.averageDeliveryTime,
            allowPickup: store.allowPickup,
            allowOwnDelivery: store.allowOwnDelivery,
            openState,
            allowNewOrders: commercial.allowNewOrders,
            benefitsAvailable: growthState(settings).loyalty.enabled || growthState(settings).campaigns.some(c=>c.status==='ACTIVE'),
            commercialMessage: commercial.allowNewOrders ? null : commercial.message,
            address: addressLine,
            district: store.district,
            city: store.city,
            state: store.state,
            description: store.description,
          }}
          categories={catalog.categories}
          categoryConfig={readStorefrontCategories(settings)}
          products={products}
          sections={sections}
        />

      <StoreAbout
        store={{
          name: store.name,
          description: store.description,
          phone: store.phone,
          whatsapp: store.whatsapp,
          email: store.email,
          address: addressLine,
          district: store.district,
          city: store.city,
          state: store.state,
          openingHours: store.openingHours,
          averageDeliveryTime: store.averageDeliveryTime,
          minimumOrder: Number(store.minimumOrder),
          minimumOrderLabel: formatBRL(Number(store.minimumOrder)),
        }}
      />

      <StoreFooter store={{ name: store.name, slug: store.slug }} />
    </main>
  );
}
