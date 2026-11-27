import { test } from 'node:test';
import assert from 'node:assert/strict';
import { festivo, lavorativo, fineLavori, spostaLavorativi, giornoLavoro, durataDaTesto, lunediDi, agendaSettimana, daProgrammare, scadenzeDaCantiere, icsCantiere } from '../js/agenda.js';

test('festivi: nazionali, Pasquetta e San Gaudenzo', () => {
  for (const d of ['2026-01-01', '2026-01-06', '2026-04-06', '2027-03-29', '2026-04-25', '2026-05-01', '2026-06-02', '2026-08-15', '2026-10-14', '2026-11-01', '2026-12-08', '2026-12-25', '2026-12-26']) assert.ok(festivo(d), d);
  assert.ok(!festivo('2026-11-27'));
  assert.ok(lavorativo('2026-11-27'), 'venerdì');
  assert.ok(!lavorativo('2026-11-28'), 'sabato');
  assert.ok(!lavorativo('2026-12-08'), 'Immacolata');
});

test('fineLavori: il giorno di inizio è il primo, saltando weekend e festivi', () => {
  assert.equal(fineLavori('2026-11-27', 6), '2026-12-04');
  assert.equal(fineLavori('2026-12-04', 3), '2026-12-09');
  assert.equal(fineLavori('2026-12-23', 4), '2026-12-29');
  assert.equal(fineLavori('2026-12-30', 3), '2027-01-04');
  assert.equal(fineLavori('2026-11-28', 1), '2026-11-30', 'inizio di sabato: si parte lunedì');
  assert.equal(fineLavori('2026-11-27', ''), '');
  assert.equal(fineLavori('', 5), '');
});

test('spostaLavorativi: avanti e indietro, sempre su un giorno lavorativo', () => {
  assert.equal(spostaLavorativi('2026-12-24', 1), '2026-12-28');
  assert.equal(spostaLavorativi('2026-11-27', 2), '2026-12-01');
  assert.equal(spostaLavorativi('2026-11-30', -1), '2026-11-27');
});

test('giornoLavoro: «giorno 2 di 6», 0 fuori dal cantiere', () => {
  assert.equal(giornoLavoro('2026-11-27', '2026-11-27', 6), 1);
  assert.equal(giornoLavoro('2026-11-30', '2026-11-27', 6), 2);
  assert.equal(giornoLavoro('2026-11-29', '2026-11-27', 6), 1, 'domenica: resta al giorno fatto');
  assert.equal(giornoLavoro('2026-11-26', '2026-11-27', 6), 0);
  assert.equal(giornoLavoro('2026-12-07', '2026-11-27', 6), 0);
});

test('durataDaTesto: dai «Tempi di esecuzione»', () => {
  assert.equal(durataDaTesto('Circa 15 giorni lavorativi dall\'inizio lavori.'), 15);
  assert.equal(durataDaTesto('Circa 4 settimane, tempo permettendo.'), 20);
  assert.equal(durataDaTesto('due settimane'), 10);
  assert.equal(durataDaTesto('Da concordare'), '');
  assert.equal(durataDaTesto(''), '');
  assert.equal(durataDaTesto(undefined), '');
});

test('lunediDi', () => {
  assert.equal(lunediDi('2026-11-27'), '2026-11-23');
  assert.equal(lunediDi('2026-11-29'), '2026-11-23');
  assert.equal(lunediDi('2026-11-30'), '2026-11-30');
});

const acc = (id, inizio, giorni, extra = {}) => ({ id, stato: 'accettato', iva: 0, sezioni: [], agenda: inizio ? { inizio, giorni } : undefined, ...extra });

test('agendaSettimana: in corso, iniziano, finiscono (con la rata), note', () => {
  const lista = [
    acc('corso', '2026-11-19', 10),
    acc('inizia', '2026-11-26', 2),
    acc('finisce', '2026-11-17', 9, { rate: [{ desc: 'Saldo', importo: 4200, scadenza: '2026-11-27', pagata: '' }] }),
    acc('futuro', '2026-12-10', 5),
    acc('senza', '', ''),
    { ...acc('bozza', '2026-11-24', 3), stato: 'bozza' }
  ];
  const note = [{ id: 'n1', data: '2026-11-25', testo: 'Consegna piastrelle' }, { id: 'n2', data: '2026-12-02', testo: 'Altra settimana' }];
  const s = agendaSettimana(lista, note, '2026-11-23', '2026-11-27');
  assert.deepEqual(s.corso.map(x => x.p.id).sort(), ['corso', 'finisce', 'inizia']);
  assert.equal(s.corso.find(x => x.p.id === 'corso').giorno, 7);
  assert.deepEqual(s.inizi.map(x => x.p.id), ['inizia']);
  assert.deepEqual(s.fini.map(x => x.p.id), ['finisce', 'inizia']);
  assert.equal(s.fini[0].rata.importo, 4200);
  assert.deepEqual(s.note.map(n => n.id), ['n1']);
  assert.deepEqual(daProgrammare(lista).map(p => p.id), ['senza']);
});

