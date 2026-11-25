import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { righeDaPdf, leggiPreventivo } from '../js/pdfimport.js';
import { calc } from '../js/calc.js';

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const leggi = async nome => {
  const bytes = new Uint8Array(readFileSync(new URL(`./pdf-prova/${nome}.pdf`, import.meta.url)));
  return leggiPreventivo(await righeDaPdf(pdfjsLib, bytes));
};

test('a corpo: cliente, data, oggetto, una voce con la descrizione intera', async () => {
  const r = await leggi('bagno-a-corpo');
  assert.equal(r.errore, undefined);
  const p = r.preventivo;
  assert.equal(p.cliente.nome, 'Bar Esempio');
  assert.equal(p.data, '2026-02-12');
  assert.equal(p.oggetto, 'Lavori di ristrutturazione del bagno');
  const v = p.sezioni[0].voci;
  assert.equal(v.length, 1);
  assert.equal(v[0].um, 'a corpo');
  assert.equal(v[0].qta, '1');
  assert.ok(v[0].desc.startsWith('Ristrutturazione bagno comprensiva di demolizione'), v[0].desc);
  assert.ok(v[0].desc.includes('forniti dal Cliente.'), v[0].desc);
  assert.equal(p.iva, 10);
  assert.equal(r.totaleLetto, 4700.3);
  assert.equal(calc(p).totale, 4700.3);
  assert.deepEqual(r.avvisi, []);
});

test('più voci con descrizioni su più righe, quantità e unità', async () => {
  const r = await leggi('appartamento');
  const p = r.preventivo;
  assert.equal(p.cliente.nome, 'Mario Rossi');
  assert.equal(p.cliente.indirizzo, 'Via Roma 1, Rimini');
  assert.equal(p.data, '2025-09-03');
  assert.equal(p.oggetto, 'Lavori di ristrutturazione appartamento');
  const v = p.sezioni[0].voci.map(x => [x.desc, x.qta, x.um, Number(String(x.prezzo).replace(',', '.'))]);
  assert.deepEqual(v, [
    ['Demolizione pavimenti e rivestimenti esistenti', '45', 'mq', 18],
    ['Tinteggiatura pareti e soffitti con idropittura traspirante, due mani', '120', 'mq', 8],
    ['Posa pavimento in gres porcellanato 60x60, collante incluso', '45', 'mq', 32]
  ]);
  assert.equal(p.iva, 10);
  assert.equal(calc(p).totale, 3531);
  assert.deepEqual(r.avvisi, []);
});

test('IVA 22% ricavata da imponibile e IVA', async () => {
  const r = await leggi('facciata-iva22');
  const p = r.preventivo;
  assert.equal(p.cliente.nome, 'Condominio Le Vele');
  assert.equal(p.cliente.indirizzo, 'Viale Dante 10, Riccione');
  assert.equal(p.oggetto, 'Rifacimento facciata');
  assert.equal(p.iva, 22);
  assert.equal(calc(p).totale, 12200);
  assert.deepEqual(r.avvisi, []);
});

test('conti che non tornano: avviso', async () => {
  const r = await leggi('conti-sbagliati');
  assert.equal(r.preventivo.cliente.nome, 'Anna Bianchi');
  assert.ok(r.avvisi.some(a => /totale/i.test(a)), JSON.stringify(r.avvisi));
});

test('PDF senza testo (scansione): errore chiaro', async () => {
  const r = await leggi('scansione');
  assert.equal(r.errore, 'senza-testo');
});
