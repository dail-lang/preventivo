import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, importa } from '../js/store.js';

test('memory store: subscribe riceve salvataggi e cancellazioni', async () => {
  const st = await createStore('memory');
  const seen = [];
  const unsub = st.subscribe('clienti', list => seen.push(list.map(x => x.id).join(',')));
  await st.save('clienti', 'c1', { nome: 'Rossi' });
  await st.save('clienti', 'c2', { nome: 'Bianchi' });
  await st.remove('clienti', 'c1');
  unsub();
  await st.save('clienti', 'c3', { nome: 'Verdi' });
  assert.deepEqual(seen, ['', 'c1', 'c1,c2', 'c2']);
});

test('memory store: subscribeDoc', async () => {
  const st = await createStore('memory', { seed: { impostazioni: [{ id: 'azienda', ragione: 'X' }] } });
  const got = [];
  st.subscribeDoc('impostazioni/azienda', d => got.push(d && d.ragione));
  await st.save('impostazioni', 'azienda', { ragione: 'Y' });
  assert.deepEqual(got, ['X', 'Y']);
});

test('importa: crea solo ciò che manca e non sovrascrive', async () => {
  const st = await createStore('memory', { seed: { listino: [{ id: 'l1', desc: 'mia modifica' }] } });
  const dati = {
    preventivi: [{ id: 'p1', numero: 1 }],
    listino: [{ id: 'l1', desc: 'vecchia' }, { id: 'l2', desc: 'nuova' }],
    clienti: [],
    azienda: { ragione: 'Impresa' }
  };
  const r1 = await importa(st, dati);
  assert.deepEqual(r1, { creati: 3, saltati: 1 });
  assert.equal(st.peek('listino', 'l1').desc, 'mia modifica');
  const r2 = await importa(st, dati);
  assert.deepEqual(r2, { creati: 0, saltati: 4 });
});

test('importa: rifiuta un file non valido', async () => {
  const st = await createStore('memory');
  await assert.rejects(() => importa(st, { qualcosa: 1 }), /non è un file di dati/);
});

test('memory store con deny: le letture danno permission-denied', async () => {
  const st = await createStore('memory', { deny: true });
  let err = null, got = 'none';
  st.subscribeDoc('accesso/persone', d => { got = d; }, e => { err = e; });
  assert.equal(err && err.code, 'permission-denied');
  assert.equal(got, 'none');
});
