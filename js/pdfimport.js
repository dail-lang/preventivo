// Lettura dei preventivi vecchi in PDF (fatti con Canva o simili), tutta sul dispositivo.
// righeDaPdf: testo del PDF raggruppato in righe e blocchi con la loro posizione.
// leggiPreventivo: dalle righe ricava cliente, data, oggetto, voci, IVA e totale, con avvisi se qualcosa non torna.
import { num, round2, calc, fmtEur } from './calc.js';

/** Restituisce [{y, segs: [{text, x, x2, cx, y, h}]}] dall'alto in basso. */
export async function righeDaPdf(pdfjsLib, bytes) {
  const doc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const items = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const h = Math.abs(it.transform[3]) || it.height || 10;
      items.push({ str: it.str, x: it.transform[4], w: it.width || 0, y: (i - 1) * 10000 + vp.height - it.transform[5], h });
    }
  }
  return raggruppa(items);
}

function raggruppa(items) {
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const righe = [];
  for (const it of items) {
    const r = righe[righe.length - 1];
    if (r && Math.abs(r.y - it.y) <= Math.max(2.5, it.h * 0.3)) r.items.push(it); else righe.push({ y: it.y, items: [it] });
  }
  return righe.map(r => {
    r.items.sort((a, b) => a.x - b.x);
    const segs = [];
    for (const it of r.items) {
      const s = segs[segs.length - 1];
      const gap = s ? it.x - s.x2 : Infinity;
      if (s && gap < Math.max(12, it.h * 1.2)) {
        s.text += (gap > it.h * 0.15 && !s.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
        s.x2 = Math.max(s.x2, it.x + it.w);
      } else segs.push({ text: it.str, x: it.x, x2: it.x + it.w, y: it.y, h: it.h });
    }
    for (const s of segs) { s.text = s.text.replace(/\s+/g, ' ').trim(); s.cx = (s.x + s.x2) / 2; }
    return { y: r.y, segs: segs.filter(s => s.text) };
  }).filter(r => r.segs.length);
}

/** Importo da testo: «4.273,00€», «€ 4.273,00», «810,00». NaN se non c'è. */
export function soldi(t) {
  const m = String(t || '').replace(/\s/g, '').match(/-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|-?\d+(?:,\d{1,2})?|-?\d+\.\d{1,2}/);
  return m ? num(m[0]) : NaN;
}

const UM = [[/^(mq|m2|m²|metri\s*quadr)/i, 'mq'], [/^(ml|m\.?l\.?|metri\s*lineari)/i, 'ml'], [/^(mc|m3|m³)/i, 'mc'], [/^(cad|pz|n\.?|nr|pezz)/i, 'cad'], [/^kg/i, 'kg'], [/^(h|ore|ora)/i, 'h'], [/^(gg|giorn)/i, 'gg'], [/^(q|quintal)/i, 'q'], [/^t\b/i, 't']];
function quantita(t) {
  const s = String(t || '').trim();
  if (!s) return { qta: '', um: 'cad' };
  if (/a\s*corpo|forfait|forfett/i.test(s)) return { qta: '1', um: 'a corpo' };
  const m = s.match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return { qta: '', um: 'cad' };
  const u = m[2].trim();
  const found = UM.find(([re]) => re.test(u));
  return { qta: m[1], um: found ? found[1] : 'cad' };
}
const comeTesto = n => (isFinite(n) ? String(round2(n)).replace('.', ',') : '');
const maiuscola = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function leggiPreventivo(righe) {
  const avvisi = [];
  if (!righe || !righe.length) return { errore: 'senza-testo', avvisi };
  const testo = r => r.segs.map(s => s.text).join(' ');
  const p = {
    cliente: { nome: '', indirizzo: '', cfpiva: '', telefono: '', email: '' }, cantiere: '', oggetto: '', data: '',
    sezioni: [{ id: 's1', titolo: '', voci: [] }], sconto: { tipo: '%', valore: '' }, iva: 10, dettaglio: 'voci',
    tempi: '', pagamento: '', note: ''
  };

  // Data
  const reData = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/;
  const rigaData = righe.find(r => /data/i.test(testo(r)) && reData.test(testo(r))) || righe.find(r => reData.test(testo(r)));
  if (rigaData) {
    const [, d, m, y] = testo(rigaData).match(reData);
    const anno = y.length === 2 ? 2000 + Number(y) : Number(y);
    p.data = `${anno}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  } else avvisi.push('Data non trovata: inseriscila.');

  // Intestazione della tabella
  const hi = righe.findIndex(r => r.segs.some(s => /^descrizion/i.test(s.text)) && r.segs.some(s => /^(totale|importo|prezzo)/i.test(s.text)));
  const fineTesta = hi >= 0 ? hi : righe.length;

  // Cliente: il blocco sotto «CLIENTE:» / «Spett.le», nella stessa colonna
  for (let i = 0; i < fineTesta; i++) {
    const lab = righe[i].segs.find(s => /^(cliente|spett\.?(le)?|committente)\b/i.test(s.text));
    if (!lab) continue;
    const dopo = lab.text.replace(/^(cliente|spett\.?(le)?|committente)\s*:?\s*/i, '').trim();
    const linee = dopo ? [dopo] : [];
    let lastY = lab.y;
    for (let j = i + 1; j < fineTesta; j++) {
      const s = righe[j].segs.find(x => Math.abs(x.x - lab.x) < 25);
      if (!s) continue;
      if (s.y - lastY > Math.max(40, s.h * 3.5) || /^data\b/i.test(s.text)) break;
      linee.push(s.text); lastY = s.y;
    }
    for (const l of linee) {
      if (!p.cliente.nome) { p.cliente.nome = l; continue; }
      if (/@/.test(l)) p.cliente.email = (l.match(/\S+@\S+/) || [''])[0];
      else if (/(c\.?\s*f\.?|p\.?\s*iva)/i.test(l) || /\b\d{11}\b/.test(l) || /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/i.test(l)) p.cliente.cfpiva = l.replace(/^(c\.?\s*f\.?|p\.?\s*iva)[\s.:/]*(p\.?\s*iva)?[\s.:]*/i, '').trim();
      else if (/^(tel|cell)/i.test(l) || /^\+?[\d\s/.-]{8,}$/.test(l)) p.cliente.telefono = l.replace(/^(tel|cell)[a-z.]*\s*:?\s*/i, '').trim();
      else p.cliente.indirizzo = p.cliente.indirizzo ? p.cliente.indirizzo + ', ' + l : l;
    }
    break;
  }
  if (!p.cliente.nome) avvisi.push('Cliente non trovato: inseriscilo.');

  // Oggetto: «Preventivo per …» (anche su più righe, nella stessa colonna)
  for (let i = 0; i < fineTesta; i++) {
    const s = righe[i].segs.find(x => /^preventivo\b/i.test(x.text) && !/^preventivo\s*(n\.?|nr\.?|numero)?\s*[\d/]+\s*$/i.test(x.text));
    if (!s) continue;
    let t = s.text.replace(/^preventivo\s*(per\s+|:\s*|-\s*)?/i, '');
    let lastY = s.y;
    for (let j = i + 1; j < fineTesta; j++) {
      const c = righe[j].segs.find(x => Math.abs(x.x - s.x) < 3);
      if (!c || c.y - lastY > s.h * 1.9 || reData.test(c.text) || /^(data|cliente)\b/i.test(c.text)) break;
      t += ' ' + c.text; lastY = c.y;
    }
    p.oggetto = maiuscola(t.trim());
    break;
  }

  if (hi < 0) {
    avvisi.push('Tabella delle voci non trovata: inserisci le voci a mano.');
    return { preventivo: p, avvisi, totaleLetto: NaN, errore: 'senza-tabella' };
  }

  // Colonne dalla riga di intestazione
  const chiave = t => (/^descrizion/i.test(t) ? 'desc' : /^(quantit|q\.?t[aà]|qta)/i.test(t) ? 'qta' : /^(u\.?\s*m\.?|unit)/i.test(t) ? 'um' : /^(prezzo|p\.?\s*unit)/i.test(t) ? 'prezzo' : /^(totale|importo)/i.test(t) ? 'tot' : null);
  const cols = righe[hi].segs.map(s => ({ k: chiave(s.text), cx: s.cx, x: s.x })).filter(c => c.k).sort((a, b) => a.cx - b.cx);
  const descIdx = cols.findIndex(c => c.k === 'desc');
  const descMax = descIdx >= 0 && cols[descIdx + 1] ? (cols[descIdx].cx + cols[descIdx + 1].cx) / 2 : Infinity;
  const colonna = s => {
    if (descIdx >= 0 && s.x < descMax - 4 && s.x2 <= (cols[descIdx + 1] ? cols[descIdx + 1].x : Infinity)) return 'desc';
    let best = null, d = Infinity;
    for (const c of cols) { const dd = Math.abs(c.cx - s.cx); if (dd < d) { d = dd; best = c.k; } }
    return best;
  };

  // Righe delle voci fino ai totali
  const reTot = /^(sub\s*-?\s*totale|imponibile|totale|iva|sconto)\b/i;
  let fi = righe.findIndex((r, i) => i > hi && r.segs.some(s => reTot.test(s.text) && colonna(s) !== 'desc'));
  if (fi < 0) fi = righe.length;
  const desc = [], vals = { qta: [], um: [], prezzo: [], tot: [] };
  for (let i = hi + 1; i < fi; i++) for (const s of righe[i].segs) {
    const k = colonna(s);
    if (k === 'desc') desc.push({ y: s.y, h: s.h, text: s.text }); else if (vals[k]) vals[k].push({ y: s.y, text: s.text });
  }
  const anc = (vals.tot.length ? vals.tot : vals.prezzo.length ? vals.prezzo : vals.qta).map(v => v.y);

  // Gruppi di righe di descrizione: uno stacco più ampio della normale interlinea separa due voci
  const gruppi = [];
  if (desc.length) {
    const gaps = desc.slice(1).map((d, i) => d.y - desc[i].y);
    const base = gaps.length ? Math.min(...gaps) : 0;
    let g = [desc[0]];
    for (let i = 1; i < desc.length; i++) { if (gaps[i - 1] > base * 1.6 + 1) { gruppi.push(g); g = []; } g.push(desc[i]); }
    gruppi.push(g);
  }
  const testoGruppo = g => g.map(d => d.text).join(' ').replace(/\s+/g, ' ').replace(/ ([,.;:])/g, '$1').trim();
  const centro = g => (g[0].y + g[g.length - 1].y) / 2;
  let testi = [];
  if (anc.length <= 1) testi = [desc.length ? testoGruppo(desc) : ''];
  else if (gruppi.length === anc.length) testi = gruppi.map(testoGruppo);
  else {
    testi = anc.map(() => []);
    for (const g of gruppi) { let k = 0, d = Infinity; anc.forEach((y, i) => { const dd = Math.abs(centro(g) - y); if (dd < d) { d = dd; k = i; } }); testi[k].push(...g); }
    testi = testi.map(g => (g.length ? testoGruppo(g) : ''));
    avvisi.push('Controlla come sono divise le descrizioni delle voci.');
  }
  const vicino = (list, y) => { let best = null, d = Infinity; for (const v of list) { const dd = Math.abs(v.y - y); if (dd < d) { d = dd; best = v; } } return best && d < 40 ? best.text : ''; };
  const ancore = anc.length ? anc : [desc.length ? centro(desc) : 0];
  ancore.forEach((y, k) => {
    let { qta, um } = quantita(vicino(vals.qta, y));
    const umTxt = vicino(vals.um, y);
    if (umTxt) { const f = UM.find(([re]) => re.test(umTxt)); um = /a\s*corpo/i.test(umTxt) ? 'a corpo' : f ? f[1] : um; if (um === 'a corpo' && !qta) qta = '1'; }
    let prezzo = soldi(vicino(vals.prezzo, y));
    const tot = soldi(vicino(vals.tot, y));
    if (!isFinite(prezzo) && isFinite(tot)) prezzo = (um === 'a corpo' || !qta) ? tot : tot / num(qta);
    if (!qta && isFinite(prezzo)) { qta = '1'; um = um || 'a corpo'; }
    const q = num(qta);
    if (isFinite(tot) && isFinite(q) && isFinite(prezzo) && Math.abs(round2(q * prezzo) - tot) > 0.02) avvisi.push(`Voce ${k + 1}: quantità × prezzo (${fmtEur(round2(q * prezzo))}) non dà il totale scritto (${fmtEur(tot)}).`);
    p.sezioni[0].voci.push({ id: 'v' + (k + 1), desc: testi[k] || '', um, qta, prezzo: comeTesto(prezzo) });
  });

  // Totali in fondo
  let sub = NaN, iva = NaN, totale = NaN, pct = NaN;
  for (let i = fi; i < righe.length; i++) {
    const t = testo(righe[i]);
    const imp = soldi(righe[i].segs.filter(s => !reTot.test(s.text) || /\d/.test(s.text.replace(/iva\s*\d+\s*%/i, ''))).map(s => s.text.replace(/iva\s*\d+\s*%/i, '')).join(' ').replace(reTot, ''));
    const m = t.match(/iva[^\d]{0,6}(\d{1,2}(?:,\d)?)\s*%/i);
    if (m) pct = num(m[1]);
    if (/^(sub\s*-?\s*totale|imponibile)/i.test(t)) sub = imp;
    else if (/^iva/i.test(t)) iva = imp;
    else if (/^totale/i.test(t) && !isFinite(totale)) totale = imp;
  }
  const lordo = calc(p).lordo;
  if (isFinite(pct)) p.iva = pct;
  else if (isFinite(iva) && (isFinite(sub) ? sub : lordo) > 0) {
    const r = iva / (isFinite(sub) ? sub : lordo) * 100;
    const std = [0, 4, 10, 22].find(a => Math.abs(a - r) < 0.6);
    p.iva = std !== undefined ? std : Math.round(r);
    if (std === undefined) avvisi.push(`IVA insolita (${r.toFixed(1)}%): controllala.`);
  } else if (isFinite(totale) && lordo > 0 && Math.abs(totale - lordo) < 0.02) p.iva = 0;
  else avvisi.push('IVA non trovata: controllala.');
  if (isFinite(sub) && Math.abs(sub - lordo) > 0.02) avvisi.push(`La somma delle voci (${fmtEur(lordo)}) non dà l'imponibile scritto (${fmtEur(sub)}).`);
  const finale = calc(p).totale;
  if (isFinite(totale) && Math.abs(totale - finale) > 0.02) avvisi.push(`Il totale scritto sul PDF (${fmtEur(totale)}) non torna con i conti (${fmtEur(finale)}): controlla.`);
  if (!isFinite(totale)) avvisi.push('Totale non trovato: controlla gli importi.');
  return { preventivo: p, avvisi, totaleLetto: isFinite(totale) ? totale : NaN };
}

/** Categoria del listino indovinata dalla descrizione. */
export function categoriaDa(desc, titoloSezione) {
  const d = (desc || '').toLowerCase();
  const regole = [
    [/demoli|rimozion|smontagg/, 'Demolizioni e rimozioni'], [/bagno|doccia|sanitari/, 'Bagno'], [/idraul|scarich|acqua/, 'Impianto idraulico'],
    [/elettric|punto luce|prese/, 'Impianto elettrico'], [/massett|pavimen|battiscopa|gres|parquet/, 'Massetti e pavimenti'],
    [/rivestim|piastrell/, 'Rivestimenti'], [/cartongess|controsoffit|velett/, 'Cartongesso'], [/tinteggi|pittur|imbianc|rasatur|antimuff/, 'Tinteggiatura'],
    [/tetto|copertur|coppi|guaina|lattoner/, 'Copertura'], [/facciat|cappotto|balcon|ponteggi/, 'Facciate e balconi'],
    [/smaltim|pulizia|macerie|discarica/, 'Smaltimento e pulizia']
  ];
  const f = regole.find(([re]) => re.test(d));
  return f ? f[1] : (titoloSezione || 'Varie');
}
