'use client';
import {parseMoneyInput} from '@/lib/money-input';
import { OnlineChargeBox } from '@/components/store/OnlineChargeBox';

import * as React from 'react';
import { cn, formatBRL } from '@/lib/utils';
import { checkoutAction } from '@/app/actions/orders';
import { Alert, Button, Field, Input, MoneyInput, Modal, Select, Textarea } from '@/components/ui';
import { ProductThumb } from '@/components/catalog/ProductThumb';
import { CustomerCheckoutAccess } from '@/components/customer/CustomerStoreAccess';
import { saveCheckoutAddressAction } from '@/app/actions/customer-portal';
import { quoteDeliveryAction, type DeliveryQuote } from '@/app/actions/geo';
import { StoreHeader } from '@/components/store/StoreHeader';
import { STORE_OPEN_STATE_LABEL, type StoreOpenState } from '@/lib/schedule';
import type { BusinessType } from '@prisma/client';
import { groupPublishedStoreProducts } from '@/lib/store-catalog-groups';
import { Check, Plus, Share2 } from 'lucide-react';
import { storefrontCategoryView, type StorefrontCategories } from '@/lib/storefront-categories';
import { whatsappDigits } from '@/lib/whatsapp';
import { DeliveryPinPicker } from './DeliveryPinPicker';

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
  allowNewOrders?: boolean;
  benefitsAvailable?: boolean;
  /** Loja com pagamento online (Pix/cartão) ativo e utilizável. */
  onlinePayment?: boolean;
  commercialMessage?: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
 * a dúvida de se pagou a mesma coisa. Pagamento online só aparece quando
 * a loja ativou sua conta de cobrança; o resto é acertado na entrega.
 */
const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito na entrega',
  DEBIT_CARD: 'Cartão de débito na entrega',
  ONLINE_PIX: 'Pix online (pago agora)',
  ONLINE_CARD: 'Cartão online (pago agora)',
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

/** Loja atual, para o botão de compartilhar de cada produto. */
const StoreShareContext = React.createContext<{ slug: string; name: string } | null>(null);
/** Quantas unidades de cada produto já estão na sacola (para o selo do card). */
const CartQtyContext = React.createContext<Map<string, number>>(new Map());

/**
 * Compartilha o link do produto (abre direto o produto na loja). Usa o
 * compartilhamento nativo do celular quando existe; senão, o WhatsApp.
 */
