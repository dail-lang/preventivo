// Misure delle stanze: aree di pavimento, soffitto e pareti (meno porte e finestre),
// e l'espressione da scrivere nella Quantità così il calcolo resta visibile e modificabile.
import { num, round2, suggerisci } from './calc.js';

const val = x => { const n = typeof x === 'number' ? x : num(x); return isFinite(n) && n > 0 ? n : 0; };
const t = n => String(round2(n)).replace('.', ',');

export function areeStanza({ l, p, h, aperture = [] } = {}) {
  const L = val(l), P = val(p), H = val(h);
  const pav = round2(L * P);
  const fori = (aperture || []).reduce((s, a) => s + val(a.l) * val(a.h) * (val(a.n) || 1), 0);
  const pareti = H && L && P ? Math.max(0, round2(2 * (L + P) * H - fori)) : 0;
  return { pavimento: L && P ? pav : 0, soffitto: L && P ? pav : 0, pareti };
}

function termini(st, tipo) {
  const L = val(st.l), P = val(st.p), H = val(st.h);
  if (!L || !P) return [];
  const pav = `${t(L)}*${t(P)}`;
  const aperte = (st.aperture || []).filter(a => val(a.l) && val(a.h));
  let par = '';
  if (H && areeStanza(st).pareti > 0) par = `2*(${t(L)}+${t(P)})*${t(H)}` + aperte.map(a => `-${t(val(a.l))}*${t(val(a.h))}${(val(a.n) || 1) !== 1 ? '*' + t(val(a.n)) : ''}`).join('');
  if (tipo === 'pavimento' || tipo === 'soffitto') return [pav];
  if (tipo === 'pareti') return par ? [par] : [];
  if (tipo === 'pareti+soffitto') return [par, pav].filter(Boolean);
  if (tipo === 'perimetro') return [`2*(${t(L)}+${t(P)})`];
  return [];
}

/** Espressione per una o più stanze, es. «4*3,5» o «(2*(4+3,5)*2,7-0,8*2,1*2)+(3*3)». */
export function espressione(stanze, tipo) {
  const parti = (stanze || []).map(s => termini(s, tipo)).filter(x => x.length).map(x => x.join('+'));
  if (!parti.length) return '';
  if (parti.length === 1) return parti[0];
  return parti.map(x => (/[+-]/.test(x) ? `(${x})` : x)).join('+');
}

/** Perimetro della stanza in metri lineari (battiscopa, zoccolini). */
export function perimetro({ l, p } = {}) {
  const L = val(l), P = val(p);
  return L && P ? round2(2 * (L + P)) : 0;
}
/** Somma di pavimento, soffitto, pareti e perimetro di tutte le stanze. */
export function totaliStanze(stanze) {
  const t = { pavimento: 0, soffitto: 0, pareti: 0, perimetro: 0 };
  for (const s of stanze || []) {
    const a = areeStanza(s);
    t.pavimento += a.pavimento; t.soffitto += a.soffitto; t.pareti += a.pareti; t.perimetro += perimetro(s);
  }
  for (const k in t) t[k] = round2(t[k]);
  return t;
}

/* Preventivo da un rilievo: le lavorazioni più comuni, con la quantità giusta per ogni stanza. */
export const LAVORAZIONI = [
  { k: 'pavimento', nome: 'Pavimento', desc: 'Fornitura e posa pavimento', um: 'mq', tipo: 'pavimento', cerca: ['posa pavimento', 'pavimento'], si: true },
  { k: 'rivestimento', nome: 'Rivestimento pareti', desc: 'Fornitura e posa rivestimento pareti', um: 'mq', tipo: 'pareti', cerca: ['posa rivestimento', 'rivestimento'] },
  { k: 'tinteggiatura', nome: 'Tinteggiatura pareti e soffitto', desc: 'Tinteggiatura pareti e soffitto, due mani', um: 'mq', tipo: 'pareti+soffitto', cerca: ['tinteggiatura', 'idropittura', 'pittura'], si: true },
  { k: 'battiscopa', nome: 'Battiscopa', desc: 'Fornitura e posa battiscopa', um: 'ml', tipo: 'perimetro', cerca: ['battiscopa', 'zoccolino'], si: true },
  { k: 'massetto', nome: 'Massetto', desc: 'Massetto di sottofondo', um: 'mq', tipo: 'pavimento', cerca: ['massetto'] }
];
const DA_EVITARE = /demoli|rimozion|smantell|smaltim|asportaz/i;
/** La voce del listino che corrisponde alla lavorazione (mai una demolizione), o null. */
export function cercaNelListino(lav, listino) { return vociPerLavorazione(lav, listino)[0] || null; }
/** Tutte le voci del listino adatte alla lavorazione (la migliore prima), senza demolizioni. */
export function vociPerLavorazione(lav, listino, max = 8) {
  const out = [];
  for (const q of lav.cerca || []) for (const v of suggerisci(q, listino, 20)) {
    if (DA_EVITARE.test(v.desc || '') || (v.um && v.um !== lav.um) || out.includes(v)) continue;
    out.push(v);
  }
  return out.slice(0, max);
}
/** Una sezione per stanza (solo quelle con lunghezza e larghezza), una voce per lavorazione scelta. */
export function sezioniDaRilievo(rilievo, scelte, nuovoId) {
  return (rilievo.stanze || []).map((s, i) => ({ s, i })).filter(({ s }) => val(s.l) && val(s.p)).map(({ s, i }) => {
    const stanza = { l: s.l, p: s.p, h: s.h, aperture: (s.aperture || []).map(a => ({ ...a })) };
    const voci = scelte.map(c => ({ c, qta: espressione([stanza], c.tipo) })).filter(x => x.qta).map(({ c, qta }) => ({
      id: nuovoId(), desc: c.desc, um: c.um, qta, prezzo: String(c.prezzo ?? ''), ...(c.costo !== undefined && c.costo !== '' ? { costo: String(c.costo) } : {}), misure: [JSON.parse(JSON.stringify(stanza))]
    }));
    return { id: nuovoId(), titolo: (s.nome || '').trim() || `Stanza ${i + 1}`, voci };
  }).filter(x => x.voci.length);
}
