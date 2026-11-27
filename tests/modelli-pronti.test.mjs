import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelliPronti } from '../js/modelli-pronti.js';
import { LISTINO_RIMINI } from '../js/listino-rimini.js';
import { calc } from '../js/calc.js';

test('modelli pronti: i lavori tipo, con nomi diversi', () => {
  const m = modelliPronti([]);
  assert.ok(m.length >= 6, 'almeno 6 modelli');
  const nomi = m.map(x => x.nome);
  assert.equal(new Set(nomi).size, nomi.length, 'nomi tutti diversi');
  for (const cerca of [/tinteggiatura.*appartamento/i, /bagno/i, /pavimenti/i, /cucina/i, /impianto elettrico/i, /facciata/i]) assert.ok(nomi.some(n => cerca.test(n)), 'manca ' + cerca);
});

test('modelli pronti: ogni voce viene dal listino di Rimini, con il suo prezzo e una quantità', () => {
  const per = new Map(LISTINO_RIMINI.map(v => [v.desc, v]));
  for (const m of modelliPronti([])) {
    assert.ok(m.sezioni.length >= 1 && m.oggetto && m.iva === 10, m.nome);
    for (const s of m.sezioni) for (const v of s.voci) {
      const l = per.get(v.desc);
      assert.ok(l, `«${v.desc}» (${m.nome}) non è nel listino`);
      assert.equal(v.um, l.um, v.desc);
      assert.equal(v.prezzo, String(l.prezzo).replace('.', ','), v.desc);
      assert.ok(String(v.qta).trim(), 'quantità mancante: ' + v.desc);
    }
    assert.ok(calc(m).totale > 0, m.nome);
  }
});

test('modelli pronti: se nel tuo listino hai cambiato un prezzo, usa il tuo', () => {
  const mio = [{ desc: 'Tinteggiatura pareti e soffitti con idropittura traspirante, due mani', um: 'mq', prezzo: 10.5 }];
  const t = modelliPronti(mio).find(m => /tinteggiatura.*appartamento/i.test(m.nome));
  const v = t.sezioni.flatMap(s => s.voci).find(x => x.desc === mio[0].desc);
  assert.equal(v.prezzo, '10,5');
});
