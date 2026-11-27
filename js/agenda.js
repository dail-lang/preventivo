// Agenda dei cantieri: giorni lavorativi (lun–ven, festivi italiani e San Gaudenzo), settimane, scadenze delle rate, file .ics.
// Funzioni pure, senza DOM. Date in formato ISO «aaaa-mm-gg», calcolate in UTC per non avere sorprese col fuso orario.

const DAY = 86400000;
const t = iso => { const [y, m, d] = String(iso).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const piu = (s, n) => iso(t(s) + n * DAY);
const valido = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/** Domenica di Pasqua (algoritmo gregoriano anonimo). */
function pasqua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(Date.UTC(y, mese - 1, giorno));
}
const FISSI = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '10-14', '11-01', '12-08', '12-25', '12-26'];

/** Festivo nazionale, Pasquetta o San Gaudenzo (14 ottobre, patrono di Rimini). */
export function festivo(s) {
  if (!valido(s)) return false;
  if (FISSI.includes(s.slice(5))) return true;
  return s === piu(pasqua(+s.slice(0, 4)), 1);
}
export function lavorativo(s) {
  if (!valido(s)) return false;
  const g = new Date(t(s)).getUTCDay();
  return g !== 0 && g !== 6 && !festivo(s);
}
const primoLavorativo = s => { let d = s; while (!lavorativo(d)) d = piu(d, 1); return d; };

/** Ultimo giorno di lavoro: il giorno di inizio (o il primo lavorativo dopo) è il giorno 1. */
export function fineLavori(inizio, giorni) {
  const n = Number(giorni);
  if (!valido(inizio) || !(n >= 1)) return '';
  let d = primoLavorativo(inizio), fatti = 1;
  while (fatti < n) { d = piu(d, 1); if (lavorativo(d)) fatti++; }
  return d;
}

/** Sposta di n giorni lavorativi (anche indietro); il risultato è sempre un giorno lavorativo. */
export function spostaLavorativi(s, n) {
  if (!valido(s)) return s;
  let d = s, passi = Math.abs(Number(n) || 0);
  const dir = Number(n) < 0 ? -1 : 1;
  while (passi > 0) { d = piu(d, dir); if (lavorativo(d)) passi--; }
  if (!lavorativo(d)) d = dir < 0 ? (() => { let x = d; while (!lavorativo(x)) x = piu(x, -1); return x; })() : primoLavorativo(d);
  return d;
}

/** Numero del giorno di lavoro oggi (1…giorni); 0 se oggi il cantiere non è in corso. */
export function giornoLavoro(oggi, inizio, giorni) {
  const fine = fineLavori(inizio, giorni);
  if (!fine) return 0;
  const parte = primoLavorativo(inizio);
  if (oggi < parte || oggi > fine) return 0;
  let n = 0;
  for (let d = parte; d <= oggi; d = piu(d, 1)) if (lavorativo(d)) n++;
  return n;
}

const PAROLE = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, quindici: 15, venti: 20, trenta: 30 };
/** Durata in giorni lavorativi letta dai «Tempi di esecuzione»: «15 giorni» → 15, «4 settimane» → 20, «un mese» → 20. */
export function durataDaTesto(testo) {
  const s = String(testo || '').toLowerCase();
  const m = s.match(/(\d+|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|quindici|venti|trenta)\s*(giorn|gg|settiman|mes)/);
  if (!m) return '';
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : PAROLE[m[1]];
  return m[2] === 'settiman' ? n * 5 : m[2] === 'mes' ? n * 20 : n;
}

export function lunediDi(s) { const g = new Date(t(s)).getUTCDay(); return piu(s, g === 0 ? -6 : 1 - g); }

