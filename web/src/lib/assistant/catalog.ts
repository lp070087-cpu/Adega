export type AssistantProduct = { id: string; name: string; price: number; promotionalPrice: number | null; stock: number; trackStock: boolean; available: boolean; brand?: string | null; packSize?: number | null; volume?: number | null; unit?: string | null; productId?: string; variationId?: string; variationName?: string };
export type CatalogDecision = { ids: string[]; question: 'RESULTS'|'BRAND'|'PACKAGING'|'HUMAN'|'NONE' };
export function productLink(origin: string, slug: string, productId: string, variationId?: string) {
  const url = new URL(`/loja/${encodeURIComponent(slug)}`, origin);
  url.searchParams.set('produto', productId);
  if (variationId) url.searchParams.set('variacao', variationId);
  return url.toString();
}
/** Toda informação comercial é composta aqui, nunca copiada da resposta da IA. */
export function catalogReply(decision: CatalogDecision, catalog: AssistantProduct[], origin: string, slug: string) {
  if (decision.question === 'HUMAN') return 'Vou encaminhar seu atendimento para a equipe da loja.';
  if (decision.question === 'BRAND') return 'Qual marca ou produto você prefere? Vou consultar as opções disponíveis nesta loja.';
  if (decision.question === 'PACKAGING') return 'Você prefere unidade ou embalagem fechada? A quantidade por embalagem depende do produto cadastrado.';
  if (decision.question === 'NONE') return 'Não encontrei uma opção disponível com essa descrição. Você pode informar a marca, o volume ou falar com a equipe da loja?';
  const selected = [...new Set(decision.ids)].flatMap(id => catalog.filter(p => p.id === id && p.available && (!p.trackStock || p.stock > 0))).slice(0, 4);
  if (!selected.length) return 'Não encontrei uma opção disponível com essa descrição. Você pode informar a marca, o volume ou falar com a equipe da loja?';
  return selected.map(p => {
    const price = p.promotionalPrice !== null && p.promotionalPrice < p.price ? p.promotionalPrice : p.price;
    const pack = p.variationId ? ' · embalagem conforme a opção cadastrada' : p.packSize && p.packSize > 1 ? ` · embalagem com ${p.packSize} unidades` : /\b(caixa|fardo|pack)\b/i.test(p.name) ? ' · embalagem conforme descrição' : ' · unidade';
    const name = p.variationName ? `${p.name} — ${p.variationName}` : p.name;
    return `${name}${pack} — ${price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}\n${productLink(origin,slug,p.productId ?? p.id,p.variationId)}`;
  }).join('\n\n')+'\n\nConfira a quantidade e finalize na loja. O pedido só será confirmado após o checkout.';
}
