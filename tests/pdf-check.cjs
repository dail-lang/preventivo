// Controllo del PDF dei preventivi.
// Uso: node test/pdf-check.cjs   (da nazifoski-preventivi/)
// Richiede: Playwright con Chromium, poppler-utils (pdftotext, pdfinfo), accesso a registry.npmjs.org la prima volta.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIBS = path.join(__dirname, '.libs'); // non più usata: le librerie sono in vendor/
const OUT = path.join(__dirname, 'out');
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

function ensureLibs() { return {}; }

let failures = 0;
// Le etichette maiuscole hanno spaziatura tra le lettere: pdftotext le restituisce con spazi in mezzo.
// Per questo i confronti sul testo ignorano tutti gli spazi.
const flat = s => s.replace(/\s+/g, '');
const has = (text, needle, ci) => ci ? flat(text).toLowerCase().includes(flat(needle).toLowerCase()) : flat(text).includes(flat(needle));
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  — ' + detail}`);
  if (!ok) failures++;
}

async function makePdf(browser, libs, p, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'app.test') return r.abort();
    const file = path.join(ROOT, u.pathname.replace(/^\/+/, '') || 'index.html');
    if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
    return r.fulfill({ path: file, contentType: types[path.extname(file)] || 'application/octet-stream' });
  });
  await page.addInitScript(seed => {
    window.NZ_TEST_SEED = seed;
    let pm;
    Object.defineProperty(window, 'pdfMake', { configurable: true, get() { return pm; }, set(v) { pm = v; const orig = v.createPdf.bind(v); v.createPdf = (dd, ...rest) => { window.__args = [dd, ...rest]; return orig(dd, ...rest); }; } });
  }, { user: { email: 'impresaedilenazifoski@gmail.com' }, preventivi: [p], listino: [], clienti: [] });
  await page.goto('https://app.test/index.html?test=1');
  await page.click(`[data-open="${p.id}"]`);
  const totale = (await page.textContent('#t-tot')).trim();
  await page.click('.ed-actions [data-act="preview"]');
  await page.waitForFunction(() => window.__args, null, { timeout: 30000 });
  const b64 = await page.evaluate(() => new Promise(res => window.pdfMake.createPdf(...window.__args).getBase64(res)));
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, p.id + '.pdf');
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  let extra = {};
  if (opts.buttons) {
    await page.waitForSelector('#pv-pages canvas', { timeout: 30000 });
    extra.shareVisible = await page.isVisible('#pv-share');
    extra.openHref = await page.getAttribute('#pv-open', 'href');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pv-dl')]);
    const dlFile = path.join(OUT, 'scaricato.pdf');
    await dl.saveAs(dlFile);
    extra.dlName = dl.suggestedFilename();
    extra.dlInfo = execFileSync('pdfinfo', [dlFile], { encoding: 'utf8' });
    extra.canvases = await page.$$eval('#pv-pages canvas', c => c.length);
  }
  await ctx.close();
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8' }))[1]);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const pageText = i => execFileSync('pdftotext', ['-layout', '-f', String(i), '-l', String(i), file, '-'], { encoding: 'utf8' });
  return { totale, pages, text, pageText, errors, ...extra };
}

