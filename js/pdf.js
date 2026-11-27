// PDF del preventivo: impaginazione (pdfmake), anteprima (pdf.js) e pulsanti Condividi / Apri / Scarica.
import { calc, fmtEur, fmtNum, fmtDate, num, numStr, telefonoWa } from './calc.js';

const VENDOR = { pdfmake: 'vendor/pdfmake.min.js', pdfjs: 'vendor/pdf.min.js', worker: 'vendor/pdf.worker.min.js' };
const loaded = {};
function loadScript(src) {
  if (loaded[src]) return loaded[src];
  return (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error('Impossibile caricare ' + src)); };
    document.head.appendChild(s);
  }));
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);

/** Carica pdf.js (incluso nell'app, funziona anche senza rete) e restituisce la libreria. */
export async function caricaPdfJs() {
  await Promise.all([loadScript(VENDOR.worker), loadScript(VENDOR.pdfjs)]);
  return window.pdfjsLib;
}

export function fileName(p) {
  const cli = (p.cliente?.nome || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `Preventivo ${p.esempio ? 'esempio' : p.anno + '-' + String(p.numero).padStart(3, '0') + (Number(p.rev) > 1 ? ' rev' + p.rev : '')}${cli ? ' ' + cli : ''}.pdf`;
}

/** Restituisce il PDF come Uint8Array. */
export async function makePdf(p, a) {
  const [, { NZ_ASSETS: A }] = await Promise.all([loadScript(VENDOR.pdfmake), import('./assets.js')]);
  const vfs = { 'Inter-Regular.ttf': A['Inter-Regular.ttf'], 'Inter-SemiBold.ttf': A['Inter-SemiBold.ttf'], 'Inter-Italic.ttf': A['Inter-Italic.ttf'], 'SpaceGrotesk-Bold.ttf': A['SpaceGrotesk-Bold.ttf'] };
  const fonts = {
    Inter: { normal: 'Inter-Regular.ttf', bold: 'Inter-SemiBold.ttf', italics: 'Inter-Italic.ttf', bolditalics: 'Inter-SemiBold.ttf' },
    Grotesk: { normal: 'SpaceGrotesk-Bold.ttf', bold: 'SpaceGrotesk-Bold.ttf', italics: 'SpaceGrotesk-Bold.ttf', bolditalics: 'SpaceGrotesk-Bold.ttf' }
  };
  const dd = buildDoc(p, a, A.logo);
  const buf = await new Promise((res, rej) => { try { window.pdfMake.createPdf(dd, null, fonts, vfs).getBuffer(b => res(b)); } catch (e) { rej(e); } });
  return new Uint8Array(buf);
}

let state = null;
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 13v7h14v-7"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z"/></svg>',
  firma: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17c3-4 5-9 7-9 2.5 0-1 9 1.5 9 1.8 0 2.5-3 4-3 1.2 0 1 2 2.5 2H21"/><path d="M3 21h18"/></svg>',
  sent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'
};

export function closePreview(fromBack) {
  const pv = $('#preview');
  if (!pv || pv.hidden) return;
  pv.hidden = true; pv.innerHTML = '';
  document.body.style.overflow = '';
  if (state && state.url) URL.revokeObjectURL(state.url);
  const s = state; state = null;
  if (!fromBack && s && s.onClose) s.onClose();
}

