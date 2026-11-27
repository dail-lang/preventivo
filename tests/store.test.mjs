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

test('memory store: subscribeWhere riceve solo le foto di quel preventivo', async () => {
  const st = await createStore('memory', { seed: { foto: [{ id: 'f1', preventivoId: 'p1', dataURL: 'a' }, { id: 'f2', preventivoId: 'p2', dataURL: 'b' }] } });
  const seen = [];
  const unsub = st.subscribeWhere('foto', 'preventivoId', 'p1', list => seen.push(list.map(x => x.id).sort().join(',')));
  await st.save('foto', 'f3', { preventivoId: 'p1', dataURL: 'c' });
  await st.save('foto', 'f4', { preventivoId: 'p2', dataURL: 'd' });
  await st.remove('foto', 'f1');
  unsub();
  await st.save('foto', 'f5', { preventivoId: 'p1', dataURL: 'e' });
  assert.deepEqual(seen, ['f1', 'f1,f3', 'f1,f3', 'f3']);
});

test('foto: nel backup, in all() e nel trasferimento online', async () => {
  const src = await createStore('memory', { seed: { preventivi: [{ id: 'p1', numero: 1 }], foto: [{ id: 'f1', preventivoId: 'p1', creata: '2026-11-27', dataURL: 'data:image/jpeg;base64,AAAA' }] } });
  const dati = src.exportAll();
  assert.equal(dati.foto.length, 1);
  assert.equal((await src.all('foto')).length, 1);
  const dst = await createStore('memory');
  const r = await importa(dst, dati);
  assert.equal(r.creati, 2);
  assert.deepEqual(await dst.ids('foto'), ['f1']);
});

test('subscribeWhere non copia le foto degli altri preventivi', async () => {
  // un documento non copiabile in un altro preventivo: se venisse copiato, structuredClone fallirebbe
  const st = await createStore('memory', { seed: { foto: [{ id: 'f1', preventivoId: 'p1', dataURL: 'a' }, { id: 'f2', preventivoId: 'p2', dataURL: () => 0 }] } });
  const seen = [];
  st.subscribeWhere('foto', 'preventivoId', 'p1', l => seen.push(l.map(x => x.id).join()));
  await st.save('foto', 'f3', { preventivoId: 'p1', dataURL: 'c' });
  assert.deepEqual(seen, ['f1', 'f1,f3']);
});

test('idsWhere: id delle foto di un preventivo, anche senza averle aperte', async () => {
  const st = await createStore('memory', { seed: { foto: [{ id: 'f1', preventivoId: 'p1' }, { id: 'f2', preventivoId: 'p2' }, { id: 'f3', preventivoId: 'p1' }] } });
  assert.deepEqual((await st.idsWhere('foto', 'preventivoId', 'p1')).sort(), ['f1', 'f3']);
});

test('modelli: nella copia di sicurezza', async () => {
  const st = await createStore('memory', { seed: { modelli: [{ id: 'md1', nome: 'Bagno' }] } });
  assert.equal(st.exportAll().modelli.length, 1);
  const dst = await createStore('memory'); await importa(dst, st.exportAll());
  assert.deepEqual(await dst.ids('modelli'), ['md1']);
});

test('rilievi delle misure: nella copia di sicurezza e nel trasferimento', async () => {
  const src = await createStore('memory', { seed: { misure: [{ id: 'm1', nome: 'Appartamento Rossi', stanze: [{ nome: 'Bagno', l: '2', p: '3', h: '2,7', aperture: [] }] }] } });
  const dati = src.exportAll();
  assert.equal(dati.misure.length, 1);
  const dst = await createStore('memory');
  await importa(dst, dati);
  assert.deepEqual(await dst.ids('misure'), ['m1']);
});

test('importa: le foto non scaricano tutto per controllare gli id e vanno a gruppi', async () => {
  const dst = await createStore('memory');
  const chiesti = []; const ids = dst.ids.bind(dst); dst.ids = c => { chiesti.push(c); return ids(c); };
  let inVolo = 0, max = 0; const save = dst.save.bind(dst);
  dst.save = async (c, id, d) => { if (c !== 'foto') return save(c, id, d); inVolo++; max = Math.max(max, inVolo); await new Promise(r => setTimeout(r, 2)); await save(c, id, d); inVolo--; };
  const foto = Array.from({ length: 25 }, (_, i) => ({ id: 'f' + i, preventivoId: 'p1', dataURL: 'x' }));
  const r = await importa(dst, { preventivi: [{ id: 'p1', numero: 1 }], foto });
  assert.ok(!chiesti.includes('foto'), 'niente ids(foto)');
  assert.equal((await dst.ids('foto')).length, 25);
  assert.ok(max <= 10, 'al massimo 10 foto alla volta, erano ' + max);
  assert.equal(r.creati, 26);
});
