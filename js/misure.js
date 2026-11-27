// Misure delle stanze: aree di pavimento, soffitto e pareti (meno porte e finestre),
// e l'espressione da scrivere nella Quantità così il calcolo resta visibile e modificabile.
import { num, round2 } from './calc.js';

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
