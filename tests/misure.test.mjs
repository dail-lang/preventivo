import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areeStanza, espressione } from '../js/misure.js';
import { num } from '../js/calc.js';

const st = { l: 4, p: 3.5, h: 2.7, aperture: [{ l: 0.8, h: 2.1, n: 2 }] };

test('areeStanza: pavimento, soffitto e pareti meno le aperture', () => {
  assert.deepEqual(areeStanza(st), { pavimento: 14, soffitto: 14, pareti: 37.14 });
});

test('areeStanza: misure mancanti o non valide valgono zero', () => {
  assert.deepEqual(areeStanza({ l: 4, p: '', h: 2.7, aperture: [] }), { pavimento: 0, soffitto: 0, pareti: 0 });
  assert.deepEqual(areeStanza({ l: 4, p: 3, h: '', aperture: [] }), { pavimento: 12, soffitto: 12, pareti: 0 });
  assert.equal(areeStanza({ l: 2, p: 2, h: 2, aperture: [{ l: 10, h: 10, n: 1 }] }).pareti, 0);
});

test('espressione: con la virgola, ricalcolabile e sommabile su più stanze', () => {
  const e = espressione([st], 'pavimento');
  assert.equal(e, '4*3,5');
  assert.equal(num(espressione([st], 'pareti')), 37.14);
  assert.equal(num(espressione([st], 'pareti+soffitto')), 51.14);
  const due = [st, { l: 3, p: 3, h: 2.7, aperture: [] }];
  assert.equal(num(espressione(due, 'pavimento')), 23);
  assert.equal(espressione([{ l: '', p: '', h: '' }], 'pavimento'), '');
});

import { perimetro, totaliStanze } from '../js/misure.js';
test('perimetro (battiscopa) e totali di tutte le stanze', () => {
  assert.equal(perimetro(st), 15);
  assert.equal(perimetro({ l: 4, p: '' }), 0);
  assert.deepEqual(totaliStanze([st, { l: 3, p: 3, h: 2.7, aperture: [] }, { l: '', p: '' }]), { pavimento: 23, soffitto: 23, pareti: 69.54, perimetro: 27 });
  assert.deepEqual(totaliStanze([]), { pavimento: 0, soffitto: 0, pareti: 0, perimetro: 0 });
});

import { sezioniDaRilievo } from '../js/misure.js';
test('espressione del perimetro (battiscopa)', () => {
  assert.equal(espressione([st], 'perimetro'), '2*(4+3,5)');
  assert.equal(num(espressione([st, { l: 3, p: 3 }], 'perimetro')), 27);
});
test('sezioniDaRilievo: una sezione per stanza, quantità calcolate, prezzi scelti', () => {
  const ril = { nome: 'Appartamento Rossi', stanze: [{ nome: 'Bagno', ...st }, { nome: '', l: 3, p: 3, h: 2.7, aperture: [] }, { nome: 'Vuota', l: '', p: '' }] };
  const scelte = [
    { desc: 'Posa pavimento in gres', um: 'mq', tipo: 'pavimento', prezzo: '35' },
    { desc: 'Battiscopa', um: 'ml', tipo: 'perimetro', prezzo: '' }
  ];
  let n = 0;
  const sez = sezioniDaRilievo(ril, scelte, () => 'id' + (++n));
  assert.deepEqual(sez.map(s => s.titolo), ['Bagno', 'Stanza 2'], 'le stanze senza misure non entrano');
  assert.deepEqual(sez[0].voci.map(v => [v.desc, v.um, v.qta, v.prezzo]), [['Posa pavimento in gres', 'mq', '4*3,5', '35'], ['Battiscopa', 'ml', '2*(4+3,5)', '']]);
  assert.equal(sez[0].voci[0].misure[0].l, 4, 'la voce ricorda le misure della stanza');
  assert.ok(sez[0].id && sez[0].voci[0].id && sez[0].voci[0].id !== sez[0].voci[1].id);
  assert.deepEqual(sezioniDaRilievo({ stanze: [] }, scelte, () => 'x'), []);
});
