import 'server-only';
import { storeOpeningMode, storeTimeZone } from '@/lib/schedule';
import { randomUUID } from 'node:crypto';
import { OperationError } from '@/lib/operation-error';
import type { OrderSource, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { prisma, toNumber } from '@/lib/db';
import { onlyDigits } from '@/lib/utils';
import { normalizeSchedule, storeOpenState } from '@/lib/schedule';
import { deductOrderStock, restoreOrderStock } from '@/lib/data/inventory';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { portalVerifiedFilter } from '@/lib/customer-portal/mail';
import { registerOrderInCash } from '@/lib/data/cash';
import { canTransition } from '@/lib/validations/order';
import { getCommercialAccess } from '@/lib/platform/access';
import { assertDriverOnShift } from '@/lib/data/driver-schedules';
import { syncOrderLoyalty, applyCampaignBenefit } from '@/lib/data/growth';
import {
  calculateDeliveryFee,
  isOutsideDeliveryArea,
  normalizeTiers,
} from '@/lib/data/delivery-fee';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PEDIDOS
 * -----------------------------------------------------------------------
 * REGRA CENTRAL: o navegador manda QUEM e QUANTO. Nunca QUANTO CUSTA.
 *
 * No checkout o servidor:
 *   1. busca os produtos no banco
 *   2. confere que pertencem a esta organização
 *   3. confere que estão ativos e disponíveis
 *   4. recalcula preço + adicionais + variação
 *   5. calcula o frete pelas regras da organização
 *   6. grava o pedido com os valores que ELE apurou
 *
 * Um carrinho adulterado no DevTools chega aqui e é simplesmente ignorado:
 * o preço que vale é o do banco.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type CheckoutItemInput = {
  productId: string;
  quantity: number;
  variationId?: string;
  addonIds?: string[];
  notes?: string;
};

export type CheckoutCustomerInput = {
  idempotencyKey?: string;
  couponCode?: string;
  source?: 'OWN_STORE' | 'COUNTER' | 'WHATSAPP' | 'MANUAL';
  customerName: string;
  customerPhone: string;
  /** DELIVERY = entrega no endereço; PICKUP = retirada no balcão. */
  deliveryType?: 'DELIVERY' | 'PICKUP';
  deliveryAddress?: string;
  deliveryNumber?: string;
  deliveryDistrict?: string;
  deliveryCity?: string;
  deliveryZipCode?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  paymentMethod: PaymentMethod;
  /** Troco para quanto (só dinheiro). Não entra em cálculo nenhum. */
  changeFor?: number;
  notes?: string;
};

export type PricedItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  variationName: string | null;
  variationPrice: number | null;
  notes: string | null;
  total: number;
  options: Array<{ addonId: string | null; name: string; price: number; quantity: number }>;
};

export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

/**
 * Recalcula o carrinho a partir do banco.
 * É a única fonte de preço do pedido. O que o cliente enviou de valor
 * (se enviou) é descartado.
 */
