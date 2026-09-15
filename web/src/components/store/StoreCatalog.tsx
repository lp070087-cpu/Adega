'use client';

import * as React from 'react';
import { cn, formatBRL } from '@/lib/utils';
import { checkoutAction } from '@/app/actions/orders';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { ProductThumb } from '@/components/catalog/ProductThumb';
import { StoreHeader } from '@/components/store/StoreHeader';
import { STORE_OPEN_STATE_LABEL, type StoreOpenState } from '@/lib/schedule';
import type { BusinessType } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * VITRINE — cardápio, carrinho e fechamento do pedido (Fase 5)
 * -----------------------------------------------------------------------
 * O MESMO componente atende qualquer segmento: lê as categorias que a loja
 * criou e monta as seções a partir delas. Não há nada de "hamburgueria" nem
 * de "adega" no código — o que depende do segmento vem de BUSINESS_COPY.
 *
 * ── Sobre preço ──
 * O carrinho calcula um total APENAS para o cliente ver. Esse número não
 * vai para o servidor e não decide nada: `checkoutAction` recebe só
 * produto, quantidade, variação e adicionais, e recalcula tudo a partir do
 * banco. Editar o preço pelo DevTools muda o que a tela mostra e nada mais.
 *
 * ── Sobre o carrinho no localStorage ──
 * É estado temporário de interface, que é o uso permitido. A chave é
 * NAMESPACED POR LOJA (`...cart.<slug>`): sem isso, a sacola da hamburgueria
 * apareceria dentro da pizzaria para quem visita as duas no mesmo navegador
 * — produtos de um catálogo que a outra loja nem vende.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type StoreProductAddon = { id: string; name: string; price: number };

export type StoreComboItem = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  active: boolean;
};

export type StoreProduct = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  emoji: string | null;
  /** Foto própria. Vence a da biblioteca quando existe. */
  customImageUrl: string | null;
  /** Imagem compartilhada da biblioteca global. */
  globalImageUrl: string | null;
  /** Caminho-base do acervo, quando o produto veio da biblioteca. */
  basePath: string | null;
  price: number;
  promotionalPrice: number | null;
  available: boolean;
  trackStock: boolean;
  /** Saldo atual. Com `trackStock`, zero significa esgotado. */
  stock: number;
  type: string;
  comboItems: StoreComboItem[];
  variations: Array<{ id: string; name: string; priceAdjustment: number }>;
  addonGroups: Array<{
    id: string;
    name: string;
    minSelections: number;
    maxSelections: number;
    required: boolean;
    addons: StoreProductAddon[];
  }>;
};

export type StoreInfo = {
  id: string;
  slug: string;
  name: string;
  brandColor: string;
  logoUrl: string | null;
  businessType: BusinessType | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  openingHours: string | null;
  minimumOrder: number;
  baseDeliveryFee: number;
  extraKmFee: number;
  averageDeliveryTime: number | null;
  allowPickup: boolean;
  allowOwnDelivery: boolean;
  openState: StoreOpenState;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
};

type CartLine = {
  /** Chave da linha: produto + variação + adicionais escolhidos. */
  key: string;
  productId: string;
  name: string;
  emoji: string | null;
  customImageUrl: string | null;
  globalImageUrl: string | null;
  basePath: string | null;
  unitPrice: number;
  quantity: number;
  variationId?: string;
  variationName?: string;
  addonIds: string[];
  addonNames: string[];
  notes?: string;
};

/**
 * Chave do carrinho, uma por loja.
 *
 * O slug entra na chave de propósito. Compartilhar a mesma chave entre
 * lojas faria a sacola de uma aparecer na outra — com ids de produto que
 * não existem ali, e um total que não corresponde a nada.
 */
function cartStorageKey(slug: string): string {
  return `delivery-platform.cart.${slug}`;
}

/** Preço efetivo do produto — promoção vence quando é menor. */
function effectivePrice(product: StoreProduct): number {
  if (product.promotionalPrice != null && product.promotionalPrice < product.price) {
    return product.promotionalPrice;
  }
  return product.price;
}

/**
 * Rótulo da forma de pagamento na confirmação.
 *
 * Vem do mesmo vocabulário do seletor do checkout — o cliente precisa
 * reencontrar na confirmação exatamente o termo que escolheu, senão fica
 * a dúvida de se pagou a mesma coisa. Nesta fase NÃO existe pagamento
 * online: tudo é acertado na entrega ou no balcão, e o texto diz isso.
 */
const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito na entrega',
  DEBIT_CARD: 'Cartão de débito na entrega',
};

/**
 * O produto está REALMENTE em promoção?
 * Preço promocional maior ou igual ao cheio não é promoção — é erro de
 * cadastro, e exibir "de/por" em cima disso seria anunciar um desconto que
 * não existe.
 */
function isOnPromo(product: StoreProduct): boolean {
  return product.promotionalPrice != null && product.promotionalPrice < product.price;
}

/** Quanto os itens do combo custariam separados. */
function comboSeparateTotal(items: StoreComboItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100;
}

