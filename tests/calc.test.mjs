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

import { suggerisci } from '../js/calc.js';
const L = [
  { id: 'a', desc: 'Fornitura di gres porcellanato di fascia media', um: 'mq', prezzo: 32 },
  { id: 'b', desc: 'Posa di pavimento in gres porcellanato fino a 60×60, collante compreso', um: 'mq', prezzo: 35 },
  { id: 'c', desc: 'Tinteggiatura pareti e soffitti con idropittura traspirante, due mani', um: 'mq', prezzo: 9 },
  { id: 'd', desc: 'Pavimentazione esterna in autobloccanti', um: 'mq', prezzo: 40 },
  { id: 'e', desc: '', um: 'mq', prezzo: 1 },
  { id: 'f', desc: 'Città: rifacimento facciata', um: 'mq', prezzo: 22 }
];

test('suggerisci: parole parziali in qualsiasi ordine, la migliore per prima', () => {
  const r = suggerisci('pav gres', L).map(x => x.id);
  assert.equal(r[0], 'b');
  assert.ok(!r.includes('c'));
  assert.deepEqual(suggerisci('gres pav', L).map(x => x.id)[0], 'b');
});

test('suggerisci: maiuscole e accenti non contano', () => {
  assert.equal(suggerisci('TINTEGGIATURA', L)[0].id, 'c');
  assert.equal(suggerisci('citta facc', L)[0].id, 'f');
});

test('suggerisci: almeno 3 lettere, al massimo n risultati, niente voci vuote', () => {
  assert.deepEqual(suggerisci('pa', L), []);
  assert.ok(suggerisci('mq', L).length === 0 || suggerisci('mq', L).every(x => x.desc));
  assert.equal(suggerisci('gres', L, 1).length, 1);
  assert.ok(suggerisci('gres', L).every(x => x.desc));
});

test('suggerisci: inizio di parola vale più di metà parola', () => {
  const r = suggerisci('pav', L).map(x => x.id);
  assert.deepEqual(r.slice(0, 2).sort(), ['b', 'd']);
});

test('suggerisci: se la descrizione è già identica a una voce, niente suggerimenti', () => {
  assert.deepEqual(suggerisci(L[2].desc, L), []);
});

import { messaggioInvio, telefonoWa, MESSAGGIO_BASE } from '../js/calc.js';
test('messaggioInvio: segnaposto compilati', () => {
  const p = { anno: 2026, numero: 7, oggetto: 'Rifacimento bagno', cliente: { nome: 'Mario Rossi' }, sezioni: [{ voci: [{ um: 'a corpo', qta: '', prezzo: '1000' }] }], iva: 10, sconto: {} };
  const a = { ragione: 'Impresa Edile Nazifoski', telefono: '+39 352 203 7037' };
  assert.equal(messaggioInvio(MESSAGGIO_BASE, p, a), 'Buongiorno Mario Rossi, le invio il preventivo n. 2026/007 per Rifacimento bagno. Resto a disposizione. Impresa Edile Nazifoski – +39 352 203 7037');
  assert.equal(messaggioInvio('Totale {totale}', p, a), 'Totale € 1.100,00');
  assert.ok(messaggioInvio(MESSAGGIO_BASE, { ...p, cliente: {} }, a).startsWith('Buongiorno, le invio'));
  assert.ok(!messaggioInvio(MESSAGGIO_BASE, { ...p, oggetto: '' }, a).includes(' per .'));
});
test('telefonoWa: numero per WhatsApp', () => {
  assert.equal(telefonoWa('333 123 4567'), '393331234567');
  assert.equal(telefonoWa('+39 333 123 4567'), '393331234567');
  assert.equal(telefonoWa('0541 123456'), '390541123456');
  assert.equal(telefonoWa(''), '');
});

import { daRichiamare, giorniDa } from '../js/calc.js';
test('giorniDa: giorni trascorsi tra due date', () => {
  assert.equal(giorniDa('2026-11-06', '2026-11-26'), 20);
  assert.equal(giorniDa('2026-11-26', '2026-11-26'), 0);
  assert.equal(giorniDa('', '2026-11-26'), 0);
});
test('daRichiamare: inviati da troppi giorni, non richiamati da poco', () => {
  const l = [
    { id: 'vecchio', stato: 'inviato', dataInvio: '2026-11-06' },
    { id: 'recente', stato: 'inviato', dataInvio: '2026-11-21' },
    { id: 'richiamato', stato: 'inviato', dataInvio: '2026-11-01', richiamato: '2026-11-24' },
    { id: 'accettato', stato: 'accettato', dataInvio: '2026-10-01' },
    { id: 'esempio', stato: 'inviato', dataInvio: '2026-10-01', esempio: true },
    { id: 'senzaInvio', stato: 'inviato', data: '2026-11-10' }
  ];
  const r = daRichiamare(l, '2026-11-26', 10);
  assert.deepEqual([...r].sort(), ['senzaInvio', 'vecchio']);
  assert.equal(daRichiamare(l, '2026-11-26', 30).size, 0);
});
