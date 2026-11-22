import test from 'node:test';
import assert from 'node:assert/strict';
import { pickupCodeFromText, pickupQrText } from '../src/lib/delivery-pickup-code';
import { earningsDateBounds } from '../src/lib/driver-earnings';

test('printed collection codes round-trip as QR and manual plate format', () => {
  assert.equal(pickupCodeFromText(pickupQrText('ABC1D23')), 'ABC1D23');
  assert.equal(pickupCodeFromText(' abc-1d23 '), 'ABC1D23');
  assert.equal(pickupCodeFromText('ABC1234'), null);
  assert.equal(pickupCodeFromText('https://example.com/ABC1D23'), null);
});

test('custom earnings dates include the complete final day in the store timezone', () => {
  const range = earningsDateBounds({ from: '2026-11-01', to: '2026-11-02' }, 'America/Recife');
  assert.equal(range?.gte.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(range?.lt.toISOString(), '2026-11-03T03:00:00.000Z');
  assert.equal(earningsDateBounds({ from: '2026-02-30', to: '2026-03-01' }, 'America/Recife'), null);
  assert.equal(earningsDateBounds({ from: '2026-03-02', to: '2026-03-01' }, 'America/Recife'), null);
});