(async () => {
  const libs = ensureLibs();
  const browser = await chromium.launch();
  const TAG = 'Dal 2002, qualità e precisione';

  // Casi costruiti dagli altri: descrizione più lunga di una pagina, elenco puntato lungo.
  const frase = 'Rifacimento completo con demolizione, smaltimento, massetti, impianti, posa e finiture a regola d\'arte. ';
  fixtures.lungo = { ...fixtures.acorpo, id: 'lungo', sezioni: [{ id: 's1', titolo: 'Ristrutturazione bagno', voci: [{ ...fixtures.acorpo.sezioni[0].voci[0], desc: frase.repeat(60) + 'FINE-DESCRIZIONE-LUNGA' }] }] };
  const elenco = Array.from({ length: 60 }, (_, i) => `- lavorazione numero ${i + 1}`).join('\n') + '\nFINE-ELENCO';
  const app2 = JSON.parse(JSON.stringify(fixtures.appartamento));
  app2.id = 'linee'; app2.sezioni[2].voci[0].desc = elenco;
  fixtures.linee = app2;

  // costi interni su alcune voci: non devono mai finire nel PDF
  fixtures.appartamento.sezioni.forEach(s => s.voci.forEach((v, i) => { if (i % 2 === 0) v.costo = '7777,77'; }));

  for (const name of ['acorpo', 'appartamento', 'totale', 'lungo', 'linee']) {
    const p = fixtures[name];
    const r = await makePdf(browser, libs, p, { buttons: name === 'acorpo' });
    console.log(`\n# ${name}: ${r.pages} pagine, totale ${r.totale}`);
    check(`${name}: nessun errore nella pagina`, r.errors.length === 0, r.errors.join('; '));
    check(`${name}: scritta "${TAG}"`, has(r.text, TAG));
    check(`${name}: TOTALE uguale al calcolo (${r.totale})`, flat(r.text).includes('TOTALE') && new RegExp('TOTALE.{0,40}' + flat(r.totale).replace(/[.€]/g, m => '\\' + m)).test(flat(r.text)));

    if (name === 'acorpo') {
      check('pulsanti: «Condividi» nascosto dove il browser non condivide file', r.shareVisible === false);
      check('pulsanti: «Apri» punta al PDF', /^blob:/.test(r.openHref || ''), r.openHref);
      check('pulsanti: «Scarica» salva un PDF valido', /Pages:\s+1/.test(r.dlInfo || ''), r.dlInfo);
      check('pulsanti: nome del file', r.dlName === 'Preventivo 2026-007 Cliente di prova.pdf', r.dlName);
      check('anteprima: pagina disegnata', r.canvases === 1, r.canvases);
      check('acorpo: una pagina', r.pages === 1, r.pages + ' pagine');
      check('acorpo: "A corpo" nella quantità', has(r.text, 'A corpo'));
      for (const s of ['€ 4.273,00', '€ 427,30', '€ 4.700,30']) check(`acorpo: contiene ${s}`, has(r.text, s));
      check('acorpo: niente riepilogo', !has(r.text, 'riepilogo', true));
      check('acorpo: niente totale di sezione', !has(r.text, 'Totale ristrutturazione', true));
      check('acorpo: niente numero voce 1.1', !/\b1\.1\b/.test(r.text));
      check('acorpo: niente firme', !has(r.text, 'per accettazione', true));
    }
    if (name === 'appartamento') {
      check('appartamento: almeno 2 pagine', r.pages >= 2, r.pages + ' pagine');
      for (const s of p.sezioni) check(`appartamento: sezione ${s.titolo}`, has(r.text, s.titolo, true));
      check('appartamento: riepilogo', has(r.text, 'riepilogo', true));
      check('appartamento: sconto 5%', has(r.text, 'Sconto 5%'));
      check('appartamento: numero voce 1.1', /\b1\.1\b/.test(r.text));
      check('appartamento: niente costi né margine nel PDF', !has(r.text, 'costo', true) && !has(r.text, 'margine', true) && !has(r.text, '7.777,77') && !has(r.text, '7777'));
      for (let i = 1; i <= r.pages; i++) {
        const t = r.pageText(i);
        if (/^\s*\d+\.\d+\s/m.test(t)) check(`appartamento: intestazione tabella a pagina ${i}`, has(t, 'DESCRIZIONE'));
      }
    }
    if (name === 'lungo') check('lungo: la descrizione arriva fino in fondo', has(r.text, 'FINE-DESCRIZIONE-LUNGA'));
    if (name === 'linee') {
      check('linee: l\'elenco arriva fino in fondo', has(r.text, 'FINE-ELENCO'));
    }
    if (name === 'appartamento') {
      for (let i = 1; i <= r.pages; i++) {
        const t = r.pageText(i);
        const orphan = p.sezioni.some(s => has(t, 'Totale ' + s.titolo, true)) && !/^\s*\d+\.\d+\s/m.test(t);
        check(`appartamento: pagina ${i} non ha un totale di sezione senza voci`, !orphan);
      }
    }
    if (name === 'totale') {
      const euros = (r.text.match(/€/g) || []).length;
      check('totale: prezzi solo nel blocco dei totali (≤ 5 €)', euros <= 5, euros + ' simboli €');
    }
  }
  await browser.close();
  console.log(failures ? `\n${failures} controlli falliti` : '\nTutti i controlli superati');
  process.exit(failures ? 1 : 0);
})();
