import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { num, calc, fmtEur, fmtNum, numStr, nextNumero, duplicati, qtaOf } from '../js/calc.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));

test('num: espressioni con virgola e operatori', () => {
  assert.equal(num('3,5*4 + 2x1,2'), 16.4);
  assert.equal(num('(2,10+2,40)*2'), 9);
  assert.equal(num('1.250,50'), 1250.5);
  assert.equal(num('12.5'), 12.5);
  assert.ok(Number.isNaN(num('abc')));
  assert.ok(Number.isNaN(num('')));
});

test('qtaOf: a corpo vuoto vale 1', () => {
  assert.equal(qtaOf({ um: 'a corpo', qta: '' }), 1);
  assert.ok(Number.isNaN(qtaOf({ um: 'mq', qta: '' })));
});

test('calc: preventivo a corpo', () => {
  const c = calc(fx.acorpo);
  assert.equal(c.imponibile, 4273);
  assert.equal(c.iva, 427.3);
  assert.equal(c.totale, 4700.3);
});

test('calc: appartamento con sconto 5%', () => {
  const c = calc(fx.appartamento);
  assert.equal(c.lordo, 26568.6);
  assert.equal(c.sconto, 1328.43);
  assert.equal(c.totale, 27764.19);
});

test('fmtEur e fmtNum con separatore delle migliaia', () => {
  assert.equal(fmtEur(6050.4), '€ 6.050,40');
  assert.equal(fmtEur(72), '€ 72,00');
  assert.equal(fmtNum(1234.5), '1.234,5');
});

test('numStr e nextNumero', () => {
  assert.equal(numStr({ anno: 2026, numero: 7 }), '2026/007');
  assert.equal(numStr({ esempio: true }), 'Esempio');
  const list = [{ anno: 2026, numero: 3 }, { anno: 2026, numero: 9 }, { anno: 2025, numero: 40 }, { anno: 2026, numero: 50, esempio: true }];
  assert.equal(nextNumero(list, 2026), 10);
  assert.equal(nextNumero(list, 2027), 1);
});

test('duplicati: stesso anno e numero, esclusi esempi e altri anni', () => {
  const list = [
    { id: 'a', anno: 2026, numero: 15 }, { id: 'b', anno: 2026, numero: 15 },
    { id: 'c', anno: 2025, numero: 15 }, { id: 'd', anno: 2026, numero: 15, esempio: true },
    { id: 'e', anno: 2026, numero: 16 }
  ];
  assert.deepEqual([...duplicati(list)].sort(), ['a', 'b']);
});
