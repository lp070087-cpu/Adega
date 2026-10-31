import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeSignupCode, MetaError, readSignupMessage, verifyPhoneNumber } from '../src/lib/assistant/meta-connect';

const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test('número só é confirmado com a resposta da Meta para o mesmo id', async () => {
  const ok = await verifyPhoneNumber('v21.0', '123456', 'token', answer(200, { id: '123456', verified_name: 'Loja', display_phone_number: '+55 81 9999' }));
  assert.equal(ok.name, 'Loja');
  await assert.rejects(verifyPhoneNumber('v21.0', '123456', 'token', answer(200, { id: '999' })), MetaError);
});

test('erro mostrado na tela é o da Meta, com código', async () => {
  await assert.rejects(verifyPhoneNumber('v21.0', '123456', 'token', answer(401, { error: { message: 'Invalid OAuth access token', code: 190 } })), (error: MetaError) => {
    assert.equal(error.status, 401);
    assert.match(error.message, /Invalid OAuth access token \(código 190\)/);
    return true;
  });
  const down = (async () => { throw new Error('rede'); }) as typeof fetch;
  await assert.rejects(verifyPhoneNumber('v21.0', '123456', 'token', down), (error: MetaError) => error.status === null);
  await assert.rejects(exchangeSignupCode('v21.0', { appId: 'a', appSecret: 's', code: 'c' }, answer(200, {})), MetaError);
});

test('janela da Meta: só conclusão com número e conta completa o fluxo', () => {
  assert.deepEqual(readSignupMessage(JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { phone_number_id: '1', waba_id: '2' } })), { event: 'FINISH', phoneNumberId: '1', wabaId: '2' });
  assert.equal(readSignupMessage(JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: {} })), null);
  assert.equal(readSignupMessage(JSON.stringify({ type: 'OUTRA', event: 'FINISH' })), null);
  assert.equal(readSignupMessage('texto solto'), null);
  assert.equal(readSignupMessage(JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE' } }))?.event, 'CANCEL');
});
