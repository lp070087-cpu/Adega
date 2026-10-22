import test from 'node:test';
import assert from 'node:assert/strict';
import { orderTracking } from '../src/lib/order-tracking';
import { formatBrazilPhone } from '../src/lib/customer-portal/policy';
import { beverageBusinessTypeSchema, updateOrganizationSchema } from '../src/lib/validations/organization';

const states = (view: ReturnType<typeof orderTracking>) => view.steps.map((step) => step.state);

test('delivery order walks Aceito → Separando → Saiu para entrega → Finalizado from the real status', () => {
  assert.deepEqual(orderTracking({ status: 'NEW', deliveryType: 'DELIVERY' }).phase, 'waiting');
  assert.deepEqual(states(orderTracking({ status: 'NEW', deliveryType: 'DELIVERY' })), ['pending', 'pending', 'pending', 'pending']);
  assert.deepEqual(states(orderTracking({ status: 'CONFIRMED', deliveryType: 'DELIVERY' })), ['current', 'pending', 'pending', 'pending']);
  for (const status of ['PREPARING', 'READY', 'WAITING_DRIVER']) {
    assert.deepEqual(states(orderTracking({ status, deliveryType: 'DELIVERY' })), ['done', 'current', 'pending', 'pending'], status);
  }
  const dispatched = orderTracking({ status: 'DISPATCHED', deliveryType: 'DELIVERY', dispatchedAt: '2026-10-22T15:00:00Z' });
  assert.deepEqual(states(dispatched), ['done', 'done', 'current', 'pending']);
  assert.equal(dispatched.steps[2].label, 'Saiu para entrega');
  assert.equal(dispatched.steps[2].at?.toISOString(), '2026-10-22T15:00:00.000Z');
  const done = orderTracking({ status: 'DELIVERED', deliveryType: 'DELIVERY' });
  assert.deepEqual(states(done), ['done', 'done', 'done', 'done']);
  assert.equal(done.terminal, true);
});

test('pickup orders never show "Saiu para entrega"', () => {
  const view = orderTracking({ status: 'READY', deliveryType: 'PICKUP' });
  assert.deepEqual(view.steps.map((step) => step.label), ['Aceito', 'Separando', 'Pronto para retirada', 'Finalizado']);
  assert.deepEqual(states(view), ['done', 'done', 'current', 'pending']);
  assert.equal(view.steps.some((step) => step.label === 'Saiu para entrega'), false);
  assert.equal(orderTracking({ status: 'DELIVERED', deliveryType: 'PICKUP' }).headline, 'Pedido retirado');
});

test('cancelled orders keep only the stages really reached and are never marked finished', () => {
  const view = orderTracking({ status: 'CANCELLED', deliveryType: 'DELIVERY', acceptedAt: new Date(), preparingAt: new Date(), cancelledAt: new Date() });
  assert.equal(view.phase, 'cancelled');
  assert.deepEqual(states(view), ['done', 'done', 'pending', 'pending']);
  assert.equal(view.terminal, true);
  assert.deepEqual(states(orderTracking({ status: 'CANCELLED', deliveryType: 'DELIVERY' })), ['pending', 'pending', 'pending', 'pending']);
});

test('a failed delivery attempt returns to Separando with a warning instead of looking finished', () => {
  const view = orderTracking({ status: 'READY', deliveryType: 'DELIVERY', deliveryStatus: 'FAILED' });
  assert.deepEqual(states(view), ['done', 'current', 'pending', 'pending']);
  assert.equal(view.noticeTone, 'warning');
  assert.equal(view.terminal, false);
});

test('Brazilian phone mask formats mobile and landline numbers', () => {
  assert.equal(formatBrazilPhone('81999998888'), '(81) 99999-8888');
  assert.equal(formatBrazilPhone('8133334444'), '(81) 3333-4444');
  assert.equal(formatBrazilPhone('81'), '(81');
  assert.equal(formatBrazilPhone('abc'), '');
});

test('every business type input is normalized to beverage stores on the server', () => {
  assert.equal(beverageBusinessTypeSchema.parse('BURGER'), 'BEVERAGE');
  assert.equal(beverageBusinessTypeSchema.parse(undefined), 'BEVERAGE');
  assert.equal(updateOrganizationSchema.parse({ name: 'Adega Central', businessType: 'PIZZA' }).businessType, 'BEVERAGE');
});

test('animated money component formats with the Brazilian pattern and keeps the true value for assistive tech', async () => {
  const { formatBRL } = await import('../src/lib/utils');
  assert.equal(formatBRL(1250).replace(/\s/g, ' '), 'R$ 1.250,00');
  const source = (await import('node:fs')).readFileSync('src/components/ui/AnimatedMoney.tsx', 'utf8');
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /className="sr-only">\{formatBRL\(target\)\}/);
});

test('stock screens never use the money counter animation', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const files = fs.readdirSync('src/app/app/estoque', { recursive: true }).map(String).filter((f) => f.endsWith('.tsx'));
  for (const file of files) assert.doesNotMatch(fs.readFileSync(`src/app/app/estoque/${file}`, 'utf8'), /AnimatedMoney/);
  const inventory = fs.readdirSync('src/components', { recursive: true }).map(String).filter((f) => /inventory|stock|estoque/i.test(f) && f.endsWith('.tsx'));
  for (const file of inventory) assert.doesNotMatch(fs.readFileSync(`src/components/${file}`, 'utf8'), /AnimatedMoney/);
});

test('driver availability is derived from schedule, access and deliveries in progress', async () => {
  const { driverAvailability, canReceiveOrder } = await import('../src/lib/driver-availability');
  assert.equal(driverAvailability({ active: true, activeOrders: 0, onShift: true }), 'AVAILABLE');
  assert.equal(driverAvailability({ active: true, activeOrders: 0 }), 'AVAILABLE');
  assert.equal(driverAvailability({ active: true, activeOrders: 1, onShift: true }), 'BUSY');
  assert.equal(driverAvailability({ active: true, activeOrders: 0, onShift: false }), 'OFF_SHIFT');
  assert.equal(driverAvailability({ active: false, activeOrders: 0 }), 'INACTIVE');
  assert.equal(driverAvailability({ active: true, activeOrders: 0, accessPending: true }), 'PENDING_ACCESS');
  assert.equal(canReceiveOrder({ active: true, activeOrders: 1 }), false);
});

test('install platform detection picks native prompt or the right manual steps', async () => {
  const { detectInstallPlatform } = await import('../src/components/driver/DriverInstall');
  assert.equal(detectInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), 'ios-safari');
  assert.equal(detectInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0 Mobile Safari/604.1'), 'ios-other');
  assert.equal(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', true), 'ios-safari');
  assert.equal(detectInstallPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0 Mobile Safari/537.36'), 'android');
  assert.equal(detectInstallPlatform('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0'), 'desktop');
});
