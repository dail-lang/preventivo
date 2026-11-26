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
export const numStr = p => (p.esempio ? 'Esempio' : `${p.anno}/${String(p.numero).padStart(3, '0')}${Number(p.rev) > 1 ? ' rev. ' + p.rev : ''}`);

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

/** Testo senza maiuscole né accenti, diviso in parole. */
const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9×]+/g, ' ').trim();

/**
 * Voci del listino simili a quello che si sta scrivendo: ogni parola cercata deve comparire
 * (meglio se all'inizio di una parola); a parità di punteggio, descrizione più corta.
 */
export function suggerisci(testo, listino, n = 4) {
  const q = normal(testo);
  if (q.replace(/\s/g, '').length < 3) return [];
  const parole = q.split(' ').filter(Boolean);
  if ((listino || []).some(v => v.desc && normal(v.desc) === q)) return [];
  const out = [];
  for (const v of listino || []) {
    if (!v || !v.desc) continue;
    const d = normal(v.desc);
    const dp = d.split(' ');
    let score = 0, ok = true;
    for (const p of parole) {
      if (dp.some(w => w.startsWith(p))) score += dp[0].startsWith(p) ? 3 : 2;
      else if (d.includes(p)) score += 1;
      else { ok = false; break; }
    }
    if (ok) out.push({ v, score, len: d.length });
  }
  out.sort((a, b) => b.score - a.score || a.len - b.len);
  return out.slice(0, n).map(x => x.v);
}

/** Messaggio che accompagna il PDF su WhatsApp. Segnaposto: {nome} {numero} {oggetto} {totale} {impresa} {telefono}. */
export const MESSAGGIO_BASE = 'Buongiorno {nome}, le invio il preventivo n. {numero} per {oggetto}. Resto a disposizione. {impresa} – {telefono}';
export function messaggioInvio(modello, p, a = {}) {
  const val = {
    nome: (p.cliente && p.cliente.nome || '').trim(), numero: numStr(p), oggetto: (p.oggetto || '').trim(),
    totale: fmtEur(calc(p).totale), impresa: a.ragione || '', telefono: a.telefono || ''
  };
  let s = String(modello || MESSAGGIO_BASE);
  if (!val.nome) s = s.replace(/\s*\{nome\}/g, '');
  if (!val.oggetto) s = s.replace(/\s*(per|di|relativo a)?\s*\{oggetto\}/gi, '');
  return s.replace(/\{(nome|numero|oggetto|totale|impresa|telefono)\}/g, (m, k) => val[k]).replace(/\s+([,.])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
/** Numero per wa.me: solo cifre, con il prefisso 39 per i numeri italiani. */
export function telefonoWa(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('39') || d.length <= 10) d = (d.length <= 10 ? '39' : '') + d;
  return d;
}

/** Giorni interi da una data ISO a oggi (0 se manca). */
export function giorniDa(iso, oggiIso) {
  if (!iso) return 0;
  const t = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(oggiIso) - t(String(iso))) / 86400000);
}
/** Id dei preventivi inviati che aspettano una telefonata: inviati (o richiamati) da almeno «giorni» giorni. */
export function daRichiamare(list, oggiIso, giorni) {
  const out = new Set();
  for (const p of list || []) {
    if (!p || p.esempio || p.stato !== 'inviato') continue;
    const da = p.richiamato || p.dataInvio || p.data;
    if (da && giorniDa(da, oggiIso) >= giorni) out.add(p.id);
  }
  return out;
}

/* Revisioni: copie delle versioni precedenti dentro il preventivo stesso. */
const CAMPI_REV = ['data', 'cliente', 'cantiere', 'oggetto', 'sezioni', 'sconto', 'iva', 'dettaglio', 'tempi', 'pagamento', 'note'];
const copia = x => JSON.parse(JSON.stringify(x));
export const MAX_REVISIONI = 10;
/** Salva la versione attuale tra le revisioni (max 10) e apre la successiva: torna bozza, va rifirmata e rispedita. */
export function nuovaRevisione(p, oggiIso) {
  const q = copia(p);
  const rev = Number(p.rev) || 1;
  const contenuto = {};
  for (const k of CAMPI_REV) if (p[k] !== undefined) contenuto[k] = copia(p[k]);
  q.revisioni = [...(q.revisioni || []), { n: rev, data: p.data || '', totale: calc(p).totale, contenuto }].slice(-MAX_REVISIONI);
  q.rev = rev + 1;
  q.stato = 'bozza';
  q.data = oggiIso;
  delete q.firma; delete q.dataInvio; delete q.richiamato;
  return q;
}
/** Riporta il contenuto della revisione n: la versione attuale viene salvata e quella ripristinata diventa una nuova revisione. */
export function ripristinaRevisione(p, n, oggiIso) {
  const r = (p.revisioni || []).find(x => x.n === n);
  if (!r) return null;
  const q = nuovaRevisione(p, oggiIso);
  Object.assign(q, copia(r.contenuto));
  q.data = oggiIso;
  return q;
}

