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