export function StoreCatalog({
  store,
  categories,
  products,
  sections,
}: {
  store: StoreInfo;
  categories: Array<{ id: string; name: string; slug: string; emoji: string | null }>;
  products: StoreProduct[];
  /** Seções que existem de fato nesta loja — o menu não mostra âncora vazia. */
  sections: Array<{ id: string; label: string }>;
}) {
  const [search, setSearch] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState('all');
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [customizing, setCustomizing] = React.useState<StoreProduct | null>(null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  /** Modalidade escolhida no checkout — muda o frete mostrado e os campos. */
  const [deliveryType, setDeliveryType] = React.useState<'DELIVERY' | 'PICKUP'>(
    store.allowOwnDelivery ? 'DELIVERY' : 'PICKUP',
  );
  const [paymentMethod, setPaymentMethod] = React.useState('CASH');
  /**
   * Pedido criado. Guarda o RESULTADO do servidor (número e total
   * recalculados), não o que a tela calculou — a confirmação precisa mostrar
   * o valor oficial, não a prévia.
   *
   * O endereço entra aqui como texto já montado: é o que o cliente
   * informou e o que a loja vai usar para entregar. Sem ele, quem pediu
   * entrega não teria como conferir se digitou o endereço certo — e o erro
   * só apareceria quando o motoboy chegasse no lugar errado.
   */
  const [order, setOrder] = React.useState<{
    displayId: number;
    total: number;
    deliveryType: 'DELIVERY' | 'PICKUP';
    paymentMethod: string;
    changeFor?: number;
    customerName: string;
    addressLine?: string;
  } | null>(null);

  const closed = store.openState !== 'OPEN';
  const storageKey = cartStorageKey(store.slug);

  /**
   * Busca com atraso curto.
   *
   * O filtro roda no cliente e é barato, mas digitar "hamburguer" dispararia
   * 10 filtragens e 10 re-renders da lista inteira. O atraso de 200 ms deixa
   * a digitação fluida sem request nenhum — não há consulta ao servidor aqui,
   * que é justamente o ponto: buscar no cardápio não deve custar rede.
   */
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  // O carrinho só é lido DEPOIS da montagem. Ler durante a renderização
  // faria o HTML do servidor divergir do primeiro render do cliente.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) setCart(parsed.filter((line) => line && line.productId));
      }
    } catch {
      // Carrinho corrompido não é motivo para derrubar a loja.
    }
    setHydrated(true);
  }, [storageKey]);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // Modo privativo pode recusar a escrita; a compra segue funcionando.
    }
  }, [cart, hydrated, storageKey]);

  const visible = React.useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return products.filter((product) => {
      if (activeCategory !== 'all' && product.categoryId !== activeCategory) return false;
      if (!term) return true;
      const categoryName =
        categories.find((category) => category.id === product.categoryId)?.name ?? '';
      return `${product.name} ${product.description ?? ''} ${categoryName}`
        .toLowerCase()
        .includes(term);
    });
  }, [products, debouncedSearch, activeCategory, categories]);

  const grouped = React.useMemo(() => {
    const byCategory = new Map<string, StoreProduct[]>();
    for (const product of visible) {
      const key = product.categoryId ?? '__sem_categoria__';
      const list = byCategory.get(key) ?? [];
      list.push(product);
      byCategory.set(key, list);
    }
    return categories
      .map((category) => ({ category, items: byCategory.get(category.id) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [visible, categories]);

  /**
   * Promoções e combos são RECORTES do mesmo catálogo, não listas paralelas.
   *
   * Um produto em promoção continua na sua categoria — tirá-lo de lá faria o
   * cliente que procura "X-Bacon" não achar. A seção de promoções é um atalho
   * para quem quer ver só o que está com desconto.
   *
   * Só aparece quando existe promoção REAL: `promotionalPrice` menor que o
   * preço. Um preço promocional maior ou igual não é promoção, é erro de
   * cadastro, e mostrar "Promoções" com produtos sem desconto seria mentir.
   *
   * Os dois recortes passam pelo MESMO filtro de categoria e busca que a
   * lista principal: filtrar por "Bebidas" e continuar vendo promoção de
   * pizza na seção de baixo seria uma lista que ignora o filtro do usuário.
   */
  const promos = React.useMemo(
    () =>
      visible.filter(
        (product) =>
          product.promotionalPrice != null && product.promotionalPrice < product.price,
      ),
    [visible],
  );

  const combos = React.useMemo(
    () => visible.filter((product) => product.comboItems.length > 0),
    [visible],
  );

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  /**
   * Prévia do frete. Não é o valor oficial — o servidor recalcula com as
   * regras da organização no momento do pedido. Serve para o cliente não
   * ser surpreendido no fim, só isso.
   */
  const deliveryFee =
    cart.length > 0 && deliveryType === 'DELIVERY' ? store.baseDeliveryFee : 0;
  const total = subtotal + deliveryFee;
  const belowMinimum = cart.length > 0 && subtotal < store.minimumOrder;
  const missingForMinimum = Math.max(0, store.minimumOrder - subtotal);

  function addLine(line: CartLine) {
    setCart((current) => {
      const existing = current.find((item) => item.key === line.key);
      if (existing) {
        return current.map((item) =>
          item.key === line.key
            ? { ...item, quantity: Math.min(99, item.quantity + line.quantity) }
            : item,
        );
      }
      return [...current, line];
    });
    setSuccess(`${line.name} foi adicionado à sacola.`);
    setError(null);
  }

  function quickAdd(product: StoreProduct) {
    // Produto com variação obrigatória não pode entrar direto: o cliente
    // precisa escolher. Sem isso o pedido chegaria ambíguo na cozinha.
    if (product.type === 'VARIATION' && product.variations.length > 0) {
      setCustomizing(product);
      return;
    }
    if (product.addonGroups.length > 0) {
      setCustomizing(product);
      return;
    }
    addLine({
      key: `${product.id}|`,
      productId: product.id,
      name: product.name,
      emoji: product.emoji,
      customImageUrl: product.customImageUrl,
      globalImageUrl: product.globalImageUrl,
      basePath: product.basePath,
      unitPrice: effectivePrice(product),
      quantity: 1,
      addonIds: [],
      addonNames: [],
    });
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.key === key
            ? { ...line, quantity: Math.max(0, Math.min(99, line.quantity + delta)) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function submitOrder(formData: FormData) {
    setSending(true);
    setError(null);

    if (closed) {
      setError(
        store.openState === 'PAUSED'
          ? 'A loja está pausada e não está aceitando pedidos agora.'
          : 'A loja está fechada neste momento.',
      );
      setSending(false);
      return;
    }
    if (belowMinimum) {
      setError(`O pedido mínimo é ${formatBRL(store.minimumOrder)}.`);
      setSending(false);
      return;
    }

    const changeRaw = String(formData.get('changeFor') ?? '').replace(',', '.');
    const changeFor = changeRaw.trim() ? Number(changeRaw) : undefined;

    // Enviado ao servidor: produto, quantidade, variação e adicionais.
    // Nenhum preço. O total é recalculado lá.
    const result = await checkoutAction({
      slug: store.slug,
      customerName: String(formData.get('customerName') ?? '').trim(),
      customerPhone: String(formData.get('customerPhone') ?? '').trim(),
      deliveryType,
      deliveryAddress: String(formData.get('deliveryAddress') ?? '').trim() || undefined,
      deliveryNumber: String(formData.get('deliveryNumber') ?? '').trim() || undefined,
      deliveryDistrict: String(formData.get('deliveryDistrict') ?? '').trim() || undefined,
      deliveryCity: String(formData.get('deliveryCity') ?? '').trim() || undefined,
      paymentMethod,
      changeFor: changeFor !== undefined && Number.isFinite(changeFor) ? changeFor : undefined,
      notes: String(formData.get('notes') ?? '').trim() || undefined,
      items: cart.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        variationId: line.variationId,
        addonIds: line.addonIds,
        notes: line.notes,
      })),
    });

    setSending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // O carrinho só é limpo com o pedido REALMENTE gravado.
    setCart([]);
    setCheckoutOpen(false);
    setCartOpen(false);
    setSuccess(null);
    setOrder({
      displayId: result.data?.displayId ?? 0,
      total: result.data?.total ?? 0,
      deliveryType,
      paymentMethod,
      changeFor: paymentMethod === 'CASH' ? changeFor : undefined,
      customerName: String(formData.get('customerName') ?? '').trim(),
      addressLine:
        deliveryType === 'PICKUP'
          ? undefined
          : [
              String(formData.get('deliveryAddress') ?? '').trim(),
              String(formData.get('deliveryNumber') ?? '').trim(),
              String(formData.get('deliveryDistrict') ?? '').trim(),
              String(formData.get('deliveryCity') ?? '').trim(),
            ]
              .filter(Boolean)
              .join(', ') || undefined,
    });
  }

  const whatsappHref = buildWhatsAppHref(store.whatsapp, store.name, order?.displayId);

  return (
    <>
      <StoreHeader
        storeName={store.name}
        slug={store.slug}
        brandColor={store.brandColor}
        logoUrl={store.logoUrl}
        businessType={store.businessType}
        storeStatus={store.openState}
        sections={sections}
        cartCount={itemCount}
        onCartClick={() => setCartOpen(true)}
      />

      <div id="cardapio" className="mx-auto max-w-[1180px] px-4 py-6 sm:px-5 sm:py-8">
        {success && !order && (
          <div className="mb-4">
            <Alert tone="success" title="Tudo certo">
              {success}
            </Alert>
          </div>
        )}

        {closed && (
          <div className="mb-4">
            <Alert
              tone="warn"
              title={
                store.openState === 'PAUSED'
                  ? 'Loja pausada'
                  : STORE_OPEN_STATE_LABEL[store.openState]
              }
            >
              Você pode ver o cardápio inteiro e montar a sacola, mas o pedido só será aceito no
              horário de funcionamento{store.openingHours ? ` (${store.openingHours})` : ''}.
            </Alert>
          </div>
        )}

        {/* ── Busca e categorias ── */}
        <div className="mb-5 space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no cardápio..."
            aria-label="Buscar no cardápio"
            type="search"
          />

          {categories.length > 1 && (
            <div
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
              role="group"
              aria-label="Filtrar por categoria"
            >
              <CategoryChip
                active={activeCategory === 'all'}
                brandColor={store.brandColor}
                onClick={() => setActiveCategory('all')}
              >
                Tudo
              </CategoryChip>
              {categories.map((category) => (
                <CategoryChip
                  key={category.id}
                  active={activeCategory === category.id}
                  brandColor={store.brandColor}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {category.emoji ? `${category.emoji} ` : ''}
                  {category.name}
                </CategoryChip>
              ))}
            </div>
          )}
        </div>

        {/* ── Lista de produtos ── */}
        {grouped.length === 0 ? (
          <p className="rounded-lg border border-ink-100 bg-white p-8 text-center text-[0.86rem] text-ink-500">
            {products.length === 0
              ? 'Este estabelecimento ainda não publicou produtos.'
              : 'Nada encontrado para essa busca.'}
          </p>
        ) : (
          <div className="space-y-7">
            {grouped.map((group) => (
              <section key={group.category.id} id={`cat-${group.category.slug}`}>
                <h2 className="mb-3 text-[1.05rem] font-extrabold text-ink-900">
                  {group.category.emoji ? `${group.category.emoji} ` : ''}
                  {group.category.name}
                </h2>

                <ul className="grid gap-3 sm:grid-cols-2">
                  {group.items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      brandColor={store.brandColor}
                      closed={closed}
                      onAdd={() => quickAdd(product)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {/* ── Promoções ── */}
        {promos.length > 0 && (
          <section id="promocoes" className="mt-9">
            <h2 className="mb-1 text-[1.05rem] font-extrabold text-ink-900">
              Promoções de hoje
            </h2>
            <p className="mb-3 text-[0.78rem] text-ink-500">
              {promos.length === 1
                ? '1 produto com desconto no cardápio'
                : `${promos.length} produtos com desconto no cardápio`}
            </p>

            <ul className="grid gap-3 sm:grid-cols-2">
              {promos.map((product) => (
                <ProductCard
                  key={`promo-${product.id}`}
                  product={product}
                  brandColor={store.brandColor}
                  closed={closed}
                  onAdd={() => quickAdd(product)}
                />
              ))}
            </ul>
          </section>
        )}

        {/* ── Combos ── */}
        {combos.length > 0 && (
          <section id="combos" className="mt-9">
            <h2 className="mb-1 text-[1.05rem] font-extrabold text-ink-900">Combos</h2>
            <p className="mb-3 text-[0.78rem] text-ink-500">
              Conjuntos montados pela loja, com preço fechado.
            </p>

            <ul className="grid gap-3 sm:grid-cols-2">
              {combos.map((product) => (
                <ProductCard
                  key={`combo-${product.id}`}
                  product={product}
                  brandColor={store.brandColor}
                  closed={closed}
                  onAdd={() => quickAdd(product)}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ── Barra da sacola ── */}
      {itemCount > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto max-w-[1180px] px-4 pb-1 sm:px-5">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-full px-5 py-3.5 text-white shadow-lg transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: store.brandColor }}
          >
            <span className="text-[0.86rem] font-bold">
              {itemCount} {itemCount === 1 ? 'item' : 'itens'} na sacola
            </span>
            <span className="text-[0.9rem] font-extrabold">{formatBRL(total)}</span>
          </button>
        </div>
      )}

      {/* ── Personalizar produto ── */}
      {customizing && (
        <CustomizeModal
          product={customizing}
          onClose={() => setCustomizing(null)}
          onAdd={(line) => {
            addLine(line);
            setCustomizing(null);
          }}
        />
      )}

      {/* ── Sacola ── */}
      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Sua sacola"
        subtitle={store.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCartOpen(false)}>
              Continuar comprando
            </Button>
            <Button
              disabled={closed || belowMinimum || cart.length === 0}
              onClick={() => {
                setCartOpen(false);
                setCheckoutOpen(true);
              }}
            >
              Finalizar pedido
            </Button>
          </>
        }
      >
        {cart.length === 0 ? (
          <p className="py-6 text-center text-[0.86rem] text-ink-500">Sua sacola está vazia.</p>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-2.5">
              {cart.map((line) => (
                <li key={line.key} className="flex items-start gap-3 border-b border-ink-100 pb-2.5">
                  <ProductThumb
                    customImageUrl={line.customImageUrl}
                    globalImageUrl={line.globalImageUrl}
                    basePath={line.basePath}
                    emoji={line.emoji}
                    alt={line.name}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.84rem] font-semibold text-ink-900">{line.name}</p>
                    {line.variationName && (
                      <p className="text-[0.72rem] text-ink-500">{line.variationName}</p>
                    )}
                    {line.addonNames.length > 0 && (
                      <p className="text-[0.72rem] text-ink-500">+ {line.addonNames.join(', ')}</p>
                    )}
                    {line.notes && (
                      <p className="text-[0.72rem] italic text-ink-400">{line.notes}</p>
                    )}
                    <p className="mt-0.5 text-[0.8rem] font-bold text-ink-800">
                      {formatBRL(line.unitPrice * line.quantity)}
                    </p>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => changeQuantity(line.key, -1)}
                      className="h-7 w-7 rounded-full border border-ink-200 text-ink-600 hover:bg-ink-100"
                      aria-label={`Diminuir ${line.name}`}
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-[0.82rem] font-bold">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => changeQuantity(line.key, 1)}
                      className="h-7 w-7 rounded-full border border-ink-200 text-ink-600 hover:bg-ink-100"
                      aria-label={`Aumentar ${line.name}`}
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="space-y-1 text-[0.82rem]">
              <div className="flex justify-between">
                <dt className="text-ink-500">Subtotal</dt>
                <dd className="font-semibold text-ink-800">{formatBRL(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Entrega</dt>
                <dd className="font-semibold text-ink-800">
                  {deliveryType === 'PICKUP'
                    ? 'Retirada no local'
                    : deliveryFee > 0
                      ? formatBRL(deliveryFee)
                      : 'a combinar'}
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink-100 pt-1.5 text-[0.92rem]">
                <dt className="font-bold text-ink-900">Total</dt>
                <dd className="font-extrabold text-ink-900">{formatBRL(total)}</dd>
              </div>
            </dl>

            {belowMinimum && (
              <Alert tone="warn">
                {store.minimumOrder > 0
                  ? `Faltam ${formatBRL(missingForMinimum)} para atingir o pedido mínimo de ${formatBRL(store.minimumOrder)}.`
                  : 'O pedido mínimo ainda não foi atingido.'}
              </Alert>
            )}

            <p className="text-[0.7rem] leading-relaxed text-ink-400">
              O valor final é confirmado pela loja ao aceitar o pedido.
            </p>
          </div>
        )}
      </Modal>

      {/* ── Fechamento do pedido ── */}
      <Modal
        open={checkoutOpen && !order}
        onClose={() => setCheckoutOpen(false)}
        title="Finalizar pedido"
        subtitle={`Total ${formatBRL(total)} · a loja confirma em seguida`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCheckoutOpen(false)} disabled={sending}>
              Voltar
            </Button>
            <Button type="submit" form="checkout-form" loading={sending}>
              Enviar pedido
            </Button>
          </>
        }
      >
        <form id="checkout-form" action={submitOrder} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          {/* ── Modalidade ── */}
          {store.allowPickup && store.allowOwnDelivery && (
            <fieldset>
              <legend className="mb-1.5 block text-[0.78rem] font-semibold text-ink-700">
                Como você quer receber?
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton
                  active={deliveryType === 'DELIVERY'}
                  brandColor={store.brandColor}
                  onClick={() => setDeliveryType('DELIVERY')}
                  title="Entrega"
                  hint={
                    store.baseDeliveryFee > 0
                      ? `Taxa ${formatBRL(store.baseDeliveryFee)}`
                      : 'Combinada com a loja'
                  }
                  emoji="🛵"
                />
                <ChoiceButton
                  active={deliveryType === 'PICKUP'}
                  brandColor={store.brandColor}
                  onClick={() => setDeliveryType('PICKUP')}
                  title="Retirar no local"
                  hint="Sem taxa de entrega"
                  emoji="🏪"
                />
              </div>
            </fieldset>
          )}

          <Field label="Seu nome" required>
            <Input name="customerName" required minLength={2} maxLength={120} autoComplete="name" />
          </Field>

          <Field label="WhatsApp / telefone" required>
            <Input
              name="customerPhone"
              required
              inputMode="tel"
              placeholder="(11) 98888-0000"
              autoComplete="tel"
            />
          </Field>

          {deliveryType === 'DELIVERY' ? (
            <>
              <Field label="Endereço de entrega" required>
                <Input name="deliveryAddress" required minLength={5} maxLength={200} />
              </Field>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Field label="Número" className="mb-0">
                  <Input name="deliveryNumber" maxLength={20} />
                </Field>
                <Field label="Bairro" className="mb-0">
                  <Input name="deliveryDistrict" maxLength={120} />
                </Field>
                <Field label="Cidade" className="mb-0">
                  <Input name="deliveryCity" maxLength={120} />
                </Field>
              </div>

              <p className="text-[0.72rem] leading-relaxed text-ink-400">
                A taxa mostrada é uma prévia. O valor final é calculado pela loja no momento do
                pedido; se o endereço estiver fora da área atendida, a loja entra em contato pelo
                telefone informado.
              </p>
            </>
          ) : (
            <p className="rounded border-2 border-ink-100 bg-ink-50 px-4 py-3 text-[0.78rem] leading-relaxed text-ink-600">
              Você escolheu <strong>retirar no local</strong>. Sem taxa de entrega.
              {store.address ? (
                <>
                  {' '}
                  Endereço: {store.address}
                  {store.district ? ` — ${store.district}` : ''}
                  {store.city ? `, ${store.city}` : ''}
                  {store.state ? `/${store.state}` : ''}.
                </>
              ) : null}
            </p>
          )}

          <Field label="Forma de pagamento" required>
            <Select
              name="paymentMethod"
              required
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="CASH">Dinheiro</option>
              <option value="PIX">PIX</option>
              <option value="CREDIT_CARD">Cartão de crédito na entrega</option>
              <option value="DEBIT_CARD">Cartão de débito na entrega</option>
            </Select>
          </Field>

          {/* Troco só em dinheiro — em PIX/cartão não existe troco a dar. */}
          {paymentMethod === 'CASH' && (
            <Field
              label="Precisa de troco para quanto?"
              hint="Deixe em branco se não precisar de troco."
              className="mb-0"
            >
              <Input
                name="changeFor"
                inputMode="decimal"
                placeholder="Ex.: 100,00"
                maxLength={10}
              />
            </Field>
          )}

          <Field label="Observações" className="mb-0">
            <Textarea
              name="notes"
              rows={2}
              maxLength={300}
              placeholder="Sem cebola, ponto da carne..."
            />
          </Field>

          <p className="text-[0.72rem] leading-relaxed text-ink-400">
            O valor final é calculado pelo sistema da loja no momento do pedido. Nenhum pagamento é
            processado por este site — o acerto é feito direto com o estabelecimento.
          </p>
        </form>
      </Modal>

      {/* ── Pedido criado ── */}
      <Modal
        open={Boolean(order)}
        onClose={() => setOrder(null)}
        title="Pedido enviado"
        subtitle={order ? `Pedido #${order.displayId}` : undefined}
        footer={
          <>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm border-2 border-ink-200 bg-white px-4 py-2.5 text-[0.84rem] font-semibold text-ink-700 transition-all hover:border-brand hover:text-brand"
              >
                Falar com a loja
              </a>
            )}
            <Button onClick={() => setOrder(null)}>Continuar navegando</Button>
          </>
        }
      >
        {order && (
          <div className="space-y-3">
            <div className="rounded border-2 border-success/25 bg-success-bg px-4 py-3 text-[0.84rem] text-success">
              <p className="font-bold">
                {order.customerName ? `${order.customerName}, seu pedido` : 'Seu pedido'} foi
                recebido pela loja.
              </p>
              <p className="mt-1 leading-relaxed">
                Total {formatBRL(order.total)} ·{' '}
                {order.deliveryType === 'PICKUP' ? 'retirada no local' : 'entrega no endereço'}.
              </p>
            </div>

            <dl className="space-y-1.5 text-[0.82rem]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Número do pedido</dt>
                <dd className="font-bold text-ink-800">#{order.displayId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Total</dt>
                <dd className="font-bold text-ink-800">{formatBRL(order.total)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Pagamento</dt>
                <dd className="font-bold text-ink-800">
                  {PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Entrega</dt>
                <dd className="max-w-[60%] text-right font-bold text-ink-800">
                  {order.deliveryType === 'PICKUP' ? 'Retirada no local' : 'Entrega'}
                </dd>
              </div>
              {order.addressLine ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Endereço</dt>
                  <dd className="max-w-[60%] text-right font-bold text-ink-800">
                    {order.addressLine}
                  </dd>
                </div>
              ) : null}
              {order.changeFor ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Troco para</dt>
                  <dd className="font-bold text-ink-800">{formatBRL(order.changeFor)}</dd>
                </div>
              ) : null}
            </dl>

            <p className="text-[0.76rem] leading-relaxed text-ink-500">
              A loja vai confirmar o pedido em instantes.
              {store.whatsapp
                ? ' Se precisar falar com o estabelecimento, use o botão abaixo — o pedido já está registrado no sistema da loja.'
                : ' Acompanhe pelo telefone informado.'}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Link do WhatsApp com o número do pedido na mensagem. */
function buildWhatsAppHref(
  whatsapp: string | null,
  storeName: string,
  displayId?: number,
): string | null {
  const digits = String(whatsapp ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  const text = displayId
    ? `Olá! Fiz o pedido #${displayId} em ${storeName} e gostaria de falar sobre ele.`
    : `Olá! Gostaria de falar com ${storeName}.`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}

function CategoryChip({
  active,
  brandColor,
  onClick,
  children,
}: {
  active: boolean;
  brandColor: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[0.78rem] font-semibold transition-all',
        active ? 'border-transparent text-white' : 'border-ink-200 bg-white text-ink-600',
      )}
      style={active ? { backgroundColor: brandColor } : undefined}
    >
      {children}
    </button>
  );
}

function ChoiceButton({
  active,
  brandColor,
  onClick,
  title,
  hint,
  emoji,
}: {
  active: boolean;
  brandColor: string;
  onClick: () => void;
  title: string;
  hint: string;
  emoji: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded border-2 px-3 py-2.5 text-left transition-all',
        active ? 'border-transparent' : 'border-ink-200 bg-white',
      )}
      style={active ? { backgroundColor: `${brandColor}14`, borderColor: brandColor } : undefined}
    >
      <span className="block text-[0.82rem] font-bold text-ink-800">
        <span aria-hidden="true">{emoji} </span>
        {title}
      </span>
      <span className="mt-0.5 block text-[0.7rem] text-ink-500">{hint}</span>
    </button>
  );
}

/**
 * Card do produto.
 *
 * Produto indisponível CONTINUA visível, mas com o botão bloqueado. Sumir
 * com ele faria o cliente procurar por algo que a loja vende e concluir que
 * a loja não tem — pior do que dizer "indisponível agora".
 */
function ProductCard({
  product,
  brandColor,
  closed,
  onAdd,
}: {
  product: StoreProduct;
  brandColor: string;
  closed: boolean;
  onAdd: () => void;
}) {
  const price = effectivePrice(product);
  const onPromo = product.promotionalPrice != null && product.promotionalPrice < product.price;
  /**
   * Esgotado por QUALQUER um dos dois motivos: o lojista pausou o item
   * (`available: false`) ou o estoque acabou. Os dois dão no mesmo para
   * quem está comprando, e o servidor recusa os dois — o botão precisa
   * dizer a mesma coisa que o servidor vai fazer.
   */
  const soldOut =
    !product.available || (product.trackStock && product.stock <= 0);
  const blocked = soldOut || closed;
  const separate = product.comboItems.length > 0 ? comboSeparateTotal(product.comboItems) : 0;
  const savings = separate > 0 ? Math.round((separate - price) * 100) / 100 : 0;
  const isCombo = product.comboItems.length > 0;

  return (
    <li className="flex items-start gap-3 rounded-lg border border-ink-100 bg-white p-3">
      <ProductThumb
        customImageUrl={product.customImageUrl}
        globalImageUrl={product.globalImageUrl}
        basePath={product.basePath}
        emoji={product.emoji}
        alt={product.name}
        size={68}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[0.88rem] font-bold text-ink-900">{product.name}</p>
          {onPromo && !isCombo && (
            <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[0.62rem] font-extrabold uppercase text-danger">
              Promoção
            </span>
          )}
          {isCombo && (
            <span className="rounded-full bg-accent-bg px-2 py-0.5 text-[0.62rem] font-extrabold uppercase text-accent">
              Combo
            </span>
          )}
        </div>

        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-[0.75rem] text-ink-500">{product.description}</p>
        )}

        {isCombo && (
          <p className="mt-1 text-[0.72rem] leading-relaxed text-ink-500">
            {product.comboItems
              .map((item) => `${item.quantity}× ${item.name}`)
              .join(' · ')}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
          <span className="text-[0.9rem] font-extrabold text-ink-900">{formatBRL(price)}</span>
          {(onPromo || isCombo) && separate > price && (
            <span className="text-[0.76rem] text-ink-400 line-through">
              {formatBRL(onPromo ? product.price : separate)}
            </span>
          )}
          {isCombo && savings > 0 && (
            <span className="text-[0.7rem] font-bold text-success">
              economize {formatBRL(savings)}
            </span>
          )}
        </div>

        <Button
          size="sm"
          className="mt-2"
          disabled={blocked}
          onClick={onAdd}
          style={!blocked ? { backgroundColor: brandColor } : undefined}
        >
          {soldOut ? 'Indisponível' : closed ? 'Loja fechada' : 'Adicionar'}
        </Button>
      </div>
    </li>
  );
}

/**
 * Escolha de variação e adicionais.
 *
 * O preço mostrado é calculado aqui só para o cliente acompanhar. O que é
 * enviado ao servidor são os IDS — nenhum valor. O servidor soma de novo, a
 * partir do banco, e é essa soma que vira o pedido.
 */
function CustomizeModal({
  product,
  onClose,
  onAdd,
}: {
  product: StoreProduct;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [variationId, setVariationId] = React.useState(product.variations[0]?.id ?? '');
  const [addonIds, setAddonIds] = React.useState<Set<string>>(new Set());
  const [notes, setNotes] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const variation = product.variations.find((v) => v.id === variationId);

  /**
   * Teto de quantidade desta linha.
   *
   * Com controle de estoque, o teto é o próprio saldo: deixar o cliente
   * pedir 10 de um item que tem 3 só empurraria a recusa para o fim do
   * checkout, depois de ele já ter preenchido nome, telefone e endereço.
   */
  const hasStockLimit = product.trackStock && product.stock > 0;
  const maxQuantity = hasStockLimit ? Math.min(99, product.stock) : 99;

  const addonTotal = product.addonGroups.reduce((sum, group) => {
    return (
      sum +
      group.addons
        .filter((addon) => addonIds.has(addon.id))
        .reduce((groupSum, addon) => groupSum + addon.price, 0)
    );
  }, 0);

  const unitPrice = effectivePrice(product) + (variation?.priceAdjustment ?? 0) + addonTotal;

  function toggleAddon(groupId: string, addonId: string) {
    const group = product.addonGroups.find((g) => g.id === groupId);
    if (!group) return;

    setAddonIds((current) => {
      const next = new Set(current);
      if (next.has(addonId)) {
        next.delete(addonId);
        return next;
      }
      // Respeita o máximo do grupo: marcar além do limite substitui o mais
      // antigo, em vez de aceitar silenciosamente e o servidor recusar depois.
      const chosenInGroup = group.addons.filter((a) => next.has(a.id));
      if (chosenInGroup.length >= group.maxSelections) {
        if (group.maxSelections === 1) {
          chosenInGroup.forEach((a) => next.delete(a.id));
        } else {
          next.delete(chosenInGroup[0].id);
        }
      }
      next.add(addonId);
      return next;
    });
  }

  function confirm() {
    // Grupo obrigatório sem escolha é recusado aqui para o cliente não mandar
    // um pedido que o servidor vai rejeitar.
    for (const group of product.addonGroups) {
      if (!group.required) continue;
      const chosen = group.addons.filter((a) => addonIds.has(a.id)).length;
      if (chosen < Math.max(1, group.minSelections)) {
        setLocalError(
          `Escolha ao menos ${Math.max(1, group.minSelections)} opção(ões) em "${group.name}".`,
        );
        return;
      }
    }

    /**
     * Só entram no que é enviado os adicionais que a lista realmente
     * ofereceu. Se um adicional foi desativado na loja entre o carregamento
     * da página e este clique, marcá-lo aqui mandaria um id que o servidor
     * descarta em silêncio — o cliente acharia que pediu e não viria.
     */
    const offeredAddons = product.addonGroups.flatMap((group) => group.addons);
    const chosenAddons = offeredAddons.filter((addon) => addonIds.has(addon.id));

    onAdd({
      key: `${product.id}|${variationId}|${chosenAddons.map((a) => a.id).sort().join(',')}`,
      productId: product.id,
      name: product.name,
      emoji: product.emoji,
      customImageUrl: product.customImageUrl,
      globalImageUrl: product.globalImageUrl,
      basePath: product.basePath,
      unitPrice,
      // O teto é reaplicado aqui, não só no botão: o número pode ter sido
      // digitado antes de a lista recarregar.
      quantity: Math.min(maxQuantity, Math.max(1, quantity)),
      variationId: variationId || undefined,
      variationName: variation?.name,
      addonIds: chosenAddons.map((a) => a.id),
      addonNames: chosenAddons.map((a) => a.name),
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={product.name}
      subtitle={formatBRL(unitPrice)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirm}>
            Adicionar {quantity > 1 ? `${quantity} · ` : '· '}
            {formatBRL(unitPrice * quantity)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {localError && <Alert tone="danger">{localError}</Alert>}

        {/*
          Foto e descrição no detalhe: o card da lista já mostra as duas,
          mas quem abriu o modal está decidindo a compra — e é aqui que a
          descrição longa importa. A precedência de imagem é a mesma da
          lista, resolvida pelo ProductThumb.
        */}
        {(product.customImageUrl || product.globalImageUrl || product.description) && (
          <div className="flex items-start gap-3.5">
            {(product.customImageUrl || product.globalImageUrl) && (
              <ProductThumb
                customImageUrl={product.customImageUrl}
                globalImageUrl={product.globalImageUrl}
                basePath={product.basePath}
                emoji={product.emoji}
                alt={product.name}
                size={92}
              />
            )}
            {product.description && (
              <p className="min-w-0 flex-1 text-[0.82rem] leading-relaxed text-ink-600">
                {product.description}
              </p>
            )}
          </div>
        )}

        {isOnPromo(product) && (
          <p className="text-[0.82rem]">
            <span className="text-ink-400 line-through">{formatBRL(product.price)}</span>{' '}
            <span className="font-bold text-danger">
              por {formatBRL(effectivePrice(product))}
            </span>
          </p>
        )}

        {product.comboItems.length > 0 && (
          <div>
            <p className="mb-1.5 text-[0.78rem] font-bold text-ink-800">O que vem neste combo</p>
            <ul className="space-y-1 text-[0.8rem] text-ink-600">
              {product.comboItems.map((item) => (
                <li key={item.productId}>
                  {item.quantity}× {item.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {product.variations.length > 0 && (
          <div>
            <p className="mb-1.5 text-[0.78rem] font-bold text-ink-800">Escolha uma opção</p>
            <div className="space-y-1.5">
              {product.variations.map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded border-2 px-3 py-2 text-[0.82rem]',
                    variationId === option.id ? 'border-brand bg-brand-light/30' : 'border-ink-100',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="variation"
                      checked={variationId === option.id}
                      onChange={() => setVariationId(option.id)}
                      className="h-4 w-4 accent-[var(--orange)]"
                    />
                    {option.name}
                  </span>
                  {option.priceAdjustment !== 0 && (
                    <span className="text-[0.76rem] font-semibold text-ink-500">
                      {option.priceAdjustment > 0 ? '+' : ''}
                      {formatBRL(option.priceAdjustment)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {product.addonGroups.map((group) => (
          <div key={group.id}>
            <p className="mb-1.5 text-[0.78rem] font-bold text-ink-800">
              {group.name}
              <span className="ml-1.5 font-normal text-ink-400">
                {group.required ? 'obrigatório' : 'opcional'}
                {group.maxSelections > 1 ? ` · até ${group.maxSelections}` : ''}
              </span>
            </p>
            <div className="space-y-1.5">
              {group.addons.map((addon) => (
                <label
                  key={addon.id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded border-2 px-3 py-2 text-[0.82rem]',
                    addonIds.has(addon.id) ? 'border-brand bg-brand-light/30' : 'border-ink-100',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={addonIds.has(addon.id)}
                      onChange={() => toggleAddon(group.id, addon.id)}
                      className="h-4 w-4 accent-[var(--orange)]"
                    />
                    {addon.name}
                  </span>
                  {addon.price > 0 && (
                    <span className="text-[0.76rem] font-semibold text-ink-500">
                      +{formatBRL(addon.price)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}

        {/*
          Quantidade no detalhe.
          Só aparece quando há mais de uma unidade a escolher: com uma
          única unidade em estoque o seletor não teria o que fazer.
        */}
        {product.trackStock && product.stock <= 1 ? (
          <p className="text-[0.76rem] text-ink-500">
            {product.stock === 1 ? 'Última unidade disponível.' : 'Sem estoque.'}
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
            <span className="text-[0.78rem] font-bold text-ink-800">Quantidade</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="h-8 w-8 rounded-full border border-ink-200 text-ink-600 transition-all hover:bg-ink-100 disabled:opacity-40"
                aria-label="Diminuir quantidade"
              >
                −
              </button>
              <span className="w-7 text-center text-[0.86rem] font-bold text-ink-900">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                disabled={quantity >= maxQuantity}
                className="h-8 w-8 rounded-full border border-ink-200 text-ink-600 transition-all hover:bg-ink-100 disabled:opacity-40"
                aria-label="Aumentar quantidade"
              >
                +
              </button>
            </div>
          </div>
        )}

        <Field label="Alguma observação?" className="mb-0">
          <Textarea
            rows={2}
            maxLength={200}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sem cebola, bem passado..."
          />
        </Field>
      </div>
    </Modal>
  );
}