/**
 * Margine senza IVA, dopo lo sconto. Riguarda solo le voci con un costo valido (lo sconto è ripartito in proporzione):
 * con il costo su tutte le voci il ricavo è l'imponibile. Mai nel PDF.
 */
export function calcMargine(p) {
  const c = calc(p);
  const quota = c.lordo > 0 ? c.imponibile / c.lordo : 1;
  let costi = 0, importi = 0, vociConCosto = 0, voci = 0;
  (p.sezioni || []).forEach((s, si) => (s.voci || []).forEach((v, vi) => {
    voci++;
    if (!String(v.costo ?? '').trim()) return;
    const k = num(v.costo), q = qtaOf(v);
    if (!isFinite(k) || !isFinite(q)) return;
    costi += q * k; importi += c.sez[si].voci[vi].imp; vociConCosto++;
  }));
  costi = round2(costi);
  const ricavo = vociConCosto === voci ? c.imponibile : round2(importi * quota);
  const margine = round2(ricavo - costi);
  return { costi, ricavo, margine, perc: ricavo > 0 ? Math.round(margine / ricavo * 1000) / 10 : 0, conCosto: vociConCosto > 0, vociConCosto, voci };
}

/* Acconti e saldo: rate in % del totale (IVA compresa) o a importo fisso. */
export const RATE_BASE = "30% all'accettazione, 40% a metà lavori, 30% a fine lavori";
const idRata = () => 'r' + Math.random().toString(36).slice(2, 9);
const percDi = r => (r.perc === '' || r.perc === null || r.perc === undefined ? NaN : Number(r.perc));
/** Importi delle rate in % non pagate sul totale; se tutte sono in % e fanno 100, l'ultima non pagata assorbe i centesimi. */
export function ricalcolaRate(rate, totale) {
  const out = (rate || []).map(r => ({ ...r }));
  const libere = out.filter(r => !r.pagata && isFinite(percDi(r)));
  for (const r of libere) r.importo = round2(totale * percDi(r) / 100);
  const tutteInPerc = out.length && out.every(r => isFinite(percDi(r)));
  const sommaPerc = round2(out.reduce((t, r) => t + (percDi(r) || 0), 0));
  if (libere.length && tutteInPerc && sommaPerc === 100) {
    const ultima = libere[libere.length - 1];
    const altre = out.filter(r => r !== ultima).reduce((t, r) => t + (Number(r.importo) || 0), 0);
    ultima.importo = round2(totale - altre);
  }
  return out;
}
/** «30% all'accettazione, 40% a metà lavori, 30% a fine lavori» → rate. Le parti senza % vengono ignorate. */
export function rateDaTesto(testo, totale) {
  const rate = [];
  for (const parte of String(testo || '').split(/[,;\n]+/)) {
    const m = parte.match(/(\d+(?:[.,]\d+)?)\s*%\s*(.*)/);
    if (!m) continue;
    let desc = m[2].trim().replace(/^(di|del|da)\s+/i, '');
    desc = desc ? desc[0].toUpperCase() + desc.slice(1) : 'Rata ' + (rate.length + 1);
    rate.push({ id: idRata(), desc, perc: Number(m[1].replace(',', '.')), importo: 0, scadenza: '', pagata: '' });
  }
  return ricalcolaRate(rate, totale);
}
/** Incassato, da incassare (sul totale IVA compresa), rate scadute non pagate e prossima rata da incassare. */
export function statoPagamenti(p, oggiIso) {
  const rate = p.rate || [];
  const totale = calc(p).totale;
  const incassato = round2(rate.filter(r => r.pagata).reduce((t, r) => t + (Number(r.importo) || 0), 0));
  const aperte = rate.filter(r => !r.pagata);
  const scadute = aperte.filter(r => r.scadenza && r.scadenza < oggiIso).length;
  const conData = aperte.filter(r => r.scadenza).sort((a, b) => a.scadenza.localeCompare(b.scadenza));
  return { incassato, daIncassare: round2(Math.max(0, totale - incassato)), scadute, prossima: conData[0] || aperte[0] || null };
}