export async function openPreview(p, a, opts = {}) {
  const { onClose, onSent, onShared, onFirma, toast, messaggio = '', telefono = '' } = opts;
  const pv = $('#preview');
  const name = fileName(p);
  state = { onClose, url: null };
  const my = state;
  document.body.style.overflow = 'hidden';
  pv.hidden = false;
  pv.innerHTML = `<div class="preview-bar"><div class="wrap">
      <button class="btn ghost" type="button" id="pv-close" aria-label="Torna al preventivo">${ICON.back}</button>
      <div class="info"><b>${esc(name)}</b><span id="pv-info">Preparo il PDF…</span></div>
      <div class="preview-actions" id="pv-actions" hidden>
        <button class="btn primary" type="button" id="pv-share" hidden>${ICON.share} Condividi</button>
        <a class="btn" id="pv-open" target="_blank" rel="noopener">${ICON.open} Apri</a>
        <a class="btn" id="pv-dl" download="${esc(name)}">${ICON.dl} Scarica</a>
        <a class="btn" id="pv-wa" target="_blank" rel="noopener" hidden>${ICON.wa} WhatsApp</a>
        ${p.stato === 'bozza' && !p.esempio ? `<button class="btn" type="button" id="pv-sent">${ICON.sent} Inviato</button>` : ''}
        ${onFirma && !p.firma && !p.esempio ? `<button class="btn" type="button" id="pv-firma" data-act="firma">${ICON.firma} Firma</button>` : ''}
      </div>
    </div></div>
    <div class="pages" id="pv-pages"><p class="msg-c">Impagino il preventivo…</p></div>`;
  $('#pv-close').onclick = () => closePreview(false);
  try {
    const bytes = await makePdf(p, a);
    if (state !== my) return;
    const blob = new Blob([bytes], { type: 'application/pdf' });
    my.url = URL.createObjectURL(blob);
    $('#pv-open').href = my.url;
    $('#pv-dl').href = my.url;
    const file = new File([blob], name, { type: 'application/pdf' });
    const share = $('#pv-share');
    let canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { canShare = false; }
    if (canShare) {
      share.hidden = false;
      $('#pv-dl').classList.remove('primary');
      share.onclick = async () => {
        // WhatsApp su iPhone a volte ignora il testo quando arriva con un file: lo copiamo anche negli appunti
        if (messaggio) { try { navigator.clipboard && navigator.clipboard.writeText(messaggio).catch(() => {}); } catch (e) {} }
        try {
          await navigator.share(messaggio ? { files: [file], title: name, text: messaggio } : { files: [file], title: name });
          if (onShared) onShared();
          if (messaggio && toast) toast('Messaggio copiato: incollalo se WhatsApp non lo mostra');
        } catch (e) { if (e && e.name !== 'AbortError' && toast) toast('Condivisione non riuscita: usa «Scarica».'); }
      };
    } else {
      $('#pv-dl').classList.add('primary');
      const wa = $('#pv-wa');
      const n = telefonoWa(telefono);
      wa.href = `https://wa.me/${n}?text=${encodeURIComponent(messaggio || '')}`;
      wa.hidden = false;
      wa.onclick = () => { if (onShared) onShared(); };
    }
    const sent = $('#pv-sent');
    if (sent) sent.onclick = () => { sent.remove(); if (onSent) onSent(); };
    const fb = $('#pv-firma');
    if (fb) fb.onclick = async () => {
      const np = await onFirma();
      if (np && state === my) { if (my.url) URL.revokeObjectURL(my.url); openPreview(np, a, opts); }
    };
    $('#pv-actions').hidden = false;
    await Promise.all([loadScript(VENDOR.worker), loadScript(VENDOR.pdfjs)]);
    if (state !== my) return;
    const doc = await window.pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const box = $('#pv-pages'); box.innerHTML = '';
    $('#pv-info').textContent = `${doc.numPages} ${doc.numPages === 1 ? 'pagina' : 'pagine'} A4 · Totale ${fmtEur(calc(p).totale)}`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      if (state !== my) return;
      const base = page.getViewport({ scale: 1 });
      const w = Math.min(box.clientWidth - 8, 820);
      const vp = page.getViewport({ scale: (w / base.width) * dpr });
      const cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      cv.style.width = w + 'px'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Pagina ' + i);
      box.appendChild(cv);
      const lbl = document.createElement('div'); lbl.className = 'pl'; lbl.textContent = `Pagina ${i} di ${doc.numPages}`; box.appendChild(lbl);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
  } catch (err) {
    console.error(err);
    if (state !== my) return;
    const ready = !!my.url;
    $('#pv-pages').innerHTML = `<p class="msg-c">${ready ? 'Il PDF è pronto, ma non riesco a mostrarne l\'anteprima. Puoi comunque aprirlo, condividerlo o scaricarlo.' : 'Non riesco a preparare il PDF. Riprova.'}</p>`;
    $('#pv-info').textContent = ready ? 'PDF pronto' : 'PDF non disponibile';
  }
}

