import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { numStr, nuovaRevisione, ripristinaRevisione, calc } from '../js/calc.js';
import { buildDoc, fileName } from '../js/pdf.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
const base = () => ({ ...structuredClone(fx.acorpo), stato: 'inviato', dataInvio: '2026-11-01', richiamato: '2026-11-20', firma: { png: 'x', nome: 'Mario', data: '2026-11-02' } });

test('numStr: «rev. N» solo dalla seconda revisione', () => {
  assert.equal(numStr({ anno: 2026, numero: 14 }), '2026/014');
  assert.equal(numStr({ anno: 2026, numero: 14, rev: 1 }), '2026/014');
  assert.equal(numStr({ anno: 2026, numero: 14, rev: 2 }), '2026/014 rev. 2');
});

test('nuovaRevisione: salva la versione, rev+1, torna bozza, toglie firma e date di invio', () => {
  const p = base();
  const tot = calc(p).totale;
  const q = nuovaRevisione(p, '2026-11-26');
  assert.equal(q.rev, 2);
  assert.equal(q.stato, 'bozza');
  assert.equal(q.data, '2026-11-26');
  assert.equal(q.firma, undefined);
  assert.equal(q.dataInvio, undefined);
  assert.equal(q.richiamato, undefined);
  assert.equal(q.revisioni.length, 1);
  assert.equal(q.revisioni[0].n, 1);
  assert.equal(q.revisioni[0].totale, tot);
  assert.equal(q.revisioni[0].data, fx.acorpo.data);
  assert.deepEqual(q.revisioni[0].contenuto.sezioni, p.sezioni);
  assert.equal(q.revisioni[0].contenuto.revisioni, undefined, 'niente revisioni dentro le revisioni');
  assert.equal(q.id, p.id); assert.equal(q.numero, p.numero);
  // il preventivo di partenza non cambia
  assert.equal(p.rev, undefined); assert.ok(p.firma);
  // modificare la nuova non tocca la copia salvata
  q.sezioni[0].voci[0].prezzo = '1';
  assert.notEqual(q.revisioni[0].contenuto.sezioni[0].voci[0].prezzo, '1');
});

test('nuovaRevisione: al massimo 10 versioni, si toglie la più vecchia', () => {
  let p = base();
  for (let i = 0; i < 12; i++) p = nuovaRevisione(p, '2026-11-26');
  assert.equal(p.rev, 13);
  assert.equal(p.revisioni.length, 10);
  assert.deepEqual(p.revisioni.map(r => r.n), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('ripristinaRevisione: la versione scelta torna, quella attuale viene salvata', () => {
  let p = base();
  p = nuovaRevisione(p, '2026-11-20');
  p.sezioni[0].voci[0].prezzo = '999';
  p.oggetto = 'Oggetto cambiato';
  const r = ripristinaRevisione(p, 1, '2026-11-26');
  assert.equal(r.rev, 3);
  assert.equal(r.oggetto, fx.acorpo.oggetto);
  assert.equal(r.sezioni[0].voci[0].prezzo, fx.acorpo.sezioni[0].voci[0].prezzo);
  assert.deepEqual(r.revisioni.map(x => x.n), [1, 2]);
  assert.equal(r.revisioni[1].contenuto.oggetto, 'Oggetto cambiato');
  assert.equal(r.stato, 'bozza');
  assert.equal(r.data, '2026-11-26');
  assert.equal(ripristinaRevisione(p, 9, '2026-11-26'), null);
});

test('PDF: numero con «rev. 2» e nome file con rev', () => {
  const p = { ...base(), rev: 2 };
  assert.ok(JSON.stringify(buildDoc(p, { ragione: 'X' }, null)).includes('2026/007 rev. 2'));
  assert.match(fileName(p), /2026-007 rev2/);
  assert.doesNotMatch(fileName({ ...p, rev: 1 }), /rev\d/);
});

test('PDF: firma del cliente nello spazio «Per accettazione»', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const p = { ...base(), firma: { png, nome: 'Mario Rossi', data: '2026-11-26' } };
  const s = JSON.stringify(buildDoc(p, { ragione: 'X', firma: false }, null));
  assert.ok(s.includes('PER ACCETTAZIONE'), 'firme visibili anche se spente nelle impostazioni');
  assert.ok(s.includes('Firmato da Mario Rossi il 26/11/2026'));
  assert.ok(s.includes(png));
  const senza = JSON.stringify(buildDoc({ ...base(), firma: undefined }, { ragione: 'X', firma: false }, null));
  assert.ok(!senza.includes('PER ACCETTAZIONE') && !senza.includes('Firmato da'));
});

test('revisione di un preventivo firmato: la versione firmata conserva la firma, il ripristino no', () => {
  const p = base();
  const q = nuovaRevisione(p, '2026-11-26');
  assert.equal(q.firma, undefined);
  assert.deepEqual(q.revisioni[0].contenuto.firma, p.firma);
  const r = ripristinaRevisione(q, 1, '2026-11-27');
  assert.equal(r.firma, undefined, 'la firma non torna sulla versione attuale');
  assert.equal(r.stato, 'bozza');
});
