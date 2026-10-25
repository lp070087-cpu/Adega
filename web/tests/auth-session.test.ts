import test from 'node:test';
import assert from 'node:assert/strict';
import { authConfig } from '../src/lib/auth/config';

const session = (token: Record<string, unknown>) => (authConfig.callbacks!.session as any)({ session: { user: {}, expires: '' }, token });

test('painel sem "Manter conectado": sessão expira no prazo gravado no token', () => {
  assert.equal(session({ userId: 'u1', role: 'OWNER', sessionUntil: Date.now() + 60_000 }).user.id, 'u1');
  assert.equal(session({ userId: 'u1', role: 'OWNER', sessionUntil: Date.now() - 1 }).user.id, '');
  assert.equal(session({ userId: 'u1', role: 'OWNER' }).user.id, 'u1', 'tokens antigos sem prazo continuam válidos');
});

test('entregador segue a própria regra de sessão', () => {
  assert.equal(session({ userId: 'd1', role: 'DRIVER', sessionUntil: Date.now() - 1, driverSessionUntil: Date.now() + 60_000 }).user.id, 'd1');
  assert.equal(session({ userId: 'd1', role: 'DRIVER', driverSessionUntil: Date.now() - 1 }).user.id, '');
});

test('jwt copia o prazo da sessão do login', () => {
  const token = (authConfig.callbacks!.jwt as any)({ token: {}, user: { id: 'u1', role: 'OWNER', sessionUntil: 123 } });
  assert.equal(token.sessionUntil, 123);
});
