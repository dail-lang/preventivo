import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateDaTesto, ricalcolaRate, statoPagamenti, round2 } from '../js/calc.js';

const somma = r => round2(r.reduce((t, x) => t + x.importo, 0));

test('rateDaTesto: 30/40/30 con descrizioni, la somma torna al centesimo', () => {
  const r = rateDaTesto("30% all'accettazione, 40% a metà lavori, 30% a fine lavori", 1000.01);
  assert.equal(r.length, 3);
  assert.deepEqual(r.map(x => x.perc), [30, 40, 30]);
  assert.deepEqual(r.map(x => x.desc), ["All'accettazione", 'A metà lavori', 'A fine lavori']);
  assert.equal(somma(r), 1000.01);
  assert.equal(r[0].importo, 300);
  assert.ok(r.every(x => x.id && x.scadenza === '' && x.pagata === ''));
  assert.equal(new Set(r.map(x => x.id)).size, 3);
  assert.deepEqual(rateDaTesto('saldo a fine lavori', 100), []);
  assert.equal(rateDaTesto('50% acconto; 50% saldo', 4700.3).length, 2);
});

test('ricalcolaRate: cambia solo le rate non pagate in %, la somma torna', () => {
  const r = rateDaTesto('30% acconto, 40% metà, 30% saldo', 1000);
  r[0].pagata = '2026-11-01';
  r.push({ id: 'x', desc: 'Extra', perc: '', importo: 50, scadenza: '', pagata: '' });
  const n = ricalcolaRate(r, 2000.01);
  assert.equal(n[0].importo, 300, 'la rata pagata non cambia');
  assert.equal(n[1].importo, 800);
  assert.equal(n[3].importo, 50, 'la rata a importo fisso non cambia');
  assert.equal(n[2].importo, 600);
  assert.equal(r[1].importo, 400, 'non modifica l\'originale');
  // tutte in %, nessuna pagata: l'ultima assorbe l'arrotondamento
  assert.equal(somma(ricalcolaRate(rateDaTesto('30% a, 40% b, 30% c', 10), 1000.01)), 1000.01);
});

test('statoPagamenti: incassato, da incassare, scadute, prossima', () => {
  const p = { iva: 0, sezioni: [{ voci: [{ um: 'a corpo', qta: '1', prezzo: '1000' }] }] };
  p.rate = rateDaTesto('30% a, 40% b, 30% c', 1000);
  p.rate[0].pagata = '2026-11-01';
  p.rate[1].scadenza = '2026-11-20';
  p.rate[2].scadenza = '2026-12-20';
  const s = statoPagamenti(p, '2026-11-26');
  assert.equal(s.incassato, 300);
  assert.equal(s.daIncassare, 700);
  assert.equal(s.scadute, 1);
  assert.equal(s.prossima.desc, 'B');
  p.rate[1].pagata = '2026-11-25';
  const t = statoPagamenti(p, '2026-11-26');
  assert.equal(t.scadute, 0); assert.equal(t.prossima.desc, 'C');
  assert.equal(statoPagamenti({ ...p, rate: [] }, '2026-11-26').daIncassare, 1000);
  assert.equal(statoPagamenti({ ...p, rate: undefined }, '2026-11-26').prossima, null);
});

test('ricalcolaRate: una rata pagata col vecchio totale non gonfia l\'ultima', () => {
  const r = rateDaTesto('30% acconto, 40% metà, 30% saldo', 1000);
  r[0].pagata = '2026-11-01';
  const n = ricalcolaRate(r, 2000);
  assert.equal(n[0].importo, 300);
  assert.equal(n[1].importo, 800);
  assert.equal(n[2].importo, 600, 'il 30% di 2000, non 900');
});
