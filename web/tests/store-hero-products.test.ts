import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHeroProducts } from '../src/lib/store-hero-products';

test('hero without configured highlights uses only photo-backed products from its supplied catalog', () => {
  const missing = { name: 'Skol Lata 350ml', customImageUrl: null };
  const exact = { name: 'Heineken Lata 350ml', customImageUrl: null };
  const custom = { name: 'Produto da loja', customImageUrl: 'https://storage.example/product.jpg' };
  assert.deepEqual(selectHeroProducts([], [missing, exact, custom]), [exact, custom]);
  assert.deepEqual(selectHeroProducts([], [missing]), []);
  assert.deepEqual(selectHeroProducts([missing], [exact]), [missing]);
});
