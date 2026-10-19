import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANNER_LIBRARY, renderableBanners } from '../src/lib/banner-image';

test('published banner library contains actual wide PNG images', () => {
  assert.equal(BANNER_LIBRARY.length, 4);
  for (const banner of BANNER_LIBRARY) {
    const bytes = readFileSync(`public${banner.path}`);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    assert.ok(width >= 1200 && width / height >= 1.9 && width / height <= 2.5);
  }
});

test('hero skips invalid and failed images, preserves configured content/order and has no automatic library assignment', () => {
  const configured = [
    { id: 'invalid', imagePath: 'C:\\local\\banner.png' },
    { id: 'first', imagePath: ' /catalog/banners/banner-01.png ', title: 'Loja A' },
    { id: 'failed', imagePath: 'https://storage.example/missing.png' },
    { id: 'second', imagePath: '/catalog/banners/banner-02.png' },
    { id: 'script', imagePath: 'javascript:alert(1)' },
  ];
  assert.deepEqual(renderableBanners(configured, ['https://storage.example/missing.png']).map(b => b.id), ['first', 'second']);
  assert.equal(renderableBanners(configured)[0]?.imagePath, '/catalog/banners/banner-01.png');
  assert.deepEqual(renderableBanners([]), []);
  assert.equal(configured[1]?.imagePath, ' /catalog/banners/banner-01.png ');
});
