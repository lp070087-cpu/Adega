import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANNER_LIBRARY, renderableBanners } from '../src/lib/banner-image';

test('published banner library contains actual wide PNG images', () => {
  const desktop=BANNER_LIBRARY.filter(b=>b.file.endsWith('.png'));
  assert.equal(desktop.length, 4);
  for (const banner of desktop) {
    const bytes = readFileSync(`public${banner.path}`);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    assert.ok(width >= 1200 && width / height >= 1.9 && width / height <= 2.5);
  }
});

test('three mobile templates embed the exact deployed photographs without remote dependencies',()=>{
  const mobile=BANNER_LIBRARY.filter(b=>b.file.endsWith('.svg'));
  assert.equal(mobile.length,3);
  const photos=['cervejas/heineken-lata-350ml.jpeg','whisky/whisky-red-label-1l.jpeg','refrigerantes/guarana-antarctica-garrafa-2l.jpeg'];
  mobile.forEach((banner,index)=>{
    const svg=readFileSync(`public${banner.path}`,'utf8');
    assert.ok(svg.includes('viewBox="0 0 800 520"'));
    assert.ok(svg.includes(readFileSync(`public/catalog/bebidas/${photos[index]}`).toString('base64')));
    assert.equal(/<script|onload=|https?:\/\/[^\s]*\.jpe?g/.test(svg),false);
  });
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
