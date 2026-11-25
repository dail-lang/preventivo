import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LISTINO_RIMINI, pianoListino } from '../js/listino-rimini.js';

test('listino di Rimini: tante voci, tutte complete e con id unici', () => {
  assert.ok(LISTINO_RIMINI.length >= 60, String(LISTINO_RIMINI.length));
  assert.equal(new Set(LISTINO_RIMINI.map(v => v.id)).size, LISTINO_RIMINI.length);
  for (const v of LISTINO_RIMINI) assert.ok(v.desc && v.um && v.categoria && v.prezzo > 0, JSON.stringify(v));
});

test('caricamento: sostituisce le vecchie voci indicative, non tocca quelle del titolare', () => {
  const r010 = LISTINO_RIMINI.find(v => v.id === 'r010');
  const esistenti = [
    { id: 'l01', desc: 'Vecchia voce indicativa', um: 'mq', prezzo: 18, indicativo: true },
    { id: 'l02', desc: 'Voce corretta dal titolare', um: 'mq', prezzo: 20 },
    { id: 'r010', desc: r010.desc, um: 'mq', prezzo: 99, indicativo: true, categoria: r010.categoria },
    { id: 'r011', desc: 'Rimozione rivestimento (prezzo mio)', um: 'mq', prezzo: 11, indicativo: false },
    { id: 'p1', desc: 'Voce da un PDF', um: 'mq', prezzo: 30, dataPrezzo: '2025-01-01' }
  ];
  const piano = pianoListino(esistenti);
  assert.deepEqual(piano.elimina, ['l01']);
  const scritti = Object.fromEntries(piano.scrivi.map(v => [v.id, v]));
  assert.equal(scritti.r010.prezzo, r010.prezzo, 'la voce indicativa si aggiorna');
  assert.equal(scritti.r011, undefined, 'la voce modificata dal titolare resta com\'è');
  assert.equal(scritti.l02, undefined);
  assert.equal(scritti.p1, undefined);
  assert.equal(piano.tenute, 3);
  assert.equal(piano.scrivi.length, LISTINO_RIMINI.length - 1);
});

test('caricamento ripetuto: nessun doppione e niente da scrivere', () => {
  const dopo = LISTINO_RIMINI.map(v => ({ ...v }));
  const piano = pianoListino(dopo);
  assert.equal(piano.scrivi.length, 0);
  assert.equal(piano.elimina.length, 0);
});

test('stessa descrizione già presente con un altro id: non la duplica', () => {
  const v = LISTINO_RIMINI[5];
  const piano = pianoListino([{ id: 'mio', desc: v.desc.toUpperCase(), um: v.um, prezzo: 1 }]);
  assert.ok(!piano.scrivi.some(x => x.id === v.id));
});
