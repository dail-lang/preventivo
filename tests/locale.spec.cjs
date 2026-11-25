// Prove della modalità «solo su questo telefono» (nessuna configurazione Firebase): dati nel dispositivo.
// Uso: node tests/locale.spec.cjs   (da nazifoski-app/)
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
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
  const cfg = fs.readFileSync(path.join(ROOT, 'firebase-config.js'), 'utf8');
  if (!/firebaseConfig = null/.test(cfg)) { console.log('firebase-config.js è compilato: prova saltata'); process.exit(0); }
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));

  await page.goto(base);
  await page.waitForSelector('#main .head h1', { timeout: 10000 }).catch(() => {});
  check('senza Firebase: si apre direttamente, senza accesso', await page.isVisible('h1:has-text("Preventivi")') && !(await page.isVisible('#login')) && !(await page.isVisible('#setup')));
  check('senza Firebase: dice che i dati sono solo su questo telefono', await page.isVisible('text=solo su questo telefono'));

  // crea un preventivo
  await page.click('[data-act="new"]');
  await page.fill('#f-cnome', 'Cliente sul telefono');
  await page.fill('#sezioni textarea', 'Rasatura');
  await page.fill('#sezioni [data-v="qta"]', '20');
  await page.fill('#sezioni [data-v="prezzo"]', '16');
  await page.waitForTimeout(900);
  await page.click('[data-act="back"]');
  await page.waitForTimeout(300);

  // importa il listino dal file
  await page.click('#bottomnav [data-view="impostazioni"]');
  check('impostazioni: niente «Persone autorizzate» né «Esci»', !(await page.isVisible('text=Persone autorizzate')) && !(await page.isVisible('[data-act="logout"]')));
  const dati = { formato: 'nazifoski-dati', preventivi: [], clienti: [], listino: [{ id: 'l01', categoria: 'Tinteggiatura', desc: 'Tinteggiatura due mani', um: 'mq', prezzo: 8 }], azienda: { ragione: 'Impresa Edile Nazifoski', firma: true } };
  await page.setInputFiles('#imp-file', { name: 'nazifoski-dati.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dati)) });
  await page.waitForTimeout(500);

  // ricarica: i dati restano
  await page.reload();
  await page.waitForSelector('[data-open]', { timeout: 10000 }).catch(() => {});
  check('dopo la riapertura il preventivo c\'è ancora', await page.isVisible('text=Cliente sul telefono'));
  check('dopo la riapertura il totale è giusto (20 × 16 + IVA 10%)', (await page.textContent('.row .amt').catch(() => '')).includes('€ 352,00'));
  await page.click('#bottomnav [data-view="listino"]');
  check('dopo la riapertura il listino importato c\'è', await page.isVisible('text=Tinteggiatura due mani'));
  await page.click('#bottomnav [data-view="impostazioni"]');
  check('le impostazioni importate restano (firme)', await page.isChecked('#s-firma'));

  // copia di sicurezza
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('[data-act="backup"]').catch(() => {})]);
  let backup = null;
  if (dl) { const f = path.join(__dirname, 'out', 'backup.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); await dl.saveAs(f); backup = JSON.parse(fs.readFileSync(f, 'utf8')); }
  check('copia di sicurezza: file scaricato', !!backup);
  check('copia di sicurezza: contiene preventivo, listino e impostazioni', backup && backup.preventivi.length === 1 && backup.listino.length === 1 && backup.azienda && backup.azienda.firma === true);
  check('copia di sicurezza: nome con la data', dl && /^nazifoski-dati-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());

  check('nessun errore', errors.length === 0, errors.join(' | '));
  await browser.close(); srv.close();
  console.log(failures ? `\n${failures} controlli falliti` : '\nTutti i controlli superati');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
