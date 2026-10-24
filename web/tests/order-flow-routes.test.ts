import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function isolated(file: string, imports: Record<string, unknown>) { const module = { exports: {} as any }; const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText; new Function('require', 'module', 'exports', output)((key: string) => { if (key in imports) return imports[key]; throw Error(`Unexpected ${key}`); }, module, module.exports); return module.exports; }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('one card, one next action: delivery and pickup flows', async () => {
  const { primaryOrderAction, readAutoAccept, isActiveOrder } = await import('../src/lib/order-flow');
  const label = (o: any) => { const a = primaryOrderAction(o); return a ? `${a.kind}:${'to' in a ? a.to : ''}:${a.label}` : null; };
  assert.equal(label({ status: 'NEW', deliveryType: 'DELIVERY' }), 'advance:CONFIRMED:Aceitar');
  assert.equal(label({ status: 'CONFIRMED', deliveryType: 'DELIVERY' }), 'advance:PREPARING:Iniciar separação');
  assert.equal(label({ status: 'PREPARING', deliveryType: 'DELIVERY' }), 'assign::Atribuir entregador');
  assert.equal(label({ status: 'WAITING_DRIVER', deliveryType: 'DELIVERY', driverId: 'd' }), 'advance:DISPATCHED:Saiu para entrega');
  assert.equal(label({ status: 'DISPATCHED', deliveryType: 'DELIVERY', driverId: 'd' }), 'tracking::Em rota de entrega');
  assert.equal(label({ status: 'PREPARING', deliveryType: 'PICKUP' }), 'advance:READY:Pronto para retirada');
  assert.equal(label({ status: 'READY', deliveryType: 'PICKUP' }), 'advance:DELIVERED:Finalizar');
  assert.equal(label({ status: 'DELIVERED' }), null);
  assert.equal(label({ status: 'CANCELLED' }), null);
  assert.equal(isActiveOrder('DISPATCHED'), true); assert.equal(isActiveOrder('DELIVERED'), false);
  assert.equal(readAutoAccept({ orderAutoAccept: true }), true);
  assert.equal(readAutoAccept({ orderAutoAccept: 'yes' }), false);
  assert.equal(readAutoAccept(null), false);
});

test('best stop order minimizes travel time (exact for few stops, heuristic for many)', async () => {
  const { bestStopOrder } = await import('../src/lib/maps/route-order');
  // start 0; stops 1..3 on a line: 0 → 3 → 1 → 2 by position 0,1,2,3 at x = 0, 3, 1, 2
  const x = [0, 3, 1, 2];
  const matrix = x.map((a) => x.map((b) => Math.abs(a - b) * 60));
  assert.deepEqual(bestStopOrder(matrix), [2, 3, 1]);
  const many = Array.from({ length: 11 }, (_, i) => i);
  const big = many.map((a) => many.map((b) => Math.abs(a - b)));
  assert.deepEqual(bestStopOrder(big), many.slice(1));
  assert.deepEqual(bestStopOrder([[0]]), []);
});

