// Prova dell'importazione dei preventivi vecchi da PDF, dentro l'app (modalità «solo su questo telefono»).
// Uso: node tests/importpdf.spec.cjs   (da nazifoski-app/; prima: node tests/genera-pdf-prova.cjs)
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROVE = path.join(__dirname, 'pdf-prova');
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  — ' + detail}`); if (!ok) failures++; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  await page.waitForSelector('[data-act="new"]', { timeout: 10000 });
  await page.click('#bottomnav [data-view="impostazioni"]');
  check('impostazioni: c\'è «Importa preventivi da PDF»', await page.isVisible('text=Importa preventivi da PDF'));
  const files = ['bagno-a-corpo', 'appartamento', 'facciata-iva22', 'conti-sbagliati', 'scansione'].map(n => path.join(PROVE, n + '.pdf'));
  await page.setInputFiles('#pdf-file', files).catch(e => errors.push(e.message));
  await page.waitForSelector('#ri', { timeout: 30000 }).catch(() => {});

  // 1: il più vecchio per data (appartamento, 03/09/2025)
  check('revisione: si apre la scheda del primo PDF', await page.isVisible('#ri'));
  check('revisione: in ordine di data (prima l\'appartamento)', (await page.inputValue('#ri-nome').catch(() => '')) === 'Mario Rossi');
  check('revisione: indirizzo e data letti', (await page.inputValue('#ri-ind').catch(() => '')) === 'Via Roma 1, Rimini' && (await page.inputValue('#ri-data').catch(() => '')) === '2025-09-03');
  check('revisione: tre voci', (await page.$$('#ri .ri-voce')).length === 3);
  check('revisione: totale controllato ✓', (await page.textContent('#ri-tot').catch(() => '')).includes('€ 3.531,00') && await page.isVisible('#ri-tot.ok'));
  await page.screenshot({ path: path.join(__dirname, 'out', 'iphone13-importa-pdf.png') });
  // correzione a mano prima di salvare
  await page.fill('#ri-ogg', 'Ristrutturazione appartamento via Roma');
  await page.click('#ri-salva');

  // 2: conti sbagliati → avviso, lo salto
  await page.waitForSelector('#ri-avvisi', { timeout: 10000 }).catch(() => {});
  check('conti sbagliati: avviso visibile', (await page.textContent('#ri-avvisi').catch(() => '')).toLowerCase().includes('totale'));
  check('conti sbagliati: totale segnato come da controllare', await page.isVisible('#ri-tot.bad'));
  await page.click('#ri-salta');

  // 3: facciata IVA 22, 4: bagno a corpo
  await page.waitForTimeout(200);
  check('facciata: IVA 22%', (await page.inputValue('#ri-iva').catch(() => '')) === '22');
  await page.selectOption('#ri-stato', 'accettato');
  await page.click('#ri-salva');
  await page.waitForTimeout(200);
  check('bagno: una voce a corpo', (await page.$$('#ri .ri-voce')).length === 1 && (await page.inputValue('#ri .ri-voce [data-k="um"]').catch(() => '')) === 'a corpo');
  await page.click('#ri-salva');

  // 5: scansione senza testo
  await page.waitForTimeout(200);
  check('scansione: spiega che va inserita a mano', (await page.textContent('#ri').catch(() => '')).includes('non contiene testo'));
  await page.click('#ri-salta');
  await page.waitForTimeout(300);
  check('alla fine la revisione si chiude', !(await page.isVisible('#ri')));

  // Risultati
  await page.click('#bottomnav [data-view="lista"]');
  const rows = await page.$$eval('[data-open]', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
  check('elenco: tre preventivi importati', rows.length === 3, rows.join(' | '));
  const has = (txt, num) => rows.some(r => r.includes(txt) && r.includes(num));
  check('numeri in ordine di data: 2025/001 appartamento', has('Mario Rossi', '2025/001'));
  check('numeri in ordine di data: 2026/001 facciata, 2026/002 bagno', has('Condominio Le Vele', '2026/001') && has('Bar Esempio', '2026/002'));
  check('stato scelto in revisione (accettato)', rows.some(r => r.includes('Condominio Le Vele') && r.includes('Accettato')));
  check('correzione fatta in revisione salvata', rows.some(r => r.includes('Ristrutturazione appartamento via Roma')));
  check('totale del preventivo importato', rows.some(r => r.includes('Mario Rossi') && r.includes('€ 3.531,00')));
  await page.click('#bottomnav [data-view="listino"]');
  check('listino: voce con prezzo e categoria', await page.isVisible('.cat:has-text("Demolizioni e rimozioni")') && await page.isVisible('.li:has-text("Demolizione pavimenti e rivestimenti esistenti") .p:has-text("€ 18,00")'));
  check('listino: voce del preventivo saltato non aggiunta', !(await page.isVisible('text=Tinteggiatura soggiorno')));
  await page.click('#bottomnav [data-view="clienti"]');
  check('rubrica: clienti aggiunti', await page.isVisible('text=Mario Rossi') && await page.isVisible('text=Condominio Le Vele') && !(await page.isVisible('text=Anna Bianchi')));
  // Riapro e uso come base
  await page.click('#bottomnav [data-view="lista"]');
  await page.click('[data-open]:has-text("Bar Esempio")');
  check('riaperto: descrizione completa e totale', (await page.inputValue('#sezioni textarea')).includes('forniti dal Cliente.') && (await page.textContent('#t-tot')).includes('€ 4.700,30'));
  check('nessun errore', errors.length === 0, errors.join(' | '));
  await browser.close(); srv.close();
  console.log(failures ? `\n${failures} controlli falliti` : '\nTutti i controlli superati');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