export async function priceCart(
  organizationId: string,
  items: CheckoutItemInput[],
): Promise<{ items: PricedItem[]; subtotal: number }> {
  if (items.length === 0) throw new CheckoutError('O carrinho está vazio.');

  const productIds = [...new Set(items.map((i) => i.productId))];

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, organizationId },
    include: {
      variations: true,
      combo: { include: { items: { include: { product: { include: { combo: { select: { id: true } } } } } } } },
      addonGroups: { include: { addons: true } },
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));

  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new CheckoutError('Quantidade inválida.', 'items');
    }
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  // Components and standalone units share the same stock budget.
  const componentDemand = new Map(quantities);
  for (const product of products) {
    if (!product.combo) continue;
    const quantity = quantities.get(product.id) ?? 0;
    if (!product.combo.items.length) throw new CheckoutError('Combo sem produtos disponíveis.', 'items');
    for (const part of product.combo.items) {
      if (part.product.organizationId !== organizationId || !part.product.active || !part.product.available || part.product.combo !== null) {
        throw new CheckoutError(`O combo "${product.name}" não está disponível no momento.`, 'items');
      }
      componentDemand.set(part.productId, (componentDemand.get(part.productId) ?? 0) + part.quantity * quantity);
    }
  }
  for (const product of products) {
    for (const part of product.combo?.items ?? []) {
      if (part.product.trackStock && part.product.stock < (componentDemand.get(part.productId) ?? 0)) {
        throw new CheckoutError(`Estoque insuficiente para o combo "${product.name}".`, 'items');
      }
    }
  }  const priced: PricedItem[] = [];

  for (const item of items) {
    const product = byId.get(item.productId);

    // Produto de outra loja cai exatamente aqui: não está no mapa.
    if (!product) {
      throw new CheckoutError('Um dos produtos não está mais disponível.', 'items');
    }
    if (!product.active || !product.available) {
      throw new CheckoutError(`"${product.name}" não está disponível no momento.`, 'items');
    }

    const quantity = item.quantity;

    // Estoque: confere antes de fechar, para não vender o que não tem.
    if (product.trackStock && product.stock < (componentDemand.get(product.id) ?? quantity)) {
      throw new CheckoutError(
        product.stock === 0
          ? `"${product.name}" está esgotado.`
          : `Só restam ${product.stock} un. de "${product.name}".`,
        'items',
      );
    }

    // Preço vigente: promoção quando houver, senão o cheio.
    let unitPrice = toNumber(
      product.promotionalPrice !== null && product.promotionalPrice !== undefined
        ? product.promotionalPrice
        : product.price,
    );

    // Variação escolhida (tamanho/sabor) — precisa ser do próprio produto.
    let variationName: string | null = null;
    let variationPrice: number | null = null;
    if (item.variationId) {
      const variation = product.variations.find((v) => v.id === item.variationId && v.active);
      if (!variation) {
        throw new CheckoutError(`Variação inválida para "${product.name}".`, 'items');
      }
      variationName = variation.name;
      variationPrice = toNumber(variation.priceAdjustment);
      unitPrice += variationPrice;
    } else if (product.type === 'VARIATION' && product.variations.length > 0) {
      // Sem escolha explícita, usa a primeira variação ativa.
      const first = product.variations.filter((v) => v.active)[0];
      if (first) {
        variationName = first.name;
        variationPrice = toNumber(first.priceAdjustment);
        unitPrice += variationPrice;
      }
    }

    /**
     * Adicionais: só os que pertencem aos grupos deste produto E estão
     * ativos.
     *
     * O `active` do adicional é conferido aqui, e não só na vitrine. Sem
     * isso, desativar um adicional o tira da tela mas NÃO do sistema: um
     * carrinho montado antes da desativação (ou adulterado) continuaria
     * conseguindo comprá-lo — e a cozinha receberia um item que a loja
     * decidiu parar de vender.
     */
    const validAddonIds = new Set(
      product.addonGroups.flatMap((g) =>
        g.addons.filter((a) => a.active).map((a) => a.id),
      ),
    );
    // Deduplica antes de qualquer coisa: o mesmo id repetido no corpo da
    // requisição não pode virar duas linhas de adicional nem inflar a
    // contagem do grupo para furar o teto.
    const chosenAddonIds = [...new Set(item.addonIds ?? [])].filter((id) =>
      validAddonIds.has(id),
    );

    if (chosenAddonIds.length !== new Set(item.addonIds ?? []).size) {
      throw new CheckoutError('Um adicional escolhido não está mais disponível.', 'items');
    }
    const options: PricedItem['options'] = [];
    if (chosenAddonIds.length > 0) {
      /**
       * A organização entra no `where`, e não só na conferência de baixo.
       *
       * O `chosenAddonIds` já veio filtrado pelos adicionais DESTE produto,
       * então na prática o vínculo não escapa. Mas depender disso é frágil:
       * a consulta por id sozinho alcançaria adicional de outra loja, e a
       * única coisa entre ela e o pedido seria um `continue`. Filtrar na
       * origem custa nada e elimina a classe inteira.
       */
      const addons = await prisma.productAddon.findMany({
        where: { id: { in: chosenAddonIds }, group: { product: { organizationId } } },
        include: { group: { select: { productId: true, maxSelections: true, required: true, id: true } } },
      });

      // Contagem por grupo, apurada uma vez só: serve tanto para o teto
      // quanto para o mínimo obrigatório.
      const chosenByGroup = new Map<string, number>();

      for (const addon of addons) {
        // Dupla checagem: o adicional tem que ser deste produto.
        if (addon.group.productId !== product.id) continue;
        const price = toNumber(addon.price);
        options.push({ addonId: addon.id, name: addon.name, price, quantity: 1 });
        unitPrice += price;
        chosenByGroup.set(addon.group.id, (chosenByGroup.get(addon.group.id) ?? 0) + 1);
      }

      /**
       * Teto do grupo ("escolha até 2"). O modal do cardápio já impede,
       * mas quem controla o carrinho é o servidor: um grupo com teto 2
       * e 6 adicionais enviados precisa ser recusado aqui, senão a cozinha
       * recebe um pedido que a loja não se comprometeu a montar.
       */
      for (const group of product.addonGroups) {
        const chosenInGroup = chosenByGroup.get(group.id) ?? 0;
        if (group.maxSelections > 0 && chosenInGroup > group.maxSelections) {
          throw new CheckoutError(
            `Escolha no máximo ${group.maxSelections} opção(ões) em "${group.name}".`,
            'items',
          );
        }
      }

      // Grupos obrigatórios precisam ter sido preenchidos.
      for (const group of product.addonGroups) {
        if (!group.required) continue;
        const chosenInGroup = chosenByGroup.get(group.id) ?? 0;
        if (chosenInGroup < group.minSelections) {
          throw new CheckoutError(
            `Escolha ao menos ${group.minSelections} opção(ões) em "${group.name}".`,
            'items',
          );
        }
      }
    } else {
      // Nenhum adicional enviado: ainda assim, grupo obrigatório barra o pedido.
      const requiredGroup = product.addonGroups.find((g) => g.required && g.minSelections > 0);
      if (requiredGroup) {
        throw new CheckoutError(
          `Escolha ao menos ${requiredGroup.minSelections} opção(ões) em "${requiredGroup.name}".`,
          'items',
        );
      }
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new CheckoutError('Produto com preço inválido. Entre em contato com a loja.', 'items');
    }
    unitPrice = Math.round(unitPrice * 100) / 100;
    const total = Math.round(unitPrice * quantity * 100) / 100;

    priced.push({
      productId: product.id,
      productName: product.name,
      unitPrice,
      quantity,
      variationName,
      variationPrice,
      notes: item.notes ?? null,
      total,
      options,
    });
  }

  const subtotal = Math.round(priced.reduce((acc, i) => acc + i.total, 0) * 100) / 100;
  return { items: priced, subtotal };
}