export function buildDoc(p, a, logoB64) {
  // Stile sobrio: nero e grigi, blu solo sul TOTALE. Con una sola sezione niente righe di sezione né riepilogo.
  const C = { ink: '#1C1A17', soft: '#6B6862', rule: '#8A857C', line: '#DDD8CF', head: '#ECEAE5', blue: '#2E4A6B' };
  const c = calc(p);
  const mode = p.dettaglio || 'voci';
  const withPrices = mode === 'voci';
  const numero = p.esempio ? 'ESEMPIO' : numStr(p);
  const cl = p.cliente || {};
  const label = t => ({ text: t.toUpperCase(), fontSize: 6.8, bold: true, color: C.soft, characterSpacing: 0.8, margin: [0, 0, 0, 3] });
  const rule = (color, w, gapAbove, m) => ({ table: { widths: ['*'], body: [[{ text: ' ', fontSize: 1, margin: [0, gapAbove, 0, 0] }]] }, layout: { hLineWidth: i => (i === 1 ? w : 0), vLineWidth: () => 0, hLineColor: () => color, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }, margin: m });
  const content = [];

  // Intestazione: logo con la scritta, dati dell'impresa a destra
  const contatti = [a.telefono && `Tel. ${a.telefono}`, a.email].filter(Boolean).join('   ·   ');
  content.push({
    columns: [
      { width: 200, stack: [
        { image: 'logo', width: 176 },
        { text: 'Dal 2002, qualità e precisione', italics: true, fontSize: 8.5, color: C.soft, margin: [40, 4, 0, 0] }
      ] },
      { width: '*', alignment: 'right', fontSize: 8, color: C.soft, lineHeight: 1.3, margin: [0, 2, 0, 0], stack: [
        { text: a.ragione || '', bold: true, color: C.ink, fontSize: 9 },
        a.indirizzo || '', contatti, a.sito || '',
        [a.piva && `P.IVA e C.F. ${a.piva}`, a.rea && `REA ${a.rea}`].filter(Boolean).join('   ·   ')
      ].filter(x => x !== '') }
    ], columnGap: 16
  });
  content.push(rule(C.ink, 0.9, 0, [0, 12, 0, 12]));

  // Titolo, data e cliente
  const cliLines = [
    { text: cl.nome || '—', bold: true, fontSize: 10 },
    cl.indirizzo ? { text: cl.indirizzo, fontSize: 8.8 } : null,
    cl.cfpiva ? { text: 'C.F. / P.IVA ' + cl.cfpiva, fontSize: 8.8 } : null,
    [cl.telefono, cl.email].filter(Boolean).length ? { text: [cl.telefono, cl.email].filter(Boolean).join('   ·   '), fontSize: 8.8, color: C.soft } : null
  ].filter(Boolean);
  const right = [label('Cliente'), ...cliLines];
  if (p.cantiere) right.push({ ...label('Luogo dei lavori'), margin: [0, 8, 0, 3] }, { text: p.cantiere, fontSize: 8.8 });
  content.push({
    columns: [
      { width: '*', stack: [
        { text: p.esempio ? 'Preventivo di esempio' : `Preventivo n. ${numero}`, fontSize: 8.5, color: C.soft },
        { text: p.oggetto || 'Preventivo', bold: true, fontSize: 12, lineHeight: 1.2, margin: [0, 3, 0, 6] },
        { text: [{ text: 'Data: ', color: C.soft }, fmtDate(p.data)], fontSize: 9 }
      ] },
      { width: '*', stack: right }
    ], columnGap: 24
  });
  content.push(rule(C.ink, 0.9, 0, [0, 12, 0, 18]));

  // Voci
  const usate = p.sezioni.map((s, si) => ({
    s, cs: c.sez[si],
    voci: s.voci.map((v, vi) => ({ v, cv: c.sez[si].voci[vi] })).filter(({ v, cv }) => (v.desc || '').trim() || cv.imp)
  })).filter(x => x.voci.length);
  const multi = usate.length > 1;
  const showN = usate.reduce((t, x) => t + x.voci.length, 0) > 1;
  const qtaLabel = (v, cv) => {
    if (v.um === 'a corpo' && (!isFinite(cv.q) || cv.q === 1)) return 'A corpo';
    if (!isFinite(cv.q)) return '';
    return v.um ? `${fmtNum(cv.q)} ${v.um}` : fmtNum(cv.q);
  };
  const widths = [...(showN ? [24] : []), '*', 64, ...(withPrices ? [64, 70] : [])];
  const ncol = widths.length;
  const fill = n => Array(n).fill({});
  const headRow = (bg) => [
    ...(showN ? ['N.'] : []), 'Descrizione', 'Quantità', ...(withPrices ? ['Prezzo', 'Importo'] : [])
  ].map((t, k, arr) => ({
    text: t.toUpperCase(), fontSize: 6.8, bold: true, color: bg ? C.ink : C.soft, characterSpacing: 0.6, fillColor: bg || null,
    alignment: t === 'Descrizione' || t === 'N.' ? 'left' : t === 'Quantità' ? 'center' : 'right'
  }));
  usate.forEach(({ s, cs, voci }, k) => {
    const n = k + 1;
    const body = [];
    if (multi) {
      body.push([{ text: [{ text: n + '   ', color: C.soft }, s.titolo || 'Lavori'], colSpan: ncol, bold: true, fontSize: 9.6, fillColor: C.head }, ...fill(ncol - 1)]);
      body.push(headRow(null));
    } else {
      body.push(headRow(C.head));
    }
    const righe = d => String(d || '').split('\n').reduce((t, l) => t + Math.max(1, Math.ceil(l.length / 55)), 0);
    // Una riga più alta di circa mezza pagina deve poter andare a capo: altrimenti pdfmake non la stampa.
    const long = voci.some(({ v }) => righe(v.desc) > 35);
    const subtot = multi && mode !== 'totale';
    const rows = voci.map(({ v, cv }, j) => [
        ...(showN ? [{ text: multi ? `${n}.${j + 1}` : String(j + 1), fontSize: 7.6, color: C.soft, margin: [0, 0.8, 0, 0] }] : []),
        { text: (v.desc || '').trim(), fontSize: 9, lineHeight: 1.3 },
        { text: qtaLabel(v, cv), fontSize: 9, alignment: 'center' },
        ...(withPrices ? [
          { text: isFinite(cv.pr) ? fmtEur(cv.pr) : '', fontSize: 9, alignment: 'right' },
          { text: fmtEur(cv.imp), fontSize: 9, alignment: 'right', bold: true }
        ] : [])
      ]);
    const subRow = [{ text: `Totale ${(s.titolo || 'sezione ' + n).toLowerCase()}`, colSpan: ncol - 1, alignment: 'right', fontSize: 8.6, bold: true }, ...fill(ncol - 2), { text: fmtEur(cs.tot), alignment: 'right', fontSize: 9.2, bold: true }];
    const pad = { paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 6, paddingBottom: () => 6 };
    if (subtot && !long) {
      // Ultima voce e totale di sezione in un'unica riga non divisibile: il totale non resta mai da solo su una pagina.
      body.push(...rows.slice(0, -1));
      body.push([{ colSpan: ncol, margin: [-5, -6, -5, -6], table: { widths, body: [rows[rows.length - 1], subRow] }, layout: { ...pad, hLineWidth: i => (i === 1 ? 0.6 : 0), hLineColor: () => C.line, vLineWidth: () => 0 } }, ...fill(ncol - 1)]);
    } else {
      body.push(...rows);
      if (subtot) body.push(subRow);
    }
    const hRows = multi ? 2 : 1;
    content.push({
      table: { headerRows: hRows, keepWithHeaderRows: long ? 0 : 1, dontBreakRows: !long, widths, body },
      layout: {
        hLineWidth: (i, node) => (i === 0 ? (multi ? 0 : 0.8) : i === hRows || i === node.table.body.length ? 0.8 : (long && subtot && i === node.table.body.length - 1 ? 0.6 : 0.4)),
        hLineColor: (i, node) => (i === 0 || i === hRows || i === node.table.body.length ? C.rule : C.line),
        vLineWidth: () => 0,
        paddingLeft: () => 5, paddingRight: () => 5,
        paddingTop: ri => (ri < hRows ? 5 : 6), paddingBottom: ri => (ri < hRows ? 4 : 6)
      },
      margin: [0, 0, 0, multi ? 14 : 16]
    });
  });
  if (!usate.length) content.push({ text: 'Nessuna lavorazione inserita.', italics: true, color: C.soft, margin: [0, 0, 0, 14] });

  // Totali
  const tr = (k, v, o = {}) => [{ text: k, fontSize: 9, color: o.c || C.ink }, { text: v, fontSize: 9, alignment: 'right', bold: !!o.b, color: o.c || C.ink }];
  const rows = [];
  if (c.sconto > 0) {
    rows.push(tr('Totale lavori', fmtEur(c.lordo)));
    const sv = num(p.sconto.valore);
    rows.push(tr(p.sconto.tipo === '%' ? `Sconto ${fmtNum(sv)}%` : 'Sconto', '− ' + fmtEur(c.sconto)));
  }
  rows.push(tr('Imponibile', fmtEur(c.imponibile), { b: true }));
  rows.push(tr(c.aliq ? `IVA ${c.aliq}%` : 'IVA', c.aliq ? fmtEur(c.iva) : 'non applicata'));
  const totBlock = {
    width: 230,
    stack: [
      { table: { widths: ['*', 'auto'], body: rows }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 3, paddingBottom: () => 3 } },
      { table: { widths: ['*', 'auto'], body: [[
        { text: 'TOTALE', bold: true, fontSize: 10.5, margin: [0, 3, 0, 0] },
        { text: fmtEur(c.totale), bold: true, fontSize: 14, color: C.blue, alignment: 'right' }
      ]] }, layout: { hLineWidth: i => (i === 0 ? 1.2 : 0), hLineColor: () => C.blue, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 7, paddingBottom: () => 2 }, margin: [0, 5, 0, 0] }
    ]
  };
  let left = { width: '*', text: '' };
  if (multi && mode !== 'totale') {
    left = { width: '*', margin: [0, 0, 32, 0], stack: [
      label('Riepilogo lavori'),
      { table: { widths: [14, '*', 'auto'], body: usate.map(({ s, cs }, k) => [
        { text: String(k + 1), fontSize: 8.2, color: C.soft },
        { text: s.titolo || 'Lavori', fontSize: 8.6 },
        { text: fmtEur(cs.tot), fontSize: 8.6, alignment: 'right' }
      ]) }, layout: { hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.4), hLineColor: () => C.line, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 4, paddingTop: () => 3.5, paddingBottom: () => 3.5 } }
    ] };
  }
  content.push({ unbreakable: true, columns: [left, totBlock], margin: [0, 4, 0, 22] });

  // Condizioni (solo se compilate) e firme (se attive in Impostazioni)
  const sec = (t, txt) => ({ unbreakable: true, stack: [label(t), { text: txt, fontSize: 8.6, lineHeight: 1.35 }], margin: [0, 0, 0, 11] });
  if ((p.tempi || '').trim()) content.push(sec('Tempi di esecuzione', p.tempi.trim()));
  const pag = [(p.pagamento || '').trim(), a.iban ? 'Coordinate bancarie (IBAN): ' + a.iban : ''].filter(Boolean).join('\n');
  if (pag) content.push(sec('Modalità di pagamento', pag));
  if ((p.note || '').trim()) content.push(sec('Note ed esclusioni', p.note.trim()));
  const fc = p.firma && p.firma.png ? p.firma : null;
  if (a.firma || fc) {
    const sig = (t, sub) => ({ width: '*', stack: [label(t), { text: sub, fontSize: 8.4, color: C.soft }, rule(C.ink, 0.6, 30, [0, 0, 0, 0])] });
    const cliente = fc
      ? { width: '*', stack: [label('Per accettazione'), { text: `Firmato da ${fc.nome || 'il cliente'} il ${fmtDate(fc.data)}`, fontSize: 8.4, color: C.soft }, { image: fc.png, fit: [170, 46], margin: [0, 2, 0, 0] }, rule(C.ink, 0.6, 0, [0, 0, 0, 0])] }
      : sig('Per accettazione', 'Il cliente (data e firma)');
    content.push({ unbreakable: true, margin: [0, 18, 0, 0], columns: [sig('Per l\'impresa', a.ragione || ''), cliente], columnGap: 40 });
  }

  const footerText = [a.ragione, a.indirizzo, a.piva && 'P.IVA ' + a.piva, a.telefono].filter(Boolean).join('  ·  ');
  return {
    pageSize: 'A4',
    pageMargins: [40, 58, 40, 54],
    info: { title: `Preventivo ${numero}${cl.nome ? ' - ' + cl.nome : ''}`, author: a.ragione || '', subject: p.oggetto || '' },
    images: { logo: 'data:image/png;base64,' + logoB64 },
    defaultStyle: { font: 'Inter', fontSize: 9, color: C.ink, lineHeight: 1.2 },
    header: cur => (cur === 1 ? { text: '' } : {
      margin: [40, 22, 40, 0],
      columns: [
        { image: 'logo', width: 92 },
        { width: '*', alignment: 'right', margin: [0, 7, 0, 0], fontSize: 7.6, color: C.soft, text: [{ text: 'Preventivo ' + numero, bold: true, color: C.ink }, `  ·  ${fmtDate(p.data)}${cl.nome ? '  ·  ' + cl.nome : ''}`] }
      ]
    }),
    footer: (cur, total) => ({
      margin: [40, 16, 40, 0],
      stack: [
        rule(C.line, 0.5, 0, [0, 0, 0, 0]),
        { columns: [{ text: footerText, fontSize: 6.8, color: C.soft }, { text: `Pagina ${cur} di ${total}`, width: 80, fontSize: 6.8, color: C.soft, alignment: 'right' }], margin: [0, 6, 0, 0] }
      ]
    }),
    content
  };
}
