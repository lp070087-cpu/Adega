import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_PHOTOS } from '../src/lib/catalog-photo-manifest';
import { productImageCandidates, catalogImageCandidates } from '../src/lib/catalog-images';

test('every indexed photograph is physically deployed inside public/catalog', () => {
  assert.ok(Object.keys(CATALOG_PHOTOS).length >= 40);
  for (const photo of Object.values(CATALOG_PHOTOS)) {
    assert.ok(photo.startsWith('/catalog/'));
    assert.ok(existsSync(join(process.cwd(), 'public', photo)), photo);
  }
});

test('exact name photo is used after store and global image preferences', () => {
  const candidates = productImageCandidates({
    customImageUrl: '/uploads/store.jpg',
    globalImageUrl: 'bebidas/cervejas/heineken-lata-350ml',
    productName: 'Heineken Lata 350ml',
  });
  assert.equal(candidates[0], '/uploads/store.jpg');
  assert.ok(candidates.includes('/catalog/bebidas/cervejas/heineken-lata-350ml.jpeg'));
  assert.equal(productImageCandidates({ productName: 'Heineken Lata 350ml' })[0], '/catalog/bebidas/cervejas/heineken-lata-350ml.jpeg');
});

test('no fuzzy brand or volume matching and no known wrong-volume legacy photos', () => {
  assert.deepEqual(productImageCandidates({ productName: 'Heineken Lata 473ml' }), []);
  assert.equal(productImageCandidates({ productName: 'Brahma Litrão 1L' })[0], '/catalog/bebidas/cervejas/brahma-litrao-1l.jpg');
  assert.equal(productImageCandidates({ productName: 'Brahma Litrinho 300ml' })[0], '/catalog/bebidas/cervejas/brahma-litrinho-300ml.jpg');
  assert.deepEqual(productImageCandidates({ productName: 'Brahma Litrinho 355ml' }), []);
  assert.deepEqual(catalogImageCandidates('bebidas/cervejas/brahma-chopp-lata-350ml'), []);
  assert.deepEqual(catalogImageCandidates('/catalog/bebidas/cervejas/brahma-chopp-lata-350ml.jpeg'), []);
  assert.deepEqual(productImageCandidates({ productName: 'Skol Lata 350ml' }), []);
  assert.equal(productImageCandidates({ productName: 'Skol Garrafa 600ml' })[0], '/catalog/bebidas/cervejas/skol-garrafa-600ml.jpg');
  assert.equal(productImageCandidates({ productName: 'Chocolate Lacta Oreo 80g' })[0], '/catalog/conveniencia/chocolates/chocolate-lacta-oreo-80g.jpeg');
  assert.deepEqual(productImageCandidates({ productName: 'Chocolate Lacta Oreo 90g' }), []);
  assert.deepEqual(catalogImageCandidates('/catalog/bebidas/cervejas/original-lata-350ml.webp'), []);
  assert.deepEqual(catalogImageCandidates('/catalog/conveniencia/chocolates/chocolate-lacta-shot-40g.jpeg'), []);
});
