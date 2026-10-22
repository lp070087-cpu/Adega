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
