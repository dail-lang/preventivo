// Calcoli e formati: funzioni pure, senza DOM. Stesso comportamento dell'app su claude.ai.

export const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

const NF = {};
const nf = (min, max) => NF[min + '/' + max] || (NF[min + '/' + max] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: min, maximumFractionDigits: max }));
const group = str => str.replace(/^(-?)(\d+)/, (m, sg, int) => sg + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
export const fmtEur = n => '€ ' + group(nf(2, 2).format(isFinite(n) ? n : 0));
export const fmtNum = (n, d = 2) => group(nf(0, d).format(isFinite(n) ? n : 0));

const pad2 = n => String(n).padStart(2, '0');
export const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const today = () => isoDate(new Date());
export const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
export const numStr = p => (p.esempio ? 'Esempio' : `${p.anno}/${String(p.numero).padStart(3, '0')}`);

/** Calcolatrice: "3,5*4 + 2x1,2", "1.250,50", parentesi. Niente eval. NaN se non valida. */
export function num(expr) {
  if (expr === null || expr === undefined) return NaN;
  if (typeof expr === 'number') return expr;
  const s = String(expr).trim().replace(/€/g, '').replace(/[x×X]/g, '*').replace(/÷|:/g, '/');
  if (!s) return NaN;
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.,]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.,]/.test(s[j])) j++;
      let t = s.slice(i, j);
      if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
      else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
      const v = parseFloat(t);
      if (!isFinite(v)) return NaN;
      toks.push(v); i = j; continue;
    }
    if ('+-*/()'.includes(ch)) { toks.push(ch); i++; continue; }
    return NaN;
  }
  let p = 0;
  const peek = () => toks[p];
  function expr_() { let v = term(); while (peek() === '+' || peek() === '-') { const o = toks[p++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  function term() { let v = fac(); while (peek() === '*' || peek() === '/') { const o = toks[p++]; const r = fac(); v = o === '*' ? v * r : v / r; } return v; }
  function fac() {
    const t = toks[p++];
    if (t === '-') return -fac();
    if (t === '+') return fac();
    if (t === '(') { const v = expr_(); if (toks[p++] !== ')') throw 0; return v; }
    if (typeof t === 'number') return t;
    throw 0;
  }
  try { const v = expr_(); if (p !== toks.length) return NaN; return isFinite(v) ? v : NaN; } catch (e) { return NaN; }
}
export const isExpr = s => /[+*/x×()]|\d\s*-\s*\d/.test(String(s || '').replace(/^\s*-/, ''));

export function qtaOf(v) {
  const raw = String(v.qta ?? '').trim();
  if (!raw && v.um === 'a corpo') return 1;
  return num(raw);
}

export function calc(p) {
  let lordo = 0;
  const sez = (p.sezioni || []).map(s => {
    let tot = 0;
    const voci = (s.voci || []).map(v => {
      const q = qtaOf(v), pr = num(v.prezzo);
      const imp = isFinite(q) && isFinite(pr) ? round2(q * pr) : 0;
      tot += imp;
      return { q, pr, imp };
    });
    tot = round2(tot); lordo += tot;
    return { voci, tot };
  });
  lordo = round2(lordo);
  const sv = num(p.sconto?.valore);
  let sconto = 0;
  if (isFinite(sv) && sv > 0) sconto = p.sconto.tipo === '%' ? round2(lordo * sv / 100) : round2(sv);
  sconto = Math.min(sconto, lordo);
  const imponibile = round2(lordo - sconto);
  const aliq = Number(p.iva) || 0;
  const iva = round2(imponibile * aliq / 100);
  return { sez, lordo, sconto, imponibile, aliq, iva, totale: round2(imponibile + iva) };
}

export function nextNumero(list, anno) {
  return list.filter(p => !p.esempio && Number(p.anno) === anno).reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0) + 1;
}

/** Id dei preventivi (non di esempio) che condividono anno e numero con un altro. */
export function duplicati(list) {
  const seen = new Map();
  const out = new Set();
  for (const p of list) {
    if (p.esempio) continue;
    const k = p.anno + '/' + p.numero;
    if (seen.has(k)) { out.add(seen.get(k)); out.add(p.id); } else seen.set(k, p.id);
  }
  return out;
}