/** Próximo número de pedido da organização (por organização, não global). */
async function nextDisplayId(tx: Prisma.TransactionClient, organizationId: string): Promise<number> {
  const last = await tx.order.findFirst({
    where: { organizationId },
    orderBy: { displayId: 'desc' },
    select: { displayId: true },
  });
  return (last?.displayId ?? 1000) + 1;
}

/** Cliente por telefone: reaproveita em vez de duplicar a cada pedido. */
async function upsertCustomer(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name: string,
  phone: string,
) {
  const normalized = onlyDigits(phone);
  const existing = await tx.customer.findUnique({
    where: { organizationId_phone: { organizationId, phone: normalized } },
  });

  if (existing) {
    // Atualiza o nome se o cliente informou um mais completo.
    if (name && name !== existing.name && name.length > existing.name.length) {
      return tx.customer.update({ where: { id: existing.id }, data: { name } });
    }
    return existing;
  }

  return tx.customer.create({
    data: { organizationId, name, phone: normalized },
  });
}

/**
 * Cria o pedido vindo da loja pública.
 * O total é o que o servidor apurou — nunca o que o navegador mandou.
 */
export async function createOrderFromCheckout(
  organizationId: string,
  customer: CheckoutCustomerInput,
  items: CheckoutItemInput[],
  portalAccount?: {id:string;sessionHash:string},
): Promise<{ orderId: string; displayId: number; total: number; discount:number; deliveryFee:number }> {
  if (customer.idempotencyKey) {
    const existing = await prisma.order.findFirst({
      where: { organizationId, source: customer.source ?? 'OWN_STORE', externalId: customer.idempotencyKey },
      select: { id: true, displayId: true, total: true, discount: true, deliveryFee: true },
    });
    if (existing) return { orderId: existing.id, displayId: existing.displayId, total: toNumber(existing.total), discount:toNumber(existing.discount),deliveryFee:toNumber(existing.deliveryFee) };
  }
  const commercial = await getCommercialAccess(organizationId);
  if (!commercial.allowNewOrders) throw new CheckoutError(commercial.message ?? 'Novos pedidos indisponíveis.');
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      storeStatus: true,
      status: true,
      minimumOrder: true,
      baseDeliveryFee: true,
      extraKmFee: true,
      deliveryRadius: true,
      latitude: true,
      longitude: true,
      allowPickup: true,
      allowOwnDelivery: true,
      deliveryFeeMode: true,
      settings: true,
    },
  });
  if (!organization) throw new CheckoutError('Estabelecimento não encontrado.');

  if (organization.status !== 'ACTIVE' && organization.status !== 'TRIAL') {
    throw new CheckoutError('Este estabelecimento não está disponível para pedidos.');
  }
  const openingHours = (organization.settings as Record<string, unknown> | null)?.openingHours;
  const openState = storeOpenState(organization.storeStatus, normalizeSchedule(openingHours), undefined, storeOpeningMode(organization.settings, organization.storeStatus), storeTimeZone(organization.settings));
  if (openState === 'CLOSED' || openState === 'CLOSED_BY_SCHEDULE') {
    throw new CheckoutError('A loja está fechada neste momento.');
  }
  if (openState === 'PAUSED') {
    throw new CheckoutError('A loja está pausada e não está aceitando pedidos agora.');
  }

  // A modalidade é revalidada aqui, não só na tela: o corpo da requisição
  // pode pedir retirada numa loja que não oferece retirada, e sem esta
  // checagem o pedido entraria por um caminho que a loja não habilitou.
  const wantsPickup = customer.deliveryType === 'PICKUP';
  if (wantsPickup && !organization.allowPickup) {
    throw new CheckoutError('Esta loja não está aceitando retirada no balcão.', 'deliveryType');
  }
  if (!wantsPickup && !organization.allowOwnDelivery) {
    throw new CheckoutError(
      'Esta loja não está aceitando entrega no endereço no momento.',
      'deliveryType',
    );
  }

  const { items: priced, subtotal } = await priceCart(organizationId, items);

  const minimumOrder = toNumber(organization.minimumOrder);
  if (minimumOrder > 0 && subtotal < minimumOrder) {
    throw new CheckoutError(
      `O pedido mínimo é de R$ ${minimumOrder.toFixed(2).replace('.', ',')}.`,
      'items',
    );
  }

  /**
   * RETIRADA não paga frete. Não é desconto nem cortesia: não há entrega
   * acontecendo, então cobrar taxa seria cobrar por um serviço que ninguém
   * prestou. O cliente pode escolher retirada mesmo com a loja oferecendo
   * entrega, e essa escolha é dele.
   */
  const isPickup = customer.deliveryType === 'PICKUP';

  /**
   * Bairros ativos da loja entram no cálculo por bairro. A coordenada do
   * bairro fica fora: o preço é a taxa cadastrada, e a coordenada só serve
   * para desenhar o mapa. As faixas (BY_DISTANCE_BAND) vêm do settings.
   */
  const zones = isPickup
    ? []
    : await prisma.deliveryZone.findMany({
        where: { organizationId, active: true },
        select: { name: true, fee: true, active: true },
      });

  const feeSettings = {
    baseDeliveryFee: toNumber(organization.baseDeliveryFee),
    extraKmFee: toNumber(organization.extraKmFee),
    deliveryRadius: organization.deliveryRadius,
    latitude: organization.latitude,
    longitude: organization.longitude,
    feeMode: organization.deliveryFeeMode,
    tiers: normalizeTiers(
      (organization.settings as Record<string, unknown> | null)?.deliveryTiers,
    ),
    zones: zones.map((z) => ({ name: z.name, fee: toNumber(z.fee), active: z.active })),
  };

  /**
   * FORA DA ÁREA bloqueia o pedido. Esta é a decisão que NÃO pode ser
   * delegada ao navegador: o endereço fora do raio (ou de um bairro não
   * atendido) é recusado aqui com a mensagem exata do pedido. Sem esta
   * checagem, um pedido com coordenadas adulteradas entraria como se a
   * entrega fosse possível.
   */
  if (!isPickup) {
    const area = isOutsideDeliveryArea(feeSettings, {
      latitude: customer.deliveryLatitude,
      longitude: customer.deliveryLongitude,
      district: customer.deliveryDistrict,
    });
    if (area.outside) {
      throw new CheckoutError(
        'Este endereço está fora da área de entrega desta loja.',
        'deliveryAddress',
      );
    }
  }

  const deliveryFee = isPickup
    ? 0
    : calculateDeliveryFee(feeSettings, {
        latitude: customer.deliveryLatitude,
        longitude: customer.deliveryLongitude,
        district: customer.deliveryDistrict,
      });

  const total = Math.round((subtotal + deliveryFee) * 100) / 100;

  // Troco menor que o total não é troco — é o cliente informando um valor
  // que não cobre o pedido. Barra aqui em vez de gravar um número que a
  // operação leria como "leve R$ 20 de troco para uma conta de R$ 80".

  const order = await prisma.$transaction(async (tx) => {
    // Tenant lock serializes numbering and duplicate checkout requests.
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
    if (customer.idempotencyKey) {
      const existing = await tx.order.findFirst({
        where: { organizationId, source: customer.source ?? 'OWN_STORE', externalId: customer.idempotencyKey },
        select: { id: true, displayId: true, total: true, discount: true, deliveryFee: true },
      });
      if (existing) return existing;
    }
    const fresh = await tx.organization.findUnique({where:{id:organizationId},select:{storeStatus:true,settings:true,status:true}});
    if(!fresh || !['ACTIVE','TRIAL'].includes(fresh.status) || storeOpenState(fresh.storeStatus,normalizeSchedule((fresh.settings as Record<string,unknown>|null)?.openingHours),undefined,storeOpeningMode(fresh.settings,fresh.storeStatus),storeTimeZone(fresh.settings))!=='OPEN') throw new CheckoutError('A loja não está recebendo novos pedidos neste momento.');
    if(portalAccount && !await tx.customerPortalSession.findFirst({where:{tokenHash:portalAccount.sessionHash,accountId:portalAccount.id,expiresAt:{gt:new Date()},account:{organizationId,active:true,...portalVerifiedFilter()}}})) throw new CheckoutError('Sua sessão mudou. Entre novamente antes de finalizar.');
    const customerRecord = await upsertCustomer(
      tx,
      organizationId,
      customer.customerName,
      customer.customerPhone,
    );

    const displayId = await nextDisplayId(tx, organizationId);

    const benefit = !customer.source || customer.source === 'OWN_STORE'
      ? await applyCampaignBenefit(tx, organizationId, customerRecord.id, subtotal, deliveryFee, customer.couponCode, customer.idempotencyKey ?? randomUUID())
      : {discount:0,deliveryFee,campaignId:null};
    const finalTotal = Math.round(Math.max(0, subtotal - benefit.discount + benefit.deliveryFee) * 100) / 100;
    if (customer.changeFor !== undefined && customer.changeFor > 0 && customer.changeFor < finalTotal) {
      throw new CheckoutError('O valor informado para troco é menor que o total do pedido.', 'changeFor');
    }

    return tx.order.create({
      data: {
        organizationId,
        displayId,
        source: customer.source ?? 'OWN_STORE',
        externalId: customer.idempotencyKey ?? null,
        ...(portalAccount ? {portalLink:{create:{accountId:portalAccount.id}}} : {}),
        customerId: customerRecord.id,
        customerName: customer.customerName,
        customerPhone: onlyDigits(customer.customerPhone),
        status: 'NEW',
        subtotal,
        deliveryFee: benefit.deliveryFee,
        discount: benefit.discount,
        total: finalTotal,
        paymentMethod: customer.paymentMethod,
        paymentStatus: 'PENDING',
        changeFor: customer.changeFor && customer.changeFor > 0 ? customer.changeFor : null,
        deliveryType: isPickup ? 'PICKUP' : 'DELIVERY',
        // Retirada não guarda endereço: o que não existe não é gravado.
        deliveryAddress: isPickup ? null : (customer.deliveryAddress ?? null),
        deliveryNumber: isPickup ? null : (customer.deliveryNumber ?? null),
        deliveryDistrict: isPickup ? null : (customer.deliveryDistrict ?? null),
        deliveryCity: isPickup ? null : (customer.deliveryCity ?? null),
        deliveryZipCode: isPickup ? null : (customer.deliveryZipCode ?? null),
        deliveryLatitude: isPickup ? null : (customer.deliveryLatitude ?? null),
        deliveryLongitude: isPickup ? null : (customer.deliveryLongitude ?? null),
        notes: customer.notes ?? null,
        items: {
          create: priced.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            variationName: item.variationName,
            variationPrice: item.variationPrice,
            notes: item.notes,
            total: item.total,
            options: item.options.length
              ? {
                  create: item.options.map((o) => ({
                    addonId: o.addonId,
                    name: o.name,
                    price: o.price,
                    quantity: o.quantity,
                  })),
                }
              : undefined,
          })),
        },
      },
      select: { id: true, displayId: true, total: true, discount: true, deliveryFee: true },
    });
  });

  // Avisa a operação. Não bloqueia o pedido se falhar.
  await prisma.notification
    .create({
      data: {
        organizationId,
        type: 'ORDER',
        title: `Novo pedido #${order.displayId}`,
        message: `${customer.customerName} — R$ ${Number(order.total).toFixed(2).replace('.', ',')}`,
        href: `/app/pedidos?pedido=${order.id}`,
      },
    })
    .catch(() => undefined);

  return {
    orderId: order.id,
    displayId: order.displayId,
    total: toNumber(order.total),
    discount: toNumber(order.discount),
    deliveryFee: toNumber(order.deliveryFee),
  };
}

