import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { customerManifest, networkOnlyWorker, storeAppPath } from '../src/lib/pwa';
import { canonicalAppPath, requiresSessionMiddleware } from '../src/lib/pwa-paths';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';

test('three installed experiences have distinct identities; each customer store remains separate', () => {
  const driver = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  const panel = JSON.parse(readFileSync('public/pwa/panel.webmanifest', 'utf8'));
  const a = customerManifest({ slug: 'loja-a', name: 'Loja A', brandColor: '#123456' });
  const b = customerManifest({ slug: 'loja-b', name: 'Loja B', brandColor: '#abcdef' });
  assert.equal(new Set([driver.id, panel.id, a.id, b.id]).size, 4);
  assert.equal(a.start_url, '/loja/loja-a/');
  assert.equal(a.scope, '/loja/loja-a/');
  assert.equal('/loja/loja-a-outra/'.startsWith(a.scope!), false);
  assert.equal('/app-outro/'.startsWith(panel.scope), false);
  assert.equal('/entregador-outro/'.startsWith(driver.scope), false);
  assert.equal(a.name, 'Loja A');
  assert.equal(a.theme_color, '#123456');
  assert.equal(panel.start_url.startsWith(panel.scope), true);
  assert.equal(driver.start_url.startsWith(driver.scope), true);
  assert.doesNotMatch(readFileSync('src/app/layout.tsx', 'utf8'), /manifest:\s*['"]\/manifest.webmanifest/);
});

test('only installable app roots preserve slash; protected routes still delegate to Auth.js', () => {
  assert.equal(canonicalAppPath('/loja/loja-a'), '/loja/loja-a/');
  assert.equal(canonicalAppPath('/loja/loja-a/'), null);
  assert.equal(canonicalAppPath('/loja/loja-a///'), '/loja/loja-a/');
  assert.equal(canonicalAppPath('/entregador'), '/entregador/');
  assert.equal(canonicalAppPath('/entregador/'), null);
  for (const path of ['/app/pedidos/', '/onboarding/', '/login/', '/admin/', '/entregador/acesso/']) assert.equal(canonicalAppPath(path), path.slice(0, -1));
  assert.equal(canonicalAppPath('/'), null);
  for (const path of ['/app', '/app/dashboard', '/onboarding', '/onboarding/etapa']) assert.equal(requiresSessionMiddleware(path), true);
  for (const path of ['/loja/loja-a/', '/entregador/', '/login', '/cadastro', '/application', '/onboarding-outro', '/pwa/panel-sw.js']) assert.equal(requiresSessionMiddleware(path), false);
});

test('middleware preserves product query parameters and never bypasses authentication on protected canonical URLs', () => {
  const calls: string[] = [];
  const imports: Record<string, unknown> = {
    'next-auth': { default: () => ({ auth: (_handler: unknown) => (request: any) => { calls.push(request.nextUrl.pathname); return 'auth-result'; } }) },
    '@/lib/auth/config': { authConfig: {} },
    '@/lib/pwa-paths': { canonicalAppPath, requiresSessionMiddleware },
    'next/server': { NextResponse: { redirect: (url: URL, status: number) => ({ url: url.href, status }), next: () => 'public-result' } },
  };
  const compiled = ts.transpileModule(readFileSync('src/middleware.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', compiled)((name: string) => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; }, module, module.exports);
  function request(path: string) {
    const url = new URL(path, 'https://adega.example');
    return { url: url.href, nextUrl: Object.assign(url, { clone: () => new URL(url.href) }) };
  }
  const middleware = module.exports.default;
  assert.deepEqual(middleware(request('/loja/adega?produto=produto-real&variacao=caixa')), { url: 'https://adega.example/loja/adega/?produto=produto-real&variacao=caixa', status: 308 });
  assert.equal(middleware(request('/loja/adega/')), 'public-result');
  assert.equal(middleware(request('/entregador/')), 'public-result');
  assert.equal(middleware(request('/app/pedidos')), 'auth-result');
  assert.equal(middleware(request('/onboarding')), 'auth-result');
  assert.deepEqual(calls, ['/app/pedidos', '/onboarding']);
});

test('real NextRequest and NextResponse preserve canonical slash without self redirect', () => {
  const imports: Record<string, unknown> = {
    'next-auth': { default: () => ({ auth: (_handler: unknown) => () => NextResponse.next() }) },
    '@/lib/auth/config': { authConfig: {} },
    '@/lib/pwa-paths': { canonicalAppPath, requiresSessionMiddleware },
    'next/server': { NextResponse },
  };
  const compiled = ts.transpileModule(readFileSync('src/middleware.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', compiled)((name: string) => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; }, module, module.exports);
  const middleware = module.exports.default;
  for (const [path, expected] of [
    ['/entregador', '/entregador/'],
    ['/loja/adega?produto=cerveja&variacao=caixa', '/loja/adega/?produto=cerveja&variacao=caixa'],
    ['/app/pedidos/', '/app/pedidos'],
  ]) {
    const original = `https://adega.example${path}`;
    const response = middleware(new NextRequest(original), {});
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), `https://adega.example${expected}`);
    assert.notEqual(response.headers.get('location'), original);
    const canonical = middleware(new NextRequest(response.headers.get('location')!), {});
    assert.equal(canonical.status, 200);
    assert.equal(canonical.headers.get('location'), null);
  }
});