async function shareProduct(product: StoreProduct, store: { slug: string; name: string }) {
  const url = `${window.location.origin}/loja/${store.slug}?produto=${encodeURIComponent(product.id)}`;
  const text = `${product.name} por ${formatBRL(effectivePrice(product))} em ${store.name}`;
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ title: product.name, text, url }); return; }
    catch (error) { if ((error as DOMException)?.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener,noreferrer');
}

export function StoreCatalog({
  store,
  categories,
  products,
  sections,
  hero,
  transitionBanners=[],
  categoryConfig={nav:null,showAll:null},
}: {
  store: StoreInfo;
  categories: Array<{ id: string; name: string; slug: string; emoji: string | null }>;
  products: StoreProduct[];
  /** Seções que existem de fato nesta loja — o menu não mostra âncora vazia. */
  sections: Array<{ id: string; label: string }>;
  hero?: React.ReactNode;
  /** Categorias na navegação e em "Mostrar todos" (configuradas pela loja). */
  categoryConfig?: StorefrontCategories;
  transitionBanners?: Array<{id:string;placement:string;imagePath:string;title:string|null;subtitle:string|null;linkUrl:string|null;cta?:string|null;focusX?:number;focusY?:number}>;
}) {
  const [search, setSearch] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState('all');
  const [categoriesOpen, setCategoriesOpen] = React.useState(false);
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const cartQty = React.useMemo(() => { const m = new Map<string, number>(); for (const l of cart) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity); return m; }, [cart]);
  const [customizing, setCustomizing] = React.useState<StoreProduct | null>(null);
  const [linkedVariation,setLinkedVariation] = React.useState<{productId:string;variationId:string}|null>(null);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('produto');
    if (!productId) return;
    const product = products.find(item => item.id === productId);
    if (product) {
      const variationId=params.get('variacao');
      if(variationId&&product.variations.some(v=>v.id===variationId))setLinkedVariation({productId:product.id,variationId});
      setCustomizing(product);
    }
  }, [store.slug, products]);
  const shareStore = React.useMemo(() => ({ slug: store.slug, name: store.name }), [store.slug, store.name]);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 3500);
    return () => window.clearTimeout(timer);
  }, [success]);
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
    orderId: string;
    displayId: number;
    total: number;
    discount?: number;
    deliveryFee?: number;
    deliveryType: 'DELIVERY' | 'PICKUP';
    paymentMethod: string;
    changeFor?: number;
    customerName: string;
    addressLine?: string;
    payment?: { invoiceUrl: string | null; pixPayload: string | null; pixImage: string | null; billingType: string } | null;
    paymentError?: string;
  } | null>(null);
  const [pixCopied, setPixCopied] = React.useState(false);
  const [deliveryUf, setDeliveryUf] = React.useState(store.state ?? '');
  const online = paymentMethod === 'ONLINE_PIX' || paymentMethod === 'ONLINE_CARD';

  const closed = store.openState !== 'OPEN';
  const commercialBlocked = store.allowNewOrders === false;
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

  // Volta do login/cadastro iniciado no checkout (?finalizar=1): a sacola
  // salva neste dispositivo é reaberta direto na finalização.
  const resumedCheckout = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated || resumedCheckout.current) return;
    resumedCheckout.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get('finalizar') !== '1') return;
    url.searchParams.delete('finalizar');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    if (cart.length > 0) setCheckoutOpen(true);
  }, [hydrated, cart.length]);

  // Link de sacola enviado pelo atendimento (?sacola=produto[.variação]:qtd,...):
  // monta a sacola com os preços atuais do catálogo e abre para conferência.
  // Nada é enviado à loja até o cliente finalizar no checkout.
  const loadedLink = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated || loadedLink.current) return;
    loadedLink.current = true;
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('sacola');
    if (!raw) return;
    url.searchParams.delete('sacola');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    const lines: CartLine[] = [];
    for (const entry of raw.split(',').slice(0, 10)) {
      const [ref, qty] = entry.split(':');
      const [productId, variationId] = (ref ?? '').split('.');
      const product = products.find((p) => p.id === productId);
      if (!product || !product.available || (product.trackStock && product.stock <= 0)) continue;
      const variation = variationId ? product.variations.find((v) => v.id === variationId) : undefined;
      if ((variationId && !variation) || (!variation && product.type === 'VARIATION' && product.variations.length > 0)) continue;
      const quantity = Math.min(20, Math.max(1, Number.parseInt(qty ?? '1', 10) || 1));
      lines.push({
        key: variation ? `${product.id}|${variation.id}|` : `${product.id}|`,
        productId: product.id,
        name: product.name,
        emoji: product.emoji,
        customImageUrl: product.customImageUrl,
        globalImageUrl: product.globalImageUrl,
        basePath: product.basePath,
        unitPrice: effectivePrice(product) + (variation?.priceAdjustment ?? 0),
        quantity,
        variationId: variation?.id,
        variationName: variation?.name,
        addonIds: [],
        addonNames: [],
      });
    }
    if (lines.length) {
      setCart(lines);
      setCartOpen(true);
    } else setError('Os itens do link não estão mais disponíveis. Escolha no cardápio.');
  }, [hydrated, products]);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // Modo privativo pode recusar a escrita; a compra segue funcionando.
    }
  }, [cart, hydrated, storageKey]);

  const categoryView = React.useMemo(() => storefrontCategoryView(categories, categoryConfig), [categories, categoryConfig]);
  const hiddenCategories = React.useMemo(() => new Set(categoryView.hidden.map((c) => c.id)), [categoryView]);
  const showAllCategories = React.useMemo(() => new Set(categoryView.showAll.map((c) => c.id)), [categoryView]);
  const visible = React.useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return products.filter((product) => {
      // Categoria oculta pela loja: o produto continua existindo (e abre por link), só não é listado.
      if (product.categoryId && hiddenCategories.has(product.categoryId)) return false;
      if (activeCategory !== 'all' && product.categoryId !== activeCategory) return false;
      if (activeCategory === 'all' && !term && product.categoryId && categories.some((c) => c.id === product.categoryId) && !showAllCategories.has(product.categoryId)) return false;
      if (!term) return true;
      const categoryName =
        categories.find((category) => category.id === product.categoryId)?.name ?? '';
      return `${product.name} ${product.description ?? ''} ${categoryName}`
        .toLowerCase()
        .includes(term);
    });
  }, [products, debouncedSearch, activeCategory, categories, hiddenCategories, showAllCategories]);

  const grouped = React.useMemo(() => groupPublishedStoreProducts(visible, categories), [visible, categories]);

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
  // Prévia do frete pela mesma regra do servidor, assim que o ponto é marcado.
  const [quote, setQuote] = React.useState<Extract<DeliveryQuote, { ok: true }> | null>(null);
  const quoteTicket = React.useRef(0);
  const requestQuote = React.useCallback((point: { latitude: number; longitude: number } | null) => {
    const ticket = ++quoteTicket.current;
    if (!point) { setQuote(null); return; }
    void quoteDeliveryAction({ slug: store.slug, latitude: point.latitude, longitude: point.longitude }).then((result) => {
      if (ticket === quoteTicket.current) setQuote(result.ok ? result : null);
    }).catch(() => undefined);
  }, [store.slug]);
  const deliveryFee =
    cart.length > 0 && deliveryType === 'DELIVERY' ? quote?.fee ?? store.baseDeliveryFee : 0;
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

  const checkoutRequest = React.useRef<string | null>(null);
  const checkoutFormRef = React.useRef<HTMLFormElement>(null);
  const [noNumber, setNoNumber] = React.useState(false);
  const coord = (value: FormDataEntryValue | null) => { const n = typeof value === 'string' && value.trim() ? Number(value) : NaN; return Number.isFinite(n) ? n : undefined; };
  const checkoutLocked = React.useRef(false);

  async function submitOrder(formData: FormData) {
    if (checkoutLocked.current) return;
    if (commercialBlocked) { setError(store.commercialMessage ?? 'Novos pedidos indisponíveis.'); return; }
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

    const changeRaw = String(formData.get('changeFor') ?? '');
    const changeFor = changeRaw.trim() ? parseMoneyInput(changeRaw)??NaN : undefined;
    if(changeFor!==undefined&&!Number.isFinite(changeFor)){setError('Informe um valor de troco válido.');setSending(false);return;}
    const payerDocument = online ? String(formData.get('payerDocument') ?? '').replace(/\D/g, '') : undefined;
    if (online && !/^(\d{11}|\d{14})$/.test(payerDocument ?? '')) { setError('Informe o CPF (11 números) ou CNPJ (14) de quem paga.'); setSending(false); return; }

    // Enviado ao servidor: produto, quantidade, variação e adicionais.
    // Nenhum preço. O total é recalculado lá.
    checkoutLocked.current = true;
    checkoutRequest.current ??= crypto.randomUUID();
    let result: Awaited<ReturnType<typeof checkoutAction>>;
    try {
      result = await checkoutAction({
      idempotencyKey: checkoutRequest.current,
      slug: store.slug,
      customerName: String(formData.get('customerName') ?? '').trim(),
      customerPhone: String(formData.get('customerPhone') ?? '').trim(),
      deliveryType,
      deliveryAddress: String(formData.get('deliveryAddress') ?? '').trim() || undefined,
      deliveryNumber: noNumber ? 'S/N' : String(formData.get('deliveryNumber') ?? '').trim() || undefined,
      deliveryDistrict: String(formData.get('deliveryDistrict') ?? '').trim() || undefined,
      deliveryCity: String(formData.get('deliveryCity') ?? '').trim() || undefined,
      deliveryLatitude: coord(formData.get('deliveryLatitude')),
      deliveryLongitude: coord(formData.get('deliveryLongitude')),
      deliveryReference: String(formData.get('deliveryReference') ?? '').trim() || undefined,
      paymentMethod: online ? 'ONLINE' : paymentMethod,
      onlineMethod: online ? (paymentMethod === 'ONLINE_PIX' ? 'PIX' : 'CREDIT_CARD') : undefined,
      payerDocument,
      changeFor: paymentMethod === 'CASH' && changeFor !== undefined && Number.isFinite(changeFor) ? changeFor : undefined,
      notes: String(formData.get('notes') ?? '').trim() || undefined,
      couponCode: String(formData.get('couponCode') ?? '').trim() || undefined,
      items: cart.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        variationId: line.variationId,
        addonIds: line.addonIds,
        notes: line.notes,
      })),
    });

    } catch {
      // The same idempotency key is reused on retry, so trying again never duplicates the order.
      setError(typeof navigator !== 'undefined' && !navigator.onLine
        ? 'Sem conexão com a internet. O pedido não foi enviado. Quando a conexão voltar, toque em Enviar pedido novamente.'
        : 'Não foi possível confirmar o pedido agora. Toque em Enviar pedido novamente; ele não será duplicado.');
      return;
    } finally {
      checkoutLocked.current = false;
      setSending(false);
    }

    if (!result.ok) {
      setError(result.error);
      return;
    }

    checkoutRequest.current = null;
    // "Salvar este endereço": grava na conta depois do pedido criado; uma falha
    // aqui não afeta a compra. Aguardado antes da confirmação: sair da página
    // (ex.: "Acompanhar pedido") cancelaria a gravação em andamento.
    if (deliveryType !== 'PICKUP' && formData.get('saveAddress') === 'on') {
      checkoutLocked.current = true; setSending(true);
      await saveCheckoutAddressAction({
        slug: store.slug,
        street: String(formData.get('deliveryAddress') ?? '').trim(),
        number: noNumber ? 'S/N' : String(formData.get('deliveryNumber') ?? '').trim(),
        district: String(formData.get('deliveryDistrict') ?? '').trim(),
        city: String(formData.get('deliveryCity') ?? '').trim(),
        state: String(formData.get('deliveryState') ?? '').trim(),
        latitude: coord(formData.get('deliveryLatitude')),
        longitude: coord(formData.get('deliveryLongitude')),
        reference: String(formData.get('deliveryReference') ?? '').trim() || undefined,
        isDefault: formData.get('saveAsDefault') === 'on',
      }).catch(() => undefined);
      checkoutLocked.current = false; setSending(false);
    }
    // O carrinho só é limpo com o pedido REALMENTE gravado.
    setCart([]);
    setCheckoutOpen(false);
    setCartOpen(false);
    setSuccess(null);
    setOrder({
      orderId: result.data?.orderId ?? '',
      displayId: result.data?.displayId ?? 0,
      total: result.data?.total ?? 0,
      discount: result.data?.discount ?? 0,
      deliveryFee: result.data?.deliveryFee ?? 0,
      deliveryType,
      paymentMethod,
      changeFor: paymentMethod === 'CASH' ? changeFor : undefined,
      payment: result.data?.payment ?? null,
      paymentError: result.data?.paymentError,
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
    <StoreShareContext.Provider value={shareStore}><CartQtyContext.Provider value={cartQty}>
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

      {hero}
      <div id="cardapio" className="store-showcase mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-8 sm:py-12">
        {success && !order && (
          <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-24 left-4 right-4 z-[1100] mx-auto max-w-md rounded-xl bg-[#0B1F3A] px-4 py-3 text-sm font-medium text-white shadow-lg motion-safe:animate-fade-in">
            {success}
          </div>
        )}

        {commercialBlocked && <div className="mb-4"><Alert tone="warn" title="Pedidos temporariamente indisponíveis">{store.commercialMessage}</Alert></div>}
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
        <div className="store-catalog-tools mb-5 space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no cardápio..."
            aria-label="Buscar no cardápio"
            type="search"
          />

          {categoryView.nav.length > 1 && (
            <button
              type="button"
              onClick={() => setCategoriesOpen(true)}
              className="flex min-h-12 w-full items-center justify-between rounded-xl border border-ink-200 bg-white px-4 text-left sm:hidden"
              aria-haspopup="dialog"
              data-testid="category-menu-button"
            >
              <span className="min-w-0"><span className="block text-[0.7rem] font-bold uppercase tracking-wider text-ink-400">Categorias</span><span className="block truncate text-[0.92rem] font-semibold text-ink-900">{activeCategory === 'all' ? 'Mostrar todos' : categoryView.nav.find((c) => c.id === activeCategory)?.name ?? 'Mostrar todos'}</span></span>
              <span aria-hidden className="text-ink-400">▾</span>
            </button>
          )}
          {categoryView.nav.length > 1 && (
            <div
              className="-mx-1 hidden gap-2 overflow-x-auto px-1 pb-1 sm:flex"
              role="group"
              aria-label="Filtrar por categoria"
            >
              <CategoryChip
                active={activeCategory === 'all'}
                brandColor={store.brandColor}
                onClick={() => setActiveCategory('all')}
              >
                Mostrar todos
              </CategoryChip>
              {categoryView.nav.map((category) => (
                <CategoryChip
                  key={category.id}
                  active={activeCategory === category.id}
                  brandColor={store.brandColor}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {category.name}
                </CategoryChip>
              ))}
            </div>
          )}
        </div>

        <div className="store-showcase-heading">
          <span>Cardápio</span>
          <h2>{activeCategory === 'all' ? 'Todos os produtos' : categoryView.nav.find((c) => c.id === activeCategory)?.name ?? 'Todos os produtos'}</h2>
          <p>Preços e disponibilidade atualizados pela loja.</p>
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
              <section className="store-category-section" key={group.category.id} id={`cat-${group.category.slug}`}>
                {transitionBanners.filter(b=>b.placement===`transition:${group.category.id}`).map(banner=><CategoryBanner key={banner.id} banner={banner} />)}
                <div className="store-category-heading">
                  <h2>{group.category.name}</h2>
                  <span>{group.items.length} {group.items.length === 1 ? 'produto' : 'produtos'}</span>
                </div>

                <CategoryProducts products={group.items} categoryName={group.category.name} brandColor={store.brandColor} closed={closed} onAdd={quickAdd} onOpen={setCustomizing} />
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

            <ul className="store-product-grid">
              {promos.map((product) => (
                <ProductCard
                  key={`promo-${product.id}`}
                  product={product}
                  brandColor={store.brandColor}
                  closed={closed}
                  onAdd={() => quickAdd(product)}
                  onOpen={() => setCustomizing(product)}
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

            <ul className="store-product-grid">
              {combos.map((product) => (
                <ProductCard
                  key={`combo-${product.id}`}
                  product={product}
                  brandColor={store.brandColor}
                  closed={closed}
                  onAdd={() => quickAdd(product)}
                  onOpen={() => setCustomizing(product)}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ── Barra da sacola ── */}
      {itemCount > 0 && (
        <div className="safe-bottom sticky bottom-4 z-30 mx-auto max-w-[1180px] px-4 pb-1 sm:px-5">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="store-cart-bar flex w-full items-center justify-between gap-3 rounded-full px-5 py-3.5 text-white shadow-lg transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: store.brandColor }}
          >
            <span className="text-[0.86rem] font-bold">
              {itemCount} {itemCount === 1 ? 'item' : 'itens'} na sacola
            </span>
            <span className="text-[0.9rem] font-extrabold">{formatBRL(total)}</span>
          </button>
        </div>
      )}

      {/* ── Menu de categorias (celular) ── */}
      <Modal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} title="Categorias">
        <div className="grid gap-1.5" role="list">
          {[{ id: 'all', name: 'Mostrar todos' }, ...categoryView.nav].map((category) => (
            <button
              key={category.id}
              type="button"
              role="listitem"
              onClick={() => { setActiveCategory(category.id); setCategoriesOpen(false); document.getElementById('cardapio')?.scrollIntoView({ block: 'start' }); }}
              className={cn('flex min-h-12 items-center justify-between rounded-xl px-4 text-left text-[0.95rem] font-semibold', activeCategory === category.id ? 'bg-brand-light text-brand' : 'text-ink-800 hover:bg-ink-50')}
            >
              {category.name}
              {activeCategory === category.id && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      </Modal>

      {/* ── Personalizar produto ── */}
      {customizing && (
        <CustomizeModal
          product={customizing}
          initialVariationId={linkedVariation?.productId===customizing.id?linkedVariation.variationId:undefined}
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
              disabled={closed || commercialBlocked || belowMinimum || cart.length === 0}
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
        <form
          id="checkout-form"
          ref={checkoutFormRef}
          // onSubmit instead of a form action: React resets action forms after every
          // submission, which would wipe the customer's data when the order fails.
          onSubmit={(event) => {
            event.preventDefault();
            void submitOrder(new FormData(event.currentTarget));
          }}
          className="space-y-4"
        >
          <CustomerCheckoutAccess slug={store.slug}/>
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
              <Field label="Rua / avenida" required>
                <Input name="deliveryAddress" required minLength={5} maxLength={200} autoComplete="address-line1" placeholder="Ex.: Rua das Flores" />
              </Field>

              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5">
                <Field label="Número" required className="mb-0">
                  <Input name="deliveryNumber" maxLength={20} required={!noNumber} disabled={noNumber} placeholder={noNumber ? 'S/N' : 'Ex.: 120'} inputMode="numeric" />
                </Field>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-ink-200 px-3 text-[0.8rem] font-semibold text-ink-700 has-[:checked]:border-brand has-[:checked]:bg-brand-light">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={noNumber} onChange={(e) => setNoNumber(e.target.checked)} /> Sem número
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <Field label="Bairro" required className="mb-0">
                  <Input name="deliveryDistrict" required minLength={2} maxLength={120} autoComplete="address-level3" />
                </Field>
                <Field label="Cidade" required className="mb-0">
                  <Input name="deliveryCity" required minLength={2} maxLength={120} defaultValue={store.city ?? ''} autoComplete="address-level2" />
                </Field>
              </div>

              {/* Controlado: com defaultValue o React 19 reaplica o valor a cada render e apagaria a UF vinda do mapa. */}
              <input type="hidden" name="deliveryState" value={deliveryUf} readOnly />
              <DeliveryPinPicker
                slug={store.slug}
                onPointChange={requestQuote}
                storeCenter={store.latitude != null && store.longitude != null ? { latitude: store.latitude, longitude: store.longitude } : null}
                readAddress={() => {
                  const form = checkoutFormRef.current;
                  if (!form) return '';
                  const v = (name: string) => String((form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '').trim();
                  return [v('deliveryAddress') && `${v('deliveryAddress')}${!noNumber && v('deliveryNumber') ? `, ${v('deliveryNumber')}` : ''}`, v('deliveryDistrict'), v('deliveryCity')].filter(Boolean).join(', ');
                }}
                onFields={(fields) => {
                  const form = checkoutFormRef.current;
                  if (!form) return;
                  const put = (name: string, value: string | null) => {
                    const input = form.elements.namedItem(name) as HTMLInputElement | null;
                    if (input && value && !input.value.trim() && !input.disabled) input.value = value;
                  };
                  put('deliveryAddress', fields.street);
                  put('deliveryNumber', fields.number);
                  put('deliveryDistrict', fields.district);
                  put('deliveryCity', fields.city);
                  if (fields.state) setDeliveryUf(fields.state);
                }}
              />

              {quote && (
                <p role="status" data-testid="delivery-quote" className={cn('-mt-1 mb-3 rounded-lg px-3 py-2 text-[0.8rem]', quote.outside ? 'bg-danger-bg font-semibold text-danger' : 'bg-ink-50 text-ink-700')}>
                  {quote.outside
                    ? `Este ponto está fora da área de entrega da loja${quote.distanceKm !== null ? ` (${quote.distanceKm.toLocaleString('pt-BR')} km)` : ''}. Escolha outro endereço ou retirada.`
                    : <>Taxa de entrega: <strong>{formatBRL(quote.fee)}</strong>{quote.distanceKm !== null ? ` · ${quote.distanceKm.toLocaleString('pt-BR')} km ${quote.distanceKind === 'street' ? 'pelas ruas' : 'em linha reta'}` : ''}</>}
                </p>
              )}

              <Field label="Observação para o entregador" hint="Opcional se você confirmou o ponto no mapa. Ex.: entrada pela escadaria, portão lateral, rua de trás, condomínio.">
                <Textarea name="deliveryReference" rows={2} maxLength={200} placeholder="Ex.: Portão azul ao lado da padaria" />
              </Field>

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
              {store.onlinePayment && <option value="ONLINE_PIX">Pagar online agora (Pix)</option>}
              {store.onlinePayment && <option value="ONLINE_CARD">Pagar online agora (cartão)</option>}
            </Select>
          </Field>
          {online && (
            <Field label="CPF ou CNPJ de quem paga" required hint="Exigido pelo emissor da cobrança. Os dados do cartão são digitados só na página segura do provedor.">
              <Input name="payerDocument" inputMode="numeric" autoComplete="off" maxLength={18} placeholder="Somente números" data-testid="payer-document" />
            </Field>
          )}

          {/* Troco só em dinheiro — em PIX/cartão não existe troco a dar. */}
          {paymentMethod === 'CASH' && (
            <Field
              label="Precisa de troco para quanto?"
              hint="Deixe em branco se não precisar de troco."
              className="mb-0"
            >
              <MoneyInput
                name="changeFor"
                inputMode="decimal"
                placeholder="Ex.: 100,00"
                maxLength={10}
              />
            </Field>
          )}

          <Field label="Cupom (opcional)"><Input name="couponCode" maxLength={40} placeholder="Código da campanha"/><p className="mt-1 text-xs text-ink-500">Benefícios e condições serão conferidos pela loja na confirmação. O total final é calculado no servidor.</p></Field>
          <Field label="Observações" className="mb-0">
            <Textarea
              name="notes"
              rows={2}
              maxLength={300}
              placeholder="Sem cebola, ponto da carne..."
            />
          </Field>

          <p className="text-[0.72rem] leading-relaxed text-ink-400">
            O valor final é calculado pelo sistema da loja no momento do pedido.
            {online ? ' A cobrança online é gerada com esse valor e confirmada automaticamente pelo provedor.' : ' O acerto é feito direto com o estabelecimento.'}
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

            {order.payment && <OnlineChargeBox charge={order.payment} copied={pixCopied} onCopy={() => { void navigator.clipboard?.writeText(order.payment?.pixPayload ?? '').then(() => setPixCopied(true)).catch(() => undefined); }} />}
            {order.paymentError && <p className="rounded border-2 border-warn/30 bg-warn-bg px-3 py-2 text-[0.8rem] text-ink-800" data-testid="payment-error">{order.paymentError}</p>}
            <a className="block rounded border-2 border-brand px-4 py-3 text-center font-semibold text-brand" href={`/loja/${store.slug}/pedido/${order.orderId}`}>
              Acompanhar pedido
            </a>
            {store.benefitsAvailable&&<a className="block text-center font-semibold text-brand" href={`/loja/${store.slug}/beneficios?pedido=${encodeURIComponent(order.orderId)}`}>Benefícios da loja</a>}
            <dl className="space-y-1.5 text-[0.82rem]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Número do pedido</dt>
                <dd className="font-bold text-ink-800">#{order.displayId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Total</dt>
                <dd className="font-bold text-ink-800">{formatBRL(order.total)}</dd>
              </div>
              {(order.discount??0)>0&&<div className="flex justify-between gap-4"><dt>Desconto da campanha</dt><dd>{formatBRL(order.discount??0)}</dd></div>}
              <div className="flex justify-between gap-4"><dt>Frete aplicado</dt><dd>{formatBRL(order.deliveryFee??0)}</dd></div>
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
    </CartQtyContext.Provider></StoreShareContext.Provider>
  );
}

/** Link do WhatsApp com o número do pedido na mensagem. */
function buildWhatsAppHref(
  whatsapp: string | null,
  storeName: string,
  displayId?: number,
): string | null {
  const digits = whatsappDigits(whatsapp);
  if (!digits) return null;
  const text = displayId
    ? `Olá! Fiz o pedido #${displayId} em ${storeName} e gostaria de falar sobre ele.`
    : `Olá! Gostaria de falar com ${storeName}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
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
        'store-category-chip flex-shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[0.78rem] font-semibold transition-all',
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
function CategoryBanner({banner}:{banner:{imagePath:string;title:string|null;subtitle:string|null;linkUrl:string|null;cta?:string|null;focusX?:number;focusY?:number}}){
  const [failed,setFailed]=React.useState(false);
  if(failed)return null;
  const title=banner.title?.trim(),subtitle=banner.subtitle?.trim();
  const hasText=Boolean(title||subtitle||banner.linkUrl);
  // Sem texto, só a imagem: nada de faixa ou espaço reservado vazio.
  const image=<img src={banner.imagePath} alt={title??''} loading="lazy" decoding="async" onError={()=>setFailed(true)} style={{objectPosition:`${banner.focusX??50}% ${banner.focusY??50}%`}} />;
  if(!hasText)return <aside className="store-category-banner is-image-only">{image}</aside>;
  return <aside className="store-category-banner">
    {image}
    <div>{title&&<p>{title}</p>}{subtitle&&<span>{subtitle}</span>}{banner.linkUrl&&<a href={banner.linkUrl} rel="noreferrer">{banner.cta||'Saiba mais'}</a>}</div>
  </aside>;
}

function CategoryProducts({products,categoryName,brandColor,closed,onAdd,onOpen}:{products:StoreProduct[];categoryName:string;brandColor:string;closed:boolean;onAdd:(product:StoreProduct)=>void;onOpen:(product:StoreProduct)=>void}) {
  const [expanded,setExpanded]=React.useState(false);
  const id=React.useId();
  const button=React.useRef<HTMLButtonElement>(null);
  const render=(product:StoreProduct)=><ProductCard key={product.id} product={product} brandColor={brandColor} closed={closed} onAdd={()=>onAdd(product)} onOpen={()=>onOpen(product)} />;
  return <>
    <ul className="store-product-grid">{products.slice(0,12).map(render)}</ul>
    {products.length>12&&<>
      <div className={`store-category-extra ${expanded?'is-expanded':''}`} id={id}>
        <ul className="store-product-grid">{products.slice(12).map(render)}</ul>
      </div>
      <button ref={button} type="button" className="store-category-more" aria-expanded={expanded} aria-controls={id} onClick={()=>{
        if(expanded&&button.current){const section=button.current.closest('section');if(section&&section.getBoundingClientRect().top<0)section.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
        setExpanded(value=>!value);
      }}>{expanded?'Ver menos':`Ver mais ${categoryName.toLocaleLowerCase('pt-BR')}`}</button>
    </>}
  </>;
}

function ProductCard({
  product,
  categoryName,
  brandColor,
  closed,
  onAdd,
  onOpen,
}: {
  product: StoreProduct;
  categoryName?: string;
  brandColor: string;
  closed: boolean;
  onAdd: () => void;
  onOpen: () => void;
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
  const blocked = soldOut;
  const separate = product.comboItems.length > 0 ? comboSeparateTotal(product.comboItems) : 0;
  const savings = separate > 0 ? Math.round((separate - price) * 100) / 100 : 0;
  const isCombo = product.comboItems.length > 0;
  const shareStore = React.useContext(StoreShareContext);

  const inCart = React.useContext(CartQtyContext).get(product.id) ?? 0;
  const needsChoice = (product.type === 'VARIATION' && product.variations.length > 0) || product.addonGroups.length > 0;
  const fromPrice = product.type === 'VARIATION' && product.variations.length > 0;
  const [added, setAdded] = React.useState(false);
  React.useEffect(() => { if (!added) return; const t = window.setTimeout(() => setAdded(false), 1400); return () => window.clearTimeout(t); }, [added]);
  const discount = onPromo ? Math.round((1 - price / product.price) * 100) : 0;
  const label = soldOut ? (!product.available ? 'Indisponível' : 'Esgotado') : added ? 'Adicionado' : needsChoice ? 'Escolher' : closed ? 'Adicionar para depois' : 'Adicionar';

  return (
    <li className={cn('store-product-card', soldOut && 'is-soldout')} style={{ '--store-brand': brandColor } as React.CSSProperties}>
      <div className="store-product-media">
        <button type="button" onClick={onOpen} className="store-product-photo" aria-label={`Ver detalhes de ${product.name}`}>
          <ProductThumb
            customImageUrl={product.customImageUrl}
            globalImageUrl={product.globalImageUrl}
            basePath={product.basePath}
            emoji={product.emoji}
            alt={product.name}
            size={240}
            className="store-product-thumb"
          />
        </button>
        <div className="store-product-badges" aria-hidden={soldOut ? undefined : true}>
          {soldOut ? <span className="store-badge is-muted">{!product.available ? 'Indisponível' : 'Esgotado'}</span>
            : <>
              {discount > 0 && <span className="store-badge is-sale">−{discount}%</span>}
              {isCombo && <span className="store-badge is-combo">Combo</span>}
            </>}
        </div>
        {shareStore && (
          <button type="button" onClick={() => void shareProduct(product, shareStore)} aria-label={`Compartilhar ${product.name}`} title="Compartilhar" className="store-product-share">
            <Share2 size={15} aria-hidden />
          </button>
        )}
        {inCart > 0 && <span className="store-product-incart" data-testid="card-in-cart">{inCart} na sacola</span>}
      </div>

      <div className="store-product-info">
        {categoryName && <p className="store-product-category">{categoryName}</p>}
        <h3 className="store-product-name"><button type="button" onClick={onOpen}>{product.name}</button></h3>
        {isCombo ? (
          <p className="store-product-desc">{product.comboItems.map((item) => `${item.quantity}× ${item.name}`).join(' · ')}</p>
        ) : product.description ? (
          <p className="store-product-desc">{product.description}</p>
        ) : (
          <p className="store-product-desc">{fromPrice ? `${product.variations.length} opções` : ''}</p>
        )}

        <div className="store-product-price">
          <span className="store-product-from" aria-hidden={!fromPrice}>{fromPrice ? 'a partir de' : '\u00a0'}</span>
          <span className="store-product-amount">{formatBRL(price)}</span>
          {(onPromo || (isCombo && separate > price)) && (
            <s className="store-product-old">{formatBRL(onPromo ? product.price : separate)}</s>
          )}
          {isCombo && savings > 0 && <span className="store-product-save">economize {formatBRL(savings)}</span>}
        </div>

        <button
          type="button"
          className={cn('store-product-add', added && 'is-added')}
          disabled={blocked}
          aria-live="polite"
          onClick={() => { onAdd(); if (!needsChoice) setAdded(true); }}
        >
          {added ? <Check size={16} aria-hidden /> : !soldOut && !needsChoice ? <Plus size={16} aria-hidden /> : null}
          <span>{label}</span>
        </button>
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
  initialVariationId,
  onClose,
  onAdd,
}: {
  product: StoreProduct;
  initialVariationId?: string;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [variationId, setVariationId] = React.useState(initialVariationId ?? product.variations[0]?.id ?? '');
  const [addonIds, setAddonIds] = React.useState<Set<string>>(new Set());
  const [notes, setNotes] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const variation = product.variations.find((v) => v.id === variationId);
  const soldOut = !product.available || (product.trackStock && product.stock <= 0);

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
          <Button onClick={confirm} disabled={soldOut}>
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
        {(product.customImageUrl || product.globalImageUrl) && (
          <div className="store-detail-photo flex h-56 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#fafaf8] to-[#f1f1ee] sm:h-64" data-testid="product-detail-photo">
            <ProductThumb
              customImageUrl={product.customImageUrl}
              globalImageUrl={product.globalImageUrl}
              basePath={product.basePath}
              emoji={product.emoji}
              alt={product.name}
              size={240}
              className="store-product-thumb"
            />
          </div>
        )}
        {product.description && (
          <p className="text-[0.86rem] leading-relaxed text-ink-600">{product.description}</p>
        )}
        {soldOut && <Alert tone="warn">{!product.available ? 'Produto pausado pela loja no momento.' : 'Produto sem estoque no momento.'}</Alert>}

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