/** Filtros da central de pedidos. Sempre por organização. */
export async function getOrders(
  organizationId: string,
  filters: {
    status?: OrderStatus[];
    source?: OrderSource[];
    driverId?: string;
    search?: string;
    from?: Date;
    to?: Date;
    page?: number;
    perPage?: number;
  } = {},
) {
  const { status, source, driverId, search, from, to, page = 1, perPage = 30 } = filters;

  const where: Prisma.OrderWhereInput = {
    organizationId,
    ...(status?.length ? { status: { in: status } } : {}),
    ...(source?.length ? { source: { in: source } } : {}),
    ...(driverId ? { driverId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { customerName: { contains: search, mode: 'insensitive' as const } },
            { customerPhone: { contains: onlyDigits(search) } },
            ...(Number.isFinite(Number(search)) ? [{ displayId: Number(search) }] : []),
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        items: { include: { options: true } },
        driver: { select: { id: true, name: true, status: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items: items.map(serializeOrder),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Pedidos agrupados por coluna do kanban. */
export async function getOrderBoard(organizationId: string, sinceHours = 48) {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      OR: [
        { createdAt: { gte: since } },
        // Pedido antigo ainda em andamento continua no board até fechar.
        { status: { in: ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'WAITING_DRIVER', 'DISPATCHED'] } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 400,
    include: {
      items: { include: { options: true } },
      driver: { select: { id: true, name: true, status: true } },
    },
  });


  const serializedOrders = orders.map((order) => serializeOrder(order));
  type SerializedOrder = (typeof serializedOrders)[number];

  const columns: Record<string, SerializedOrder[]> = {
    NEW: [],
    CONFIRMED: [],
    PREPARING: [],
    READY: [],
    WAITING_DRIVER: [],
    DISPATCHED: [],
    DELIVERED: [],
    CANCELLED: [],
  };

  for (const order of serializedOrders) {
    columns[order.status]?.push(order);
  }

  return columns;
}

export async function getOrderById(organizationId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: {
      items: { include: { options: true } },
      driver: true,
      customer: true,
      delivery: true,
      cashTransactions: true,
    },
  });
  return order ? serializeOrder(order) : null;
}

/** Decimal → number, para o cliente React não ver Prisma.Decimal. */
export function serializeOrder<T extends Record<string, unknown>>(order: T) {
  const items = (order.items as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    ...order,
    subtotal: toNumber(order.subtotal),
    deliveryFee: toNumber(order.deliveryFee),
    discount: toNumber(order.discount),
    total: toNumber(order.total),
    items: items.map((item) => ({
      ...item,
      unitPrice: toNumber(item.unitPrice),
      variationPrice: item.variationPrice == null ? null : toNumber(item.variationPrice),
      total: toNumber(item.total),
      options: ((item.options as Array<Record<string, unknown>> | undefined) ?? []).map((o) => ({
        ...o,
        price: toNumber(o.price),
      })),
    })),
  };
}

/**
 * Muda o status e carimba o timestamp correspondente.
 *
 * Ao entrar em CONFIRMED o estoque é baixado; ao cancelar, devolvido.
 * As duas operações são idempotentes pelas flags stockDeducted e pelos
 * movimentos de CANCELLATION.
 */
export async function updateOrderStatus(
  organizationId: string,
  orderId: string,
  status: OrderStatus,
  options: { reason?: string; userId?: string; transaction?: Prisma.TransactionClient } = {},
) {
  return withOrganizationTransaction(organizationId, async (tx) => {
  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId },
    select: { id: true, status: true, notes: true, displayId: true, deliveryType: true, driverId: true, total: true, paymentMethod: true },
  });
  if (!order) throw new OperationError('Pedido não encontrado.');
  if (order.status === status) return { ok: true, status };
  const pickupComplete = order.deliveryType === 'PICKUP' && order.status === 'READY' && status === 'DELIVERED';
  if (!pickupComplete && !canTransition(order.status, status)) throw new OperationError('Transição de pedido inválida.');
  if (order.deliveryType === 'PICKUP' && ['WAITING_DRIVER', 'DISPATCHED'].includes(status)) throw new OperationError('Pedido de retirada não pode ser despachado.');
  if (order.deliveryType !== 'PICKUP' && status === 'DELIVERED' && order.status !== 'DISPATCHED') throw new OperationError('Despache o pedido antes de concluir.');
  if (status === 'DISPATCHED' && !order.driverId) throw new OperationError('Atribua um entregador antes de despachar.');

  const now = new Date();
  const stamp: Prisma.OrderUpdateInput = {
    status,
    ...(status === 'CONFIRMED' ? { acceptedAt: now } : {}),
    ...(status === 'PREPARING' ? { preparingAt: now } : {}),
    ...(status === 'READY' ? { readyAt: now } : {}),
    ...(status === 'DISPATCHED' ? { dispatchedAt: now } : {}),
    ...(status === 'DELIVERED' ? { deliveredAt: now, paymentStatus: 'PAID' } : {}),
    ...(status === 'CANCELLED'
      ? {
          cancelledAt: now,
          notes: options.reason
            ? `${order.notes ? `${order.notes}\n` : ''}Cancelado: ${options.reason}`
            : order.notes,
        }
      : {}),
  };

  await tx.order.update({ where: { id: orderId }, data: stamp });
  if (status === 'DELIVERED' || status === 'CANCELLED') await syncOrderLoyalty(tx, organizationId, orderId);

  // Efeitos colaterais de estoque, fora do update para não misturar.
  if (status === 'CONFIRMED') {
    await deductOrderStock(organizationId, orderId, options.userId, tx);
  }
  if (status === 'CANCELLED') {
    await restoreOrderStock(organizationId, orderId, options.userId, tx);
    await tx.delivery.updateMany({ where: { organizationId, orderId }, data: { status: 'FAILED' } });
  }
  if (status === 'DISPATCHED') {
    await tx.delivery.updateMany({ where: { organizationId, orderId, status: { in: ['ASSIGNED', 'PICKED_UP'] } }, data: { status: 'IN_TRANSIT', startedAt: now } });
  }
  if (status === 'DELIVERED') {
    await tx.delivery.updateMany({ where: { organizationId, orderId }, data: { status: 'DELIVERED', deliveredAt: now } });
    if (order.paymentMethod) await registerOrderInCash(organizationId, orderId, order.paymentMethod, toNumber(order.total), tx);
  }
  if (order.driverId && ['CANCELLED', 'DELIVERED'].includes(status)) {
    const other = await tx.order.count({ where: { organizationId, driverId: order.driverId, id: { not: orderId }, status: { in: ['WAITING_DRIVER', 'DISPATCHED'] } } });
    if (!other) await tx.driver.updateMany({ where: { id: order.driverId, organizationId }, data: { status: 'ONLINE' } });
  }

  return { ok: true, status };
  }, options.transaction);
}

