import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinatesFromMapLink, isShortMapLink } from '../src/lib/maps/map-link';

test('lê coordenadas dos formatos comuns de link', () => {
  const cases: Array<[string, number, number]> = [
    ['https://www.google.com/maps/place/Rua+das+Meninas,+27/@-8.0045,-34.8957,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-8.004548!4d-34.895748', -8.004548, -34.895748],
    ['https://www.google.com/maps/@-8.0611,-34.8716,15z', -8.0611, -34.8716],
    ['https://maps.google.com/?q=-8.05,-34.9', -8.05, -34.9],
    ['https://www.google.com/maps/search/?api=1&query=-23.5614%2C-46.6558', -23.5614, -46.6558],
    ['https://www.openstreetmap.org/?mlat=-7.12&mlon=-34.84#map=17/-7.12/-34.84', -7.12, -34.84],
    ['https://www.openstreetmap.org/#map=18/-7.1195/-34.8450', -7.1195, -34.845],
    ['https://maps.apple.com/?ll=-22.9,-43.2&q=Loja', -22.9, -43.2],
    ['https://waze.com/ul?ll=-8.1%2C-34.91&navigate=yes', -8.1, -34.91],
    ['geo:-8.2,-35.0', -8.2, -35],
    ['-8.004548, -34.895748', -8.004548, -34.895748],
  ];
  for (const [url, lat, lng] of cases) assert.deepEqual(coordinatesFromMapLink(url), { latitude: lat, longitude: lng }, url);
});

test('não inventa coordenada', () => {
  for (const url of ['https://maps.app.goo.gl/AbCdEf123', 'https://www.google.com/maps/place/Rua+das+Meninas', 'texto qualquer', '', 'https://x.test/@200,10', '0,0']) assert.equal(coordinatesFromMapLink(url), null, url);
  assert.equal(isShortMapLink('https://maps.app.goo.gl/AbCdEf123'), true);
  assert.equal(isShortMapLink('http://maps.app.goo.gl/x'), false);
  assert.equal(isShortMapLink('https://evil.test/x'), false);
});
