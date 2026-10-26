import test from 'node:test';
import assert from 'node:assert/strict';
import { fiscalProfileProblems, EMPTY_FISCAL } from '../src/lib/fiscal';
import { buildNfcePayload } from '../src/lib/fiscal-provider';

const profile = { ...EMPTY_FISCAL, legalName: 'Adega Teste LTDA', cnpj: '11222333000181', stateRegistration: '123456789', regime: 'SIMPLES' as const, documentType: 'NFCE' as const, defaultNcm: '22030000', defaultCfop: '5102', icmsCode: '102', origin: '0' as const };

test('NFC-e exige cadastro tributário completo', () => {
  assert.deepEqual(fiscalProfileProblems(profile), []);
  assert.deepEqual(fiscalProfileProblems({ ...profile, defaultNcm: '', icmsCode: '' }), ['NCM padrão dos produtos', 'CSOSN/CST do ICMS']);
  assert.ok(fiscalProfileProblems(EMPTY_FISCAL).includes('Razão social e CNPJ'));
});

test('NFC-e montada com os valores do pedido gravado (itens, frete, desconto e pagamento)', () => {
  const p = buildNfcePayload(profile, { createdAt: new Date('2026-10-26T12:00:00Z'), deliveryType: 'DELIVERY', deliveryFee: 6.9, discount: 2, total: 32.88, paymentMethod: 'PIX', items: [{ productId: 'p1', productName: 'Heineken 330ml', quantity: 2, total: 13.98 }, { productId: 'p2', productName: 'Gelo 5kg', quantity: 1, total: 14 }] });
  assert.equal(p.cnpj_emitente, '11222333000181');
  assert.equal(p.presenca_comprador, '4');
  assert.equal(p.items.length, 2);
  assert.equal(p.items[0].valor_unitario_comercial, 6.99);
  assert.equal(p.items[0].codigo_ncm, '22030000');
  assert.equal(p.items[1].icms_situacao_tributaria, '102');
  assert.equal(p.valor_frete, 6.9); assert.equal(p.valor_desconto, 2);
  assert.deepEqual(p.formas_pagamento, [{ forma_pagamento: '17', valor_pagamento: 32.88 }]);
});
