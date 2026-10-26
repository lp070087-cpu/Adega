import test from 'node:test';
import assert from 'node:assert/strict';
import { maxTierKm, tierForDistance, tierLabel, tierProblems } from '../src/lib/delivery-tiers';

const tiers = [{ upToKm: 4, fee: 8 }, { upToKm: 2, fee: 5 }, { upToKm: 8, fee: 16 }, { upToKm: 6, fee: 12 }];

test('faixas ordenadas: cada distância cai na faixa certa e além da última fica fora', () => {
  assert.equal(tierForDistance(tiers, 0.5).tier?.fee, 5);
  assert.equal(tierForDistance(tiers, 2).tier?.fee, 5);
  assert.equal(tierForDistance(tiers, 2.01).tier?.fee, 8);
  assert.equal(tierForDistance(tiers, 5.9).tier?.fee, 12);
  assert.equal(tierForDistance(tiers, 8).tier?.fee, 16);
  const out = tierForDistance(tiers, 8.2);
  assert.equal(out.outside, true); assert.equal(out.tier, null);
  assert.equal(maxTierKm(tiers), 8);
  assert.equal(tierLabel(tiers, 0), 'Até 2 km');
  assert.equal(tierLabel(tiers, 1), 'Acima de 2 até 4 km');
});

test('faixas inválidas são apontadas', () => {
  assert.deepEqual(tierProblems(tiers), []);
  assert.match(tierProblems([{ upToKm: 2, fee: 5 }, { upToKm: 2, fee: 6 }]).join(), /limite diferente/);
  assert.match(tierProblems([{ upToKm: 0, fee: 5 }]).join(), /maior que zero/);
  assert.match(tierProblems([{ upToKm: 3, fee: -1 }]).join(), /negativa/);
});

test('exemplo de múltiplos raios: 0–2 R$5, 2–5 R$8, 5–8 R$12, 8–12 R$18 com limites exatos', () => {
  const ex = [{ upToKm: 5, fee: 8 }, { upToKm: 12, fee: 18 }, { upToKm: 2, fee: 5 }, { upToKm: 8, fee: 12 }];
  const fee = (km: number) => tierForDistance(ex, km).tier?.fee ?? null;
  assert.deepEqual([0, 2, 2.001, 5, 5.001, 8, 8.001, 12].map(fee), [5, 5, 8, 8, 12, 12, 18, 18]);
  assert.equal(tierForDistance(ex, 12.001).outside, true);
  assert.deepEqual([0, 1, 2, 3].map((i) => tierLabel(ex, i)), ['Até 2 km', 'Acima de 2 até 5 km', 'Acima de 5 até 8 km', 'Acima de 8 até 12 km']);
  assert.deepEqual(tierProblems(ex), []);
});

test('servidor: uma única faixa por pedido, pelas ruas quando houver rota, em linha reta rotulada quando não', async () => {
  const { explainDeliveryFee } = await import('../src/lib/data/delivery-fee');
  const settings = { baseDeliveryFee: 9, extraKmFee: 0, deliveryRadius: 50, latitude: -23.56, longitude: -46.65, feeMode: 'BY_DISTANCE_BAND', tiers: [{ upToKm: 2, fee: 5 }, { upToKm: 5, fee: 8 }, { upToKm: 8, fee: 12 }, { upToKm: 12, fee: 18 }] };
  const street = explainDeliveryFee(settings, { latitude: -23.561, longitude: -46.651, roadKm: 5 });
  assert.equal(street.fee, 8); assert.equal(street.distanceKind, 'street'); assert.equal(street.distanceKm, 5);
  const streetOver = explainDeliveryFee(settings, { latitude: -23.561, longitude: -46.651, roadKm: 5.4 });
  assert.equal(streetOver.fee, 12, 'a rota pelas ruas manda mesmo com o ponto perto em linha reta');
  const straight = explainDeliveryFee(settings, { latitude: -23.56 + 0.05, longitude: -46.65 }); // ~5,6 km em linha reta
  assert.equal(straight.distanceKind, 'straight'); assert.equal(straight.fee, 12);
});
