import test from 'node:test';
import assert from 'node:assert/strict';
import { fiscalProfileProblems, EMPTY_FISCAL, fiscalProfileSchema, productFiscalSchema, readProductFiscal, validFiscalCnpj, type FiscalProfile, type ProductFiscal } from '../src/lib/fiscal';
import { buildNfcePayload, fiscalCredentials, readFiscalProvider } from '../src/lib/fiscal-provider';
import { BR_UFS } from '../src/lib/br-ufs';

const profile: FiscalProfile = { ...EMPTY_FISCAL, legalName: 'Adega Teste LTDA', cnpj: '11222333000181', stateRegistration: '123456789', uf: 'PE', regime: 'SIMPLES', documentType: 'NFCE' };
const beer: ProductFiscal = { ncm: '22030000', cest: '', cfop: '5102', icmsCode: '102', origin: '0', unit: 'UN', icmsRate: null, pisCode: '07', pisRate: null, cofinsCode: '07', cofinsRate: null };
const ice = { ...beer, ncm: '22019000' };
const issuedAt = new Date('2026-11-22T12:00:00Z');
const sale = {
  deliveryType: 'DELIVERY', deliveryFee: 6.9, discount: 2, total: 32.88, paymentMethod: 'PIX',
  destination: { zip: '50010000', street: 'Rua de Teste', number: '10', district: 'Bairro', city: 'Recife', uf: 'PE', name: 'Cliente de teste' },
  items: [
    { productId: 'a', productName: 'Cerveja', quantity: 2, total: 13.98, fiscal: beer },
    { productId: 'b', productName: 'Gelo', quantity: 1, total: 14, fiscal: ice },
  ],
};

test('cadastro fiscal atende todas as UFs e exige UF explícita para emissão', () => {
  for (const uf of BR_UFS) assert.deepEqual(fiscalProfileProblems(fiscalProfileSchema.parse({ ...profile, uf })), []);
  assert.ok(fiscalProfileProblems(EMPTY_FISCAL).includes('UF do emitente'));
  assert.equal(fiscalProfileSchema.safeParse({ ...profile, uf: '16' }).success, false);
  assert.equal(fiscalProfileSchema.safeParse({ ...profile, uf: 'XX' }).success, false);
  assert.equal(fiscalProfileSchema.parse({ ...profile, cnpj: '12.ABC.345/01DE-35' }).cnpj, '12ABC34501DE35');
  assert.equal(validFiscalCnpj('12ABC34501DE35'), true);
  assert.equal(validFiscalCnpj('12ABC34501DE36'), false);
});

test('só usa dados fiscais cadastrados para o produto, inclusive ICMS-ST', () => {
  assert.equal(readProductFiscal({ fiscalProducts: { a: beer } }, 'b'), null);
  assert.deepEqual(readProductFiscal({ fiscalProducts: { a: beer } }, 'a'), beer);
  assert.equal(productFiscalSchema.safeParse({ ...beer, icmsCode: '500' }).success, false);
  assert.equal(productFiscalSchema.safeParse({ ...beer, cfop: '6102' }).success, false);
  assert.equal(productFiscalSchema.safeParse({ ...beer, pisCode: '01', pisRate: null }).success, false);
  assert.throws(() => buildNfcePayload({ ...profile, regime: 'REAL' }, sale), /CST de ICMS/);
});

test('NFC-e usa data de emissão e a tributação individual com rateio exato', () => {
  const payload = buildNfcePayload(profile, sale, issuedAt);
  assert.equal(payload.cnpj_emitente, profile.cnpj);
  assert.equal(payload.data_emissao, issuedAt.toISOString());
  assert.equal(payload.presenca_comprador, '4');
  assert.equal(payload.uf_destinatario, 'PE');
  assert.equal(payload.items[0].valor_unitario_comercial, 6.99);
  assert.equal(payload.items[0].codigo_ncm, '22030000');
  assert.equal(payload.items[1].codigo_ncm, '22019000');
  assert.equal(payload.items[1].icms_situacao_tributaria, '102');
  assert.equal(payload.items.reduce((sum, i) => sum + (i.valor_frete ?? 0), 0), 6.9);
  assert.equal(payload.items.reduce((sum, i) => sum + (i.valor_desconto ?? 0), 0), 2);
  assert.deepEqual(payload.formas_pagamento, [{ forma_pagamento: '17', valor_pagamento: 32.88 }]);
  assert.throws(() => buildNfcePayload(profile, { ...sale, destination: { ...sale.destination, uf: 'PB' } }), /dentro da UF/);
  assert.throws(() => buildNfcePayload(profile, { ...sale, total: 20 }), /valores do pedido/);
  assert.throws(() => buildNfcePayload(profile, { ...sale, paymentMethod: 'ONLINE' }), /meio de pagamento/);
});

test('credenciais ficam em seu ambiente e configuração antiga continua legível', () => {
  const legacy = { fiscalProvider: { environment: 'homologacao', encrypted: 'old' } };
  assert.equal(readFiscalProvider(legacy).encrypted, 'old');
  assert.equal(fiscalCredentials(legacy, 'producao').encrypted, undefined);
  const both = { fiscalProvider: { environment: 'producao', credentials: { homologacao: 'test', producao: 'live' } } };
  assert.equal(readFiscalProvider(both).encrypted, 'live');
  assert.equal(fiscalCredentials(both, 'homologacao').encrypted, 'test');
});
