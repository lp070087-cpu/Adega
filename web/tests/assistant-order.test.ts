import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogReply, cartLink, storeInfoReply, type AssistantProduct, type StoreInfo } from '../src/lib/assistant/catalog';

const heineken: AssistantProduct = { id: 'p1', name: 'Heineken Long Neck 330ml', price: 7.99, promotionalPrice: 6.99, stock: 10, trackStock: true, available: true };
const gelo: AssistantProduct = { id: 'p2', name: 'Gelo 5kg', price: 12, promotionalPrice: null, stock: 0, trackStock: true, available: true };
const info: StoreInfo = { hours: 'Seg a Sáb, 10:00–22:00', averageDeliveryTime: 35, minimumOrder: 20, baseDeliveryFee: 5, allowPickup: true, allowDelivery: true };

test('pedido pelo WhatsApp: resumo com preço real e link de sacola, sem criar pedido', () => {
  const reply = catalogReply({ question: 'ORDER', ids: ['p1'], quantities: [2] }, [heineken, gelo], 'https://adega-nine.vercel.app', 'loja-x', info);
  assert.match(reply, /2× Heineken Long Neck 330ml — R\$\s13,98/);
  assert.match(reply, /sacola=p1%3A2|sacola=p1:2/);
  assert.match(reply, /só é enviado à loja quando você confirmar/);
});

test('pedido pelo WhatsApp ignora item sem estoque e não inventa', () => {
  const reply = catalogReply({ question: 'ORDER', ids: ['p2'], quantities: [1] }, [heineken, gelo], 'https://x.test', 'loja-x', info);
  assert.doesNotMatch(reply, /sacola=/);
  assert.match(reply, /Não encontrei/);
});

test('horário e entrega vêm do cadastro da loja', () => {
  assert.equal(storeInfoReply('HOURS', info), 'Nosso horário: Seg a Sáb, 10:00–22:00.');
  assert.match(storeInfoReply('HOURS', { ...info, hours: null }), /ainda não cadastrou/);
  const delivery = storeInfoReply('DELIVERY', info);
  assert.match(delivery, /35 minutos/); assert.match(delivery, /R\$\s5,00/); assert.match(delivery, /mínimo: R\$\s20,00/); assert.match(delivery, /retirar/);
});

test('link de sacola carrega variação e quantidade', () => {
  const url = new URL(cartLink('https://x.test', 'loja-x', [{ product: { ...heineken, id: 'v1', productId: 'p1', variationId: 'v1' }, quantity: 3 }]));
  assert.equal(url.searchParams.get('sacola'), 'p1.v1:3');
});