const inAgenda = p => p && !p.esempio && p.stato !== 'rifiutato' && (p.stato === 'accettato' || !!p.firma);
/** Cantieri con le date, con fine calcolata. */
export function cantieri(preventivi) {
  return (preventivi || []).filter(p => inAgenda(p) && p.agenda && valido(p.agenda.inizio) && Number(p.agenda.giorni) >= 1)
    .map(p => ({ p, inizio: primoLavorativo(p.agenda.inizio), giorni: Number(p.agenda.giorni), fine: fineLavori(p.agenda.inizio, p.agenda.giorni) }));
}
/** Lavori accettati ancora senza data. */
export function daProgrammare(preventivi) {
  return (preventivi || []).filter(p => inAgenda(p) && !(p.agenda && valido(p.agenda.inizio)));
}
/** La settimana da lunedì a domenica: cantieri in corso, quelli che iniziano, quelli che finiscono (con la rata da incassare), note. */
export function agendaSettimana(preventivi, note, lunedi, oggi) {
  const dom = piu(lunedi, 6);
  const cs = cantieri(preventivi).filter(c => c.inizio <= dom && c.fine >= lunedi);
  const rataDi = c => (c.p.rate || []).find(r => !r.pagata && r.scadenza === c.fine) || (c.p.rate || []).find(r => !r.pagata && /saldo|fine/i.test(r.desc || '')) || null;
  return {
    corso: cs.slice().sort((a, b) => a.inizio.localeCompare(b.inizio)).map(c => ({ ...c, giorno: giornoLavoro(oggi, c.p.agenda.inizio, c.giorni) })),
    inizi: cs.filter(c => c.inizio >= lunedi).sort((a, b) => a.inizio.localeCompare(b.inizio)),
    fini: cs.filter(c => c.fine <= dom).sort((a, b) => a.fine.localeCompare(b.fine) || a.inizio.localeCompare(b.inizio)).map(c => ({ ...c, rata: rataDi(c) })),
    note: (note || []).filter(n => n.data >= lunedi && n.data <= dom).sort((a, b) => String(a.data).localeCompare(String(b.data)))
  };
}

/** Le rate senza scadenza prendono la data dal cantiere: acconto/inizio → inizio, metà → metà lavori, fine/saldo → fine. */
export function scadenzeDaCantiere(rate, inizio, fine) {
  if (!valido(inizio) || !valido(fine)) return (rate || []).map(r => ({ ...r }));
  let tot = 0; for (let d = primoLavorativo(inizio); d <= fine; d = piu(d, 1)) if (lavorativo(d)) tot++;
  const meta = fineLavori(inizio, Math.ceil(tot / 2));
  return (rate || []).map(r => {
    if (r.scadenza && !r.scadenzaAuto) return { ...r }; // scritta a mano: non si tocca
    const d = r.desc || '';
    const s = /met[aà]/i.test(d) ? meta : /fine|saldo/i.test(d) ? fine : /accettaz|inizio|acconto/i.test(d) ? primoLavorativo(inizio) : '';
    if (!s) return { ...r };
    return { ...r, scadenza: s, scadenzaAuto: true };
  });
}

const icsTesto = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Evento di tutto il giorno, dal primo all'ultimo giorno di lavoro, da aggiungere al calendario del telefono. */
export function icsCantiere(p, azienda = {}) {
  const a = p.agenda || {};
  const ini = primoLavorativo(a.inizio), fine = fineLavori(a.inizio, a.giorni);
  const c = x => x.replace(/-/g, '');
  const cliente = (p.cliente && p.cliente.nome) || '';
  const luogo = p.cantiere || (p.cliente && p.cliente.indirizzo) || '';
  const desc = [a.chi && 'Chi ci lavora: ' + a.chi, a.note, azienda.ragione].filter(Boolean).join('\n');
  const ora = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nazifoski//Preventivi//IT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:cantiere-${p.id}@nazifoski`, `DTSTAMP:${ora}`, `DTSTART;VALUE=DATE:${c(ini)}`, `DTEND;VALUE=DATE:${c(piu(fine, 1))}`,
    `SUMMARY:${icsTesto(`Cantiere: ${p.oggetto || 'lavori'}${cliente ? ' – ' + cliente : ''}`)}`,
    ...(luogo ? [`LOCATION:${icsTesto(luogo)}`] : []), ...(desc ? [`DESCRIPTION:${icsTesto(desc)}`] : []),
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