/**
 * Atribui entregador. Confere que o entregador é DESTA organização —
 * sem isso daria para atribuir um pedido a alguém de outra loja.
 */
export async function assignDriver(
  organizationId: string,
  orderId: string,
  driverId: string,
  transaction?: Prisma.TransactionClient,
) {
  return withOrganizationTransaction(organizationId, async (tx) => {
  const driver = await tx.driver.findFirst({
    where: { id: driverId, organizationId, active: true },
    select: { id: true, name: true, status: true,user:{select:{active:true,mustChangePassword:true,organizations:{where:{organizationId,active:true},select:{id:true}}}} },
  });
  if (!driver) throw new OperationError('Entregador não encontrado.');
  if(driver.user&&(!driver.user.active||driver.user.mustChangePassword||!driver.user.organizations.length))throw new OperationError('O acesso deste entregador está inativo ou aguarda ativação.');
  await assertDriverOnShift(tx, organizationId, driverId);

  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId },
    select: { id: true, displayId: true, status: true, driverId: true, deliveryType: true },
  });
  if (!order) throw new OperationError('Pedido não encontrado.');
  if (order.deliveryType !== 'DELIVERY') throw new OperationError('Pedido de retirada não recebe entregador.');
  if (!['READY', 'WAITING_DRIVER'].includes(order.status) || order.driverId) {
    throw new OperationError('O pedido já foi atribuído ou não está pronto para despacho.');
  }
  const activeOrders = await tx.order.count({ where: {
    organizationId, driverId, status: { in: ['WAITING_DRIVER', 'DISPATCHED'] },
  } });
  // Availability is derived (active, access ready, on shift — checked above — and no delivery in progress); no manual switch.
  if (activeOrders) throw new OperationError('Entregador em outra entrega. Atualize a expedição.');

    await tx.order.update({
      where: { id: orderId },
      data: { driverId, status: 'WAITING_DRIVER' },
    });

    // Registro de entrega: um por pedido (orderId é unique).
    await tx.delivery.upsert({
      where: { orderId },
      create: {
        organizationId,
        orderId,
        driverId,
        status: 'ASSIGNED',
        assignedAt: new Date(),
      },
      update: { driverId, status: 'ASSIGNED', assignedAt: new Date(),
        arrivedAt: null, pickedUpAt: null, startedAt: null, deliveredAt: null,
        proofType: 'NONE', proofValue: null },
    });

    await tx.driver.update({ where: { id: driverId }, data: { status: 'BUSY' } });

    await tx.notification.create({
      data: {
        organizationId,
        userId: (await tx.driver.findUnique({ where: { id: driverId }, select: { userId: true } }))
          ?.userId,
        type: 'DELIVERY',
        title: `Entrega atribuída — pedido #${order.displayId}`,
        message: `Você foi designado para o pedido #${order.displayId}.`,
        href: '/entregador',
      },
    });
  return { ok: true, driverName: driver.name };
  }, transaction);
}

