import test from 'node:test';
import assert from 'node:assert/strict';
import { ORDER_STATUS_INTENT, orderStatusReply } from '../src/lib/assistant/catalog';

test('IA: pergunta sobre o pedido é reconhecida no servidor', () => {
  for (const q of ['cadê meu pedido?', 'Qual o status do pedido', 'onde está o meu pedido', 'meu pedido já saiu?', 'já saiu para entrega?', 'previsão de entrega']) assert.ok(ORDER_STATUS_INTENT.test(q), q);
  for (const q of ['quero 2 heineken', 'qual o horário?', 'vocês entregam?']) assert.ok(!ORDER_STATUS_INTENT.test(q), q);
});

test('IA: resposta do andamento usa só o pedido real (ou diz que não encontrou)', () => {
  const r = orderStatusReply({ id: 'cord123', displayId: 1007, stage: 'Em entrega', updatedAt: new Date('2026-10-26T16:40:00Z') }, 'https://adega-nine.vercel.app', 'loja-x');
  assert.match(r, /#1007: Em entrega \(atualizado às 13:40\)/);
  assert.match(r, /https:\/\/adega-nine\.vercel\.app\/loja\/loja-x\/pedido\/cord123/);
  assert.match(orderStatusReply(null, 'https://x', 'y'), /Não encontrei um pedido recente/);
});