test('scadenzeDaCantiere: solo le rate senza scadenza', () => {
  const rate = [
    { desc: "All'accettazione", scadenza: '2026-11-20' },
    { desc: 'A metà lavori', scadenza: '' },
    { desc: 'A fine lavori', scadenza: '' },
    { desc: 'Acconto materiali', scadenza: '' }
  ];
  const r = scadenzeDaCantiere(rate, '2026-11-27', '2026-12-04');
  assert.equal(r[0].scadenza, '2026-11-20', 'già scritta: non si tocca');
  assert.equal(r[1].scadenza, '2026-12-01', 'metà lavori');
  assert.equal(r[2].scadenza, '2026-12-04');
  assert.equal(r[3].scadenza, '2026-11-27', 'acconto → inizio');
  assert.equal(rate[1].scadenza, '', 'non modifica l\'originale');
});

test('icsCantiere: evento di tutto il giorno per il calendario del telefono', () => {
  const p = { id: 'x', oggetto: 'Bagno', cantiere: 'Via Roma 3, Rimini', cliente: { nome: 'Rossi' }, agenda: { inizio: '2026-12-01', giorni: 6, chi: 'Ardit e Luca', note: 'Chiavi dalla vicina' } };
  const s = icsCantiere(p, { ragione: 'Impresa Edile Nazifoski' });
  assert.match(s, /BEGIN:VCALENDAR/);
  assert.match(s, /DTSTART;VALUE=DATE:20261201/);
  assert.match(s, /DTEND;VALUE=DATE:20261210/, 'fine 09/12 (8/12 festivo) + 1');
  assert.match(s, /SUMMARY:Cantiere: Bagno – Rossi/);
  assert.match(s, /LOCATION:Via Roma 3\\, Rimini/);
  assert.match(s, /Ardit e Luca/);
  assert.match(s, /\r\n/);
});

test('scadenzeDaCantiere: se il cantiere si sposta, si spostano le scadenze messe dall\'app, non quelle scritte a mano', () => {
  const r1 = scadenzeDaCantiere([{ desc: 'A fine lavori', scadenza: '' }, { desc: 'Saldo', scadenza: '2026-12-20' }], '2026-11-27', '2026-12-04');
  assert.equal(r1[0].scadenza, '2026-12-04'); assert.equal(r1[0].scadenzaAuto, true);
  const r2 = scadenzeDaCantiere(r1, '2026-12-01', '2026-12-09');
  assert.equal(r2[0].scadenza, '2026-12-09', 'messa dall\'app: segue il cantiere');
  assert.equal(r2[1].scadenza, '2026-12-20', 'scritta a mano: resta');
});

test('San Francesco (4 ottobre) festa nazionale dal 2026', () => {
  assert.ok(festivo('2027-10-04'));
  assert.ok(!lavorativo('2027-10-04'), 'lunedì 4/10/2027');
  assert.ok(!festivo('2025-10-04'), 'prima del 2026 no');
});
test('spostaLavorativi: con inizio di sabato «+1» sposta davvero di un giorno', () => {
  assert.equal(spostaLavorativi('2026-11-28', 1), '2026-12-01');
  assert.equal(spostaLavorativi('2026-11-28', 2), '2026-12-02');
});
test('scadenzeDaCantiere: le rate pagate non cambiano; senza date le scadenze automatiche si tolgono', () => {
  const r = [{ desc: 'A fine lavori', scadenza: '2026-12-04', scadenzaAuto: true, pagata: '2026-12-04' }, { desc: 'Saldo', scadenza: '2026-12-04', scadenzaAuto: true, pagata: '' }];
  const spostate = scadenzeDaCantiere(r, '2026-12-10', '2026-12-18');
  assert.equal(spostate[0].scadenza, '2026-12-04', 'pagata: resta');
  assert.equal(spostate[1].scadenza, '2026-12-18');
  const senza = scadenzeDaCantiere(r, '', '');
  assert.equal(senza[1].scadenza, '', 'tolte le date messe dall\'app');
  assert.equal(senza[0].scadenza, '2026-12-04', 'la pagata resta');
});
test('durataDaTesto: parole intere e prima i giorni lavorativi', () => {
  assert.equal(durataDaTesto('trentasei giorni'), '');
  assert.equal(durataDaTesto('Inizio entro 2 settimane, durata 10 giorni lavorativi'), 10);
  assert.equal(durataDaTesto('Circa 12 giorni'), 12);
});
test('daProgrammare: i lavori segnati «già fatto» non ci sono', () => {
  const l = [{ id: 'a', stato: 'accettato' }, { id: 'b', stato: 'accettato', agenda: { nessuna: true } }];
  assert.deepEqual(daProgrammare(l).map(p => p.id), ['a']);
});
test('icsCantiere: SEQUENCE, così il calendario aggiorna l\'evento se il cantiere si sposta', () => {
  const s = icsCantiere({ id: 'x', oggetto: 'Bagno', modificato: '2026-11-27T10:00:00.000Z', agenda: { inizio: '2026-12-01', giorni: 2 } }, {});
  assert.match(s, /SEQUENCE:\d+/);
});