test('multi-stop route and duration matrix go through the configured provider only', async () => {
  const original = globalThis.fetch; const urls: string[] = [];
  process.env.ROUTING_PROVIDER = 'osrm'; process.env.OSRM_URL = 'https://osrm.example';
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    if (url.includes('/table/')) return json({ code: 'Ok', durations: [[0, 60, 120], [60, 0, 60], [120, 60, null]] });
    return json({ code: 'Ok', routes: [{ distance: 3000, duration: 600, geometry: { coordinates: [[-34.9, -8.05], [-34.89, -8.04], [-34.88, -8.03]] }, legs: [{ distance: 1000, duration: 200 }, { distance: 2000, duration: 400 }] }] });
  }) as any;
  try {
    const { streetRouteThrough, durationMatrix } = isolated('src/lib/maps/routing.ts', { 'server-only': {} });
    const route = await streetRouteThrough([{ latitude: -8.05, longitude: -34.9 }, { latitude: -8.04, longitude: -34.89 }, { latitude: -8.03, longitude: -34.88 }]);
    assert.equal(route.available, true);
    assert.deepEqual(route.legs, [{ distanceMeters: 1000, durationSeconds: 200 }, { distanceMeters: 2000, durationSeconds: 400 }]);
    assert.deepEqual(route.coordinates[0], [-8.05, -34.9]);
    assert.match(urls[0], /route\/v1\/driving\/-34\.9,-8\.05;-34\.89,-8\.04;-34\.88,-8\.03/);
    const matrix = await durationMatrix([{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }, { latitude: 3, longitude: 3 }]);
    assert.equal(matrix![2][2], Number.POSITIVE_INFINITY);
    assert.equal(await streetRouteThrough([{ latitude: 1, longitude: 1 }]).then((r: any) => r.available), false);
    delete process.env.ROUTING_PROVIDER;
    assert.deepEqual(await streetRouteThrough([{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }]), { available: false, reason: 'not_configured' });
    assert.equal(await durationMatrix([{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }]), null);
  } finally { globalThis.fetch = original; delete process.env.OSRM_URL; delete process.env.ROUTING_PROVIDER; }
});

test('store side never receives driver coordinates', () => {
  for (const file of ['src/lib/data/drivers.ts', 'src/app/app/expedicao/page.tsx', 'src/app/app/entregadores/page.tsx', 'src/components/dispatch/DispatchBoard.tsx', 'src/components/drivers/DriversManager.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /locations:|lastLocation|driverLocation\.create|position:/, file);
  }
  assert.doesNotMatch(readFileSync('src/app/actions/orders.ts', 'utf8'), /sendDriverLocationAction/);
});

test('checkout: first name only, phone, full address with number or S/N, and pin or reference for delivery', async () => {
  const { checkoutSchema } = await import('../src/lib/validations/order');
  const base = { slug: 'loja', customerName: 'Ana', customerPhone: '81999998888', items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'CASH' };
  const delivery = { ...base, deliveryType: 'DELIVERY', deliveryAddress: 'Rua das Flores', deliveryNumber: '10', deliveryDistrict: 'Centro', deliveryCity: 'Recife' };
  const err = (input: unknown) => { const r = checkoutSchema.safeParse(input); return r.success ? null : r.error.errors[0]?.path[0]; };
  assert.equal(err({ ...delivery, deliveryLatitude: -8.05, deliveryLongitude: -34.9 }), null);
  assert.equal(err({ ...delivery, deliveryReference: 'Portão azul ao lado da padaria' }), null);
  assert.equal(err(delivery), 'deliveryReference');
  assert.equal(err({ ...delivery, deliveryNumber: undefined, deliveryLatitude: -8, deliveryLongitude: -34 }), 'deliveryNumber');
  assert.equal(err({ ...delivery, deliveryNumber: 'S/N', deliveryLatitude: -8, deliveryLongitude: -34 }), null);
  assert.equal(err({ ...delivery, deliveryDistrict: undefined, deliveryLatitude: -8, deliveryLongitude: -34 }), 'deliveryDistrict');
  assert.equal(err({ ...delivery, deliveryAddress: undefined, deliveryLatitude: -8, deliveryLongitude: -34 }), 'deliveryAddress');
  assert.notEqual(err({ ...delivery, deliveryLatitude: -8 }), null, 'meia coordenada é recusada');
  assert.equal(err({ ...delivery, customerName: '', deliveryLatitude: -8, deliveryLongitude: -34 }), 'customerName');
  assert.equal(err({ ...delivery, customerPhone: '', deliveryLatitude: -8, deliveryLongitude: -34 }), 'customerPhone');
  assert.equal(err({ ...base, deliveryType: 'PICKUP' }), null, 'retirada não exige endereço');
});
