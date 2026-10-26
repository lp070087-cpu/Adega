export type AssistantProduct = { id: string; name: string; price: number; promotionalPrice: number | null; stock: number; trackStock: boolean; available: boolean; brand?: string | null; packSize?: number | null; volume?: number | null; unit?: string | null; productId?: string; variationId?: string; variationName?: string };
export type CatalogDecision = { ids: string[]; quantities?: number[]; question: 'RESULTS'|'BRAND'|'PACKAGING'|'HUMAN'|'NONE'|'HOURS'|'DELIVERY'|'ORDER' };
export type StoreInfo = { hours: string | null; averageDeliveryTime: number | null; minimumOrder: number; baseDeliveryFee: number; allowPickup: boolean; allowDelivery: boolean };
export function productLink(origin: string, slug: string, productId: string, variationId?: string) {
  const url = new URL(`/loja/${encodeURIComponent(slug)}`, origin);
  url.searchParams.set('produto', productId);
  if (variationId) url.searchParams.set('variacao', variationId);
  return url.toString();
}
const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const unitPrice = (p: AssistantProduct) => (p.promotionalPrice !== null && p.promotionalPrice < p.price ? p.promotionalPrice : p.price);

/** Link que abre a loja com a sacola montada; o pedido só nasce no checkout. */
export function cartLink(origin: string, slug: string, lines: Array<{ product: AssistantProduct; quantity: number }>) {
  const url = new URL(`/loja/${encodeURIComponent(slug)}`, origin);
  url.searchParams.set('sacola', lines.map(({ product, quantity }) => `${product.productId ?? product.id}${product.variationId ? `.${product.variationId}` : ''}:${quantity}`).join(','));
  return url.toString();
}

/** Horário e entrega vêm do cadastro da loja, nunca do texto da IA. */
export function storeInfoReply(question: 'HOURS' | 'DELIVERY', info: StoreInfo) {
  if (question === 'HOURS') return info.hours ? `Nosso horário: ${info.hours}.` : 'A loja ainda não cadastrou o horário de funcionamento. Vou deixar sua pergunta para a equipe.';
  const parts: string[] = [];
  if (info.allowDelivery) {
    parts.push(info.averageDeliveryTime ? `Entregamos em cerca de ${info.averageDeliveryTime} minutos.` : 'Fazemos entregas.');
    parts.push(info.baseDeliveryFee > 0 ? `Taxa de entrega a partir de ${brl(info.baseDeliveryFee)}; o valor final aparece no checkout conforme o endereço.` : 'A taxa de entrega aparece no checkout conforme o endereço.');
  }
  if (info.minimumOrder > 0) parts.push(`Pedido mínimo: ${brl(info.minimumOrder)}.`);
  if (info.allowPickup) parts.push('Você também pode retirar na loja.');
  return parts.join(' ') || 'Vou deixar sua pergunta sobre entrega para a equipe da loja.';
}

/** Toda informação comercial é composta aqui, nunca copiada da resposta da IA. */
export function catalogReply(decision: CatalogDecision, catalog: AssistantProduct[], origin: string, slug: string, info?: StoreInfo) {
  if ((decision.question === 'HOURS' || decision.question === 'DELIVERY') && info) return storeInfoReply(decision.question, info);
  if (decision.question === 'ORDER') {
    const lines = decision.ids.map((id, i) => ({ product: catalog.find(p => p.id === id && p.available && (!p.trackStock || p.stock > 0)), quantity: Math.min(20, Math.max(1, Math.round(decision.quantities?.[i] ?? 1))) }))
      .filter((line): line is { product: AssistantProduct; quantity: number } => Boolean(line.product)).slice(0, 4);
    if (lines.length) {
      const total = lines.reduce((sum, l) => sum + unitPrice(l.product) * l.quantity, 0);
      const summary = lines.map(l => `${l.quantity}× ${l.product.variationName ? `${l.product.name} — ${l.product.variationName}` : l.product.name} — ${brl(unitPrice(l.product) * l.quantity)}`).join('\n');
      return `Separei estes itens:\n${summary}\nSubtotal: ${brl(total)} (sem a entrega)\n\nConfira e finalize por aqui; o pedido só é enviado à loja quando você confirmar endereço e pagamento:\n${cartLink(origin, slug, lines)}`;
    }
  }
  if (decision.question === 'HUMAN') return 'Vou encaminhar seu atendimento para a equipe da loja.';
  if (decision.question === 'BRAND') return 'Qual marca ou produto você prefere? Vou consultar as opções disponíveis nesta loja.';
  if (decision.question === 'PACKAGING') return 'Você prefere unidade ou embalagem fechada? A quantidade por embalagem depende do produto cadastrado.';
  if (decision.question === 'NONE' || decision.question === 'ORDER' || decision.question === 'HOURS' || decision.question === 'DELIVERY') return 'Não encontrei uma opção disponível com essa descrição. Você pode informar a marca, o volume ou falar com a equipe da loja?';
  const selected = [...new Set(decision.ids)].flatMap(id => catalog.filter(p => p.id === id && p.available && (!p.trackStock || p.stock > 0))).slice(0, 4);
  if (!selected.length) return 'Não encontrei uma opção disponível com essa descrição. Você pode informar a marca, o volume ou falar com a equipe da loja?';
  return selected.map(p => {
    const price = p.promotionalPrice !== null && p.promotionalPrice < p.price ? p.promotionalPrice : p.price;
    const pack = p.variationId ? ' · embalagem conforme a opção cadastrada' : p.packSize && p.packSize > 1 ? ` · embalagem com ${p.packSize} unidades` : /\b(caixa|fardo|pack)\b/i.test(p.name) ? ' · embalagem conforme descrição' : ' · unidade';
    const name = p.variationName ? `${p.name} — ${p.variationName}` : p.name;
    return `${name}${pack} — ${price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}\n${productLink(origin,slug,p.productId ?? p.id,p.variationId)}`;
  }).join('\n\n')+'\n\nConfira a quantidade e finalize na loja. O pedido só será confirmado após o checkout.';
}

/** Pergunta sobre o andamento do pedido (detectada no servidor, sem depender da IA). */
export const ORDER_STATUS_INTENT = /\b(meu pedido|status do pedido|cad[eê]\s+(o\s+)?(meu\s+)?pedido|onde\s+est[aá]\s+(o\s+)?(meu\s+)?pedido|pedido\s+j[aá]\s+saiu|j[aá]\s+saiu\s+para\s+entrega|previs[aã]o\s+(de\s+)?entrega|quanto\s+tempo\s+(falta|demora))\b/i;

/** Resposta com a etapa real do último pedido deste número nesta loja. */
export function orderStatusReply(order: { id: string; displayId: number; stage: string; updatedAt: Date } | null, origin: string, slug: string) {
  if (!order) return 'Não encontrei um pedido recente feito com este número. Se você fez o pedido por outro telefone, me envie o número do pedido ou fale com a equipe da loja.';
  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(order.updatedAt);
  return `Seu pedido #${order.displayId}: ${order.stage} (atualizado às ${hora}).\nAcompanhe em tempo real: ${new URL(`/loja/${encodeURIComponent(slug)}/pedido/${order.id}`, origin).toString()}`;
}