export async function unassignDriver(organizationId: string, orderId: string, transaction?: Prisma.TransactionClient) {
  return withOrganizationTransaction(organizationId, async (tx) => {
  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId },
    select: { id: true, driverId: true, status: true, delivery: { select: { status: true } } },
  });
  if (!order) throw new OperationError('Pedido não encontrado.');
  if (order.status !== 'WAITING_DRIVER' || !order.driverId ||
      !['PENDING', 'ASSIGNED'].includes(order.delivery?.status ?? '')) {
    throw new OperationError('Só é possível remover o entregador antes da retirada do pedido.');
  }

    await tx.order.update({
      where: { id: orderId },
      data: {
        driverId: null,
        status: 'READY',
      },
    });
    await tx.delivery.updateMany({
      where: { orderId, organizationId },
      data: { driverId: null, status: 'PENDING', assignedAt: null, arrivedAt: null,
        pickedUpAt: null, startedAt: null, deliveredAt: null },
    });
    if (order.driverId) {
      const remaining = await tx.order.count({ where: {
        organizationId, driverId: order.driverId, status: { in: ['WAITING_DRIVER', 'DISPATCHED'] },
      } });
      await tx.driver.update({
        where: { id: order.driverId },
        data: { status: remaining ? 'BUSY' : 'ONLINE' },
      });
    }
  return { ok: true };
  }, transaction);
}

