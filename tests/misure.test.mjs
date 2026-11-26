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
