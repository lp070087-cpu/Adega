import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappDigits, whatsappHref } from '../src/lib/whatsapp';

test('wa.me numbers: store number with DDI, customer phone without DDI and DDD 55 are all correct', () => {
  assert.equal(whatsappDigits('+55 (81) 98888-7777'), '5581988887777');
  assert.equal(whatsappDigits('81988887777'), '5581988887777');
  assert.equal(whatsappDigits('(55) 99999-8888'), '5555999998888'); // DDD 55 (RS) without DDI
  assert.equal(whatsappDigits('5555999998888'), '5555999998888');
  assert.equal(whatsappDigits('8133334444'), '558133334444');
  assert.equal(whatsappDigits('123'), null);
  assert.equal(whatsappDigits(null), null);
});

test('prefilled message is encoded and invalid numbers produce no link', () => {
  assert.equal(whatsappHref('81988887777', 'Pedido #12 & entrega'), 'https://wa.me/5581988887777?text=Pedido%20%2312%20%26%20entrega');
  assert.equal(whatsappHref('', 'x'), null);
});