test('customer manifest rejects untrusted slugs and invalid theme colors', () => {
  for (const slug of ['../admin', 'loja/a', '<script>', 'loja?a=1', '', 'A', 'x'.repeat(161)]) assert.throws(() => storeAppPath(slug));
  assert.equal(customerManifest({ slug: 'loja-a', name: 'A', brandColor: 'url(evil)' }).theme_color, '#F15A24');
  assert.throws(() => networkOnlyWorker('/admin', 'admin'));
});

function workerHarness(base: string, offline = false) {
  const handlers: Record<string, (event: any) => void> = {};
  const requests: Array<{ request: unknown; options: unknown }> = [];
  runInNewContext(networkOnlyWorker(base, 'seus pedidos'), {
    self: { location: { origin: 'https://adega.example' }, clients: { claim: async () => {} }, skipWaiting() {}, addEventListener: (name: string, handler: any) => { handlers[name] = handler; } },
    URL, Response,
    fetch: async (request: unknown, options: unknown) => { requests.push({ request, options }); if (offline) throw new Error('offline'); return new Response('online'); },
  });
  return {
    requests,
    navigate: (url: string, method = 'GET', mode = 'navigate') => {
      let response: Promise<Response> | undefined;
      handlers.fetch({ request: { url, method, mode }, respondWith: (value: Promise<Response>) => { response = value; } });
      return response;
    },
  };
}

test('customer worker never intercepts another store, admin, API or mutations', async () => {
  const worker = workerHarness('/loja/loja-a');
  for (const path of ['/loja/loja-b', '/loja/loja-a-outra', '/admin', '/app', '/api/pedidos']) assert.equal(worker.navigate(`https://adega.example${path}`), undefined);
  assert.equal(worker.navigate('https://other.example/loja/loja-a'), undefined);
  assert.equal(worker.navigate('https://adega.example/loja/loja-a', 'POST'), undefined);
  assert.equal(worker.navigate('https://adega.example/loja/loja-a', 'GET', 'cors'), undefined);
  assert.equal(await (await worker.navigate('https://adega.example/loja/loja-a'))?.text(), 'online');
  assert.equal(await (await worker.navigate('https://adega.example/loja/loja-a/pedido/abc'))?.text(), 'online');
  assert.equal(worker.requests.length, 2);
  assert.equal((worker.requests[0].options as { cache: string }).cache, 'no-store');
});

test('offline fallback is explicit and contains no cached customer data', async () => {
  const worker = workerHarness('/app', true);
  const response = await worker.navigate('https://adega.example/app/pedidos');
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get('Cache-Control'), 'no-store');
  assert.match(await response!.text(), /Nenhuma alteração foi enviada/);
  assert.doesNotMatch(networkOnlyWorker('/app', 'o painel'), /caches\.|indexedDB|localStorage|sync/);
});

test('each experience provides real install icons with declared PNG dimensions', () => {
  for (const name of ['panel', 'customer']) for (const size of [192, 512]) {
    const icon = readFileSync(`public/pwa/${name}-${size}.png`);
    assert.equal(icon.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(icon.readUInt32BE(16), size);
    assert.equal(icon.readUInt32BE(20), size);
  }
});

test('install UI offers browser-specific instructions without claiming push or an APK', () => {
  const source = readFileSync('src/components/pwa/InstallApp.tsx', 'utf8');
  assert.match(source, /beforeinstallprompt/);
  assert.match(source, /iPhone\/iPad/);
  assert.match(source, /Android/);
  assert.match(source, /Desktop/);
  assert.match(source, /updateViaCache: 'none'/);
  assert.doesNotMatch(source, /\.apk|Notification\.requestPermission|pushManager/);
  const driver = readFileSync('src/components/driver/DriverInstall.tsx', 'utf8');
  assert.match(driver, /window\.location\.pathname/);
  assert.match(driver, /registration\.scope === legacyScope/);
});