export async function reassignDriver(organizationId:string,orderId:string,driverId:string,userId:string,reason:string){
  if(reason.trim().length<5||reason.length>300)throw new OperationError('Informe o motivo da troca com 5 a 300 caracteres.');
  return withOrganizationTransaction(organizationId,async tx=>{
    const current=await tx.order.findFirst({where:{id:orderId,organizationId},select:{driverId:true,displayId:true}});
    if(!current?.driverId||current.driverId===driverId)throw new OperationError('Selecione outro entregador para um pedido já atribuído.');
    const previous=current.driverId;
    await unassignDriver(organizationId,orderId,tx);
    const result=await assignDriver(organizationId,orderId,driverId,tx);
    const delivery=await tx.delivery.findUnique({where:{orderId},select:{notes:true}});
    const audit=`Troca por ${userId}: ${previous} → ${driverId}. Motivo: ${reason.trim()}`;
    await tx.delivery.update({where:{orderId},data:{notes:[delivery?.notes,audit].filter(Boolean).join('\n')}});
    await tx.notification.create({data:{organizationId,userId,type:'DELIVERY',title:`Troca de entregador · #${current.displayId}`,message:audit,href:`/app/pedidos?pedido=${orderId}`}});
    return result;
  });
}

export async function updatePaymentStatus(
  organizationId: string,
  orderId: string,
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED',
  paymentMethod?: PaymentMethod,
  transaction?: Prisma.TransactionClient,
) {
  return withOrganizationTransaction(organizationId, async (tx) => {
  const order = await tx.order.findFirst({ where: { id: orderId, organizationId }, select: { status: true } });
  if (!order) throw new OperationError('Pedido não encontrado.');
  if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
    throw new OperationError('Pedido encerrado. Registre eventuais ajustes no caixa para preservar o histórico.');
  }
  const result = await tx.order.updateMany({
    where: { id: orderId, organizationId },
    data: { paymentStatus, ...(paymentMethod ? { paymentMethod } : {}) },
  });
  if (result.count === 0) throw new OperationError('Pedido não encontrado.');
  return { ok: true };
  }, transaction);
}

/** Contadores exibidos nos badges laterais. */
export async function getOrderCounters(organizationId: string) {
  const [novos, emAndamento, aguardandoEntregador, entreguesHoje] = await Promise.all([
    prisma.order.count({ where: { organizationId, status: 'NEW' } }),
    prisma.order.count({
      where: { organizationId, status: { in: ['CONFIRMED', 'PREPARING', 'READY'] } },
    }),
    prisma.order.count({ where: { organizationId, status: 'WAITING_DRIVER' } }),
    prisma.order.count({
      where: {
        organizationId,
        status: 'DELIVERED',
        deliveredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);

  return { novos, emAndamento, aguardandoEntregador, entreguesHoje };
}

/** Pedidos do entregador logado. Filtro por driverId, nunca por lista livre. */
export async function getDriverOrders(organizationId: string, driverId: string) {
  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      driverId,
      status: { in: ['WAITING_DRIVER', 'DISPATCHED', 'DELIVERED'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      items: { include: { options: true } },
      delivery: true,
    },
  });
  return orders.map(serializeOrder);
}
