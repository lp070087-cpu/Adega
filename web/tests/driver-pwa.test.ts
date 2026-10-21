import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('driver service worker leaves APIs, mutations and other tenant pages untouched', async () => {
  const handlers: Record<string, Function> = {}; let fetches = 0;
  vm.runInNewContext(readFileSync('public/driver-sw.js', 'utf8'), { self: { addEventListener: (name: string, fn: Function) => { handlers[name] = fn; }, location: { origin: 'https://example.test' } }, URL, Response, fetch: async () => { fetches++; throw Error('offline'); } });
  let response: Promise<Response> | null = null;
  for (const request of [{ method: 'POST', mode: 'navigate', url: 'https://example.test/entregador' }, { method: 'GET', mode: 'cors', url: 'https://example.test/api/orders' }, { method: 'GET', mode: 'navigate', url: 'https://example.test/app/clientes' }]) handlers.fetch({ request, respondWith: (value: Promise<Response>) => { response = value; } });
  assert.equal(fetches, 0); assert.equal(response, null);
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/entregador' }, respondWith: (value: Promise<Response>) => { response = value; } });
  const offline: Response = await response!; assert.equal(offline.status, 503); assert.equal(offline.headers.get('Cache-Control'), 'no-store'); assert.match(await offline.text(), /Nenhuma alteração foi enviada/);
});
test('driver manifest icons exist and start in authenticated driver area without granting access', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.id, '/entregador'); assert.equal(manifest.start_url, '/entregador/'); assert.equal(manifest.scope, '/entregador/'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(readFileSync(`public${icon.src}`).length > 0);
});
