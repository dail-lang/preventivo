// Crea PDF di prova che imitano i preventivi fatti con Canva (modello «Gelateria Riccione»), con dati inventati.
// Uso: node tests/genera-pdf-prova.cjs   → tests/pdf-prova/*.pdf
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const OUT = path.join(__dirname, 'pdf-prova');
fs.mkdirSync(OUT, { recursive: true });
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'img', 'logo.png')).toString('base64');

const PROVE = {
  'bagno-a-corpo': {
    titolo: 'Preventivo per lavori di ristrutturazione del bagno', cliente: ['Bar Esempio'], data: '12/02/2026',
    righe: [['Ristrutturazione bagno comprensiva di demolizione e smaltimento dei materiali di risulta, realizzazione parete in cartongesso, rifacimento massetto, assistenza a idraulico, elettricista e plastichino, posa pavimento e finiture finali.<br>I materiali necessari (pavimenti, collanti, stucchi, ecc.) saranno forniti dal Cliente.', 'A corpo', '4.273,00€', '4.273,00€']],
    sub: '€ 4.273,00', iva: '€ 427,30', tot: '€ 4.700,30'
  },
  'appartamento': {
    titolo: 'Preventivo per lavori di ristrutturazione appartamento', cliente: ['Mario Rossi', 'Via Roma 1, Rimini'], data: '03/09/2025',
    righe: [
      ['Demolizione pavimenti e rivestimenti esistenti', '45 mq', '18,00€', '810,00€'],
      ['Tinteggiatura pareti e soffitti con idropittura traspirante, due mani', '120 mq', '8,00€', '960,00€'],
      ['Posa pavimento in gres porcellanato 60x60, collante incluso', '45 mq', '32,00€', '1.440,00€']
    ],
    sub: '€ 3.210,00', iva: '€ 321,00', tot: '€ 3.531,00'
  },
  'facciata-iva22': {
    titolo: 'Preventivo per rifacimento facciata', cliente: ['Condominio Le Vele', 'Viale Dante 10, Riccione'], data: '20/01/2026',
    righe: [['Rifacimento facciata condominio con ponteggio, rasatura e tinteggiatura', 'A corpo', '10.000,00€', '10.000,00€']],
    sub: '€ 10.000,00', iva: '€ 2.200,00', tot: '€ 12.200,00'
  },
  'conti-sbagliati': {
    titolo: 'Preventivo per tinteggiatura', cliente: ['Anna Bianchi'], data: '15/10/2025',
    righe: [['Tinteggiatura soggiorno', '40 mq', '8,00€', '320,00€']],
    sub: '€ 320,00', iva: '€ 32,00', tot: '€ 362,00'
  }
};

const html = p => `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0 }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #111; margin: 0; padding: 40px 60px; font-size: 13px; }
  .hdr { display: flex; justify-content: space-between; align-items: center; }
  .hdr img { width: 230px; } .hdr .r { text-align: right; line-height: 1.5; }
  hr { border: 0; border-top: 1.5px solid #111; margin: 18px 0; }
  .meta { display: flex; justify-content: space-between; } .meta .l { width: 55%; } .meta b { display: block; }
  table { width: 100%; border-collapse: collapse; margin-top: 60px; }
  th { background: #c8c8c8; border: 1px solid #111; padding: 8px; font-size: 14px; }
  td { border: 1px solid #111; padding: 8px; vertical-align: middle; text-align: center; font-size: 14px; }
  td:first-child { text-align: left; width: 38%; }
  .tot { margin: 40px 0 0 auto; width: 250px; } .tot div { display: flex; justify-content: space-between; padding: 3px 0; }
  .tot .t { border-top: 1px solid #224; font-weight: bold; padding-top: 8px; margin-top: 6px; }
</style></head><body>
  <div class="hdr"><img src="${logo}"><div class="r">Via Villagrande 24, Rimini<br>Tel: +39 352 203 7037<br>Partita IVA: 03286630409<br>Mail: info@nazifoski.it</div></div>
  <hr>
  <div class="meta"><div class="l"><b>${p.titolo}</b><br><br>Data: ${p.data}</div><div class="r"><b>CLIENTE:</b><br>${p.cliente.join('<br>')}</div></div>
  <hr>
  <table><tr><th>Descrizione</th><th>Quantità</th><th>Prezzo</th><th>Totale</th></tr>
  ${p.righe.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table>
  <div class="tot"><div><b>SUBTOTALE:</b><span>${p.sub}</span></div><div><b>IVA:</b><span>${p.iva}</span></div><div class="t"><span>TOTALE:</span><span>${p.tot}</span></div></div>
</body></html>`;

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage();
  for (const [name, p] of Object.entries(PROVE)) {
    await page.setContent(html(p));
    await page.pdf({ path: path.join(OUT, name + '.pdf'), format: 'A4', printBackground: true });
  }
  // PDF senza testo (come una foto o una scansione)
  await page.setContent(html(PROVE['bagno-a-corpo']));
  const png = await page.screenshot({ fullPage: true });
  await page.setContent(`<!doctype html><html><body style="margin:0"><img style="width:100%" src="data:image/png;base64,${png.toString('base64')}"></body></html>`);
  await page.pdf({ path: path.join(OUT, 'scansione.pdf'), format: 'A4' });
  await b.close();
  console.log('PDF di prova creati in', OUT);
})();
