// Prova completa con Firebase vero in versione locale (emulatori Auth + Firestore e le regole di firestore.rules).
// Uso: npm run test:e2e   (avvia gli emulatori, serve l'app su 127.0.0.1 e usa le librerie Firebase di node_modules).
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FB = path.join(ROOT, 'node_modules/firebase');
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-nazifoski';
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

async function account(email, password, verified) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const j = await r.json();
  if (verified) await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: JSON.stringify({ localId: j.localId, emailVerified: true }) });
  return j.localId;
}

async function device(browser, base, name) {
  const ctx = await browser.newContext({ ...devices[name], serviceWorkers: 'block' });
  await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ path: path.join(FB, path.basename(new URL(r.request().url()).pathname)), contentType: 'text/javascript' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'index.html?emu=127.0.0.1');
  return { ctx, page, errors };
}
async function login(page, email, pw) {
  await page.waitForSelector('#l-email', { timeout: 15000 });
  await page.fill('#l-email', email); await page.fill('#l-pw', pw);
  await page.click('#l-form button[type="submit"]');
}

(async () => {
  await account('impresaedilenazifoski@gmail.com', 'segreto123', true);
  await account('moglie@example.com', 'segreto456', true);
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();

  // Titolare sul telefono
  const tel = await device(browser, base, 'iPhone 13');
  await login(tel.page, 'impresaedilenazifoski@gmail.com', 'segreto123');
  await tel.page.waitForSelector('#main .head h1', { timeout: 15000 }).catch(() => {});
  check('titolare: entra con email e password', await tel.page.isVisible('h1:has-text("Preventivi")'));
  await tel.page.click('[data-act="new"]');
  await tel.page.fill('#f-cnome', 'Cliente Firestore');
  await tel.page.fill('#sezioni textarea', 'Tinteggiatura');
  await tel.page.fill('#sezioni [data-v="qta"]', '10');
  await tel.page.fill('#sezioni [data-v="prezzo"]', '8');
  await tel.page.waitForTimeout(1200);
  await tel.page.click('[data-act="back"]');
  await tel.page.waitForTimeout(800);
  check('titolare: il preventivo compare in elenco', (await tel.page.$$('[data-open]')).length === 1);

  // Titolare sul computer: vede lo stesso preventivo
  const pc = await device(browser, base, 'Desktop Chrome');
  await login(pc.page, 'impresaedilenazifoski@gmail.com', 'segreto123');
  await pc.page.waitForSelector('[data-open]', { timeout: 15000 }).catch(() => {});
  check('sincronizzazione: il computer vede il preventivo del telefono', await pc.page.isVisible('text=Cliente Firestore'));
  check('sincronizzazione: totale € 88,00', (await pc.page.textContent('.row .amt').catch(() => '')).includes('€ 88,00'));

  // Familiare non ancora autorizzato
  const fam = await device(browser, base, 'Pixel 7');
  await login(fam.page, 'moglie@example.com', 'segreto456');
  await fam.page.waitForSelector('#attesa', { timeout: 15000 }).catch(() => {});
  check('familiare: prima dell\'autorizzazione vede «Accesso in attesa»', await fam.page.isVisible('#attesa'));
  check('familiare: nessun preventivo visibile', !(await fam.page.isVisible('text=Cliente Firestore')));

  // Il titolare lo autorizza
  await pc.page.click('[data-view="impostazioni"]:visible');
  await pc.page.fill('#pa-email', 'moglie@example.com');
  await pc.page.click('[data-act="paAdd"]');
  await pc.page.waitForTimeout(800);
  await fam.page.click('#w-retry');
  await fam.page.waitForSelector('[data-open]', { timeout: 15000 }).catch(() => {});
  check('familiare: dopo l\'autorizzazione vede i preventivi', await fam.page.isVisible('text=Cliente Firestore'));
  await fam.page.click('#bottomnav [data-view="impostazioni"]');
  check('familiare: non può gestire le persone autorizzate', !(await fam.page.isVisible('text=Persone autorizzate')));

  // Senza rete sul telefono: la modifica resta e parte al ritorno della rete
  await tel.ctx.setOffline(true);
  await tel.page.waitForTimeout(300);
  check('offline: avviso «Offline» in testata', await tel.page.isVisible('#sync:has-text("Offline")'));
  await tel.page.click('[data-open]');
  await tel.page.fill('#f-ogg', 'Modifica fatta senza rete');
  await tel.page.waitForTimeout(1000);
  await tel.page.click('[data-act="back"]');
  check('offline: la modifica si vede subito sul telefono', await tel.page.isVisible('text=Modifica fatta senza rete'));
  check('offline: il computer non la vede ancora', !(await pc.page.isVisible('text=Modifica fatta senza rete')));
  await tel.ctx.setOffline(false);
  await pc.page.click('[data-view="lista"]:visible');
  await pc.page.waitForSelector('text=Modifica fatta senza rete', { timeout: 20000 }).catch(() => {});
  check('offline: al ritorno della rete arriva al computer', await pc.page.isVisible('text=Modifica fatta senza rete'));


  // Modifica fatta su un altro dispositivo mentre il preventivo è aperto
  await tel.page.click('[data-open]');
  await pc.page.click('[data-view="lista"]:visible');
  await pc.page.click('[data-open]');
  await pc.page.waitForSelector('#f-ogg');
  await tel.page.fill('#f-ogg', 'Cambiato dal telefono');
  await tel.page.waitForTimeout(1500);
  await pc.page.waitForFunction(() => document.querySelector('#f-ogg')?.value === 'Cambiato dal telefono', null, { timeout: 10000 }).catch(() => {});
  check('altro dispositivo: l\'editor aperto si aggiorna da solo', (await pc.page.inputValue('#f-ogg')) === 'Cambiato dal telefono');
  await tel.page.click('[data-act="back"]');

  // Preventivo eliminato su un altro dispositivo mentre è aperto: non deve ricomparire
  await tel.page.click('[data-open]');
  await tel.page.click('.ed-actions [data-act="del"]');
  await tel.page.click('[data-close="ok"]');
  await pc.page.waitForSelector('#gone', { timeout: 10000 }).catch(() => {});
  check('eliminato altrove: avviso nell\'editor aperto', await pc.page.isVisible('#gone'));
  await pc.page.fill('#f-ogg', 'Scritto dopo l\'eliminazione').catch(() => {});
  await pc.page.waitForTimeout(1500);
  await tel.page.waitForTimeout(500);
  check('eliminato altrove: non ricompare scrivendo', (await tel.page.$$('[data-open]')).length === 0);

  // «Esci» su un dispositivo condiviso: nessun dato resta nel browser
  await pc.page.click('[data-view="impostazioni"]:visible');
  await pc.page.click('[data-act="logout"]');
  await pc.page.waitForSelector('#login', { timeout: 15000 }).catch(() => {});
  await pc.page.waitForTimeout(1000);
  const dbs = await pc.page.evaluate(async () => (await indexedDB.databases()).map(d => d.name).filter(n => /firestore/i.test(n || '')));
  check('esci: niente dati salvati nel browser', dbs.length === 0, JSON.stringify(dbs));


  // Dati creati «solo su questo telefono» e poi trasferiti online dopo il collegamento a Firebase
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ path: path.join(FB, path.basename(new URL(r.request().url()).pathname)), contentType: 'text/javascript' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + 'index.html');
    await page.waitForSelector('[data-act="new"]', { timeout: 15000 });
    await page.click('[data-act="new"]');
    await page.fill('#f-cnome', 'Cliente dal telefono locale');
    await page.fill('#sezioni textarea', 'Rasatura');
    await page.fill('#sezioni [data-v="qta"]', '5');
    await page.fill('#sezioni [data-v="prezzo"]', '16');
    await page.waitForTimeout(900);
    await page.click('[data-act="back"]');
    await page.waitForTimeout(500);
    await page.goto(base + 'index.html?emu=127.0.0.1');
    await login(page, 'impresaedilenazifoski@gmail.com', 'segreto123');
    await page.waitForSelector('#trasferisci', { timeout: 15000 }).catch(() => {});
    check('trasferimento: dopo l\'accesso propone di trasferire i dati del telefono', await page.isVisible('#trasferisci'));
    await page.click('[data-act="trasferisci"]').catch(() => {});
    await tel.page.waitForSelector('text=Cliente dal telefono locale', { timeout: 15000 }).catch(() => {});
    check('trasferimento: il preventivo arriva sugli altri dispositivi', await tel.page.isVisible('text=Cliente dal telefono locale'));
    await page.reload();
    await page.waitForSelector('[data-open]', { timeout: 15000 }).catch(() => {});
    check('trasferimento: l\'avviso non ricompare', !(await page.isVisible('#trasferisci')));
    check('trasferimento: nessun errore', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // Nuovo account con email da confermare
  const nuovo = await device(browser, base, 'Pixel 7');
  await nuovo.page.waitForSelector('#l-mode');
  await nuovo.page.click('#l-mode');
  await login(nuovo.page, 'figlio@example.com', 'segreto789');
  await nuovo.page.waitForSelector('#verifica', { timeout: 15000 }).catch(() => {});
  check('nuovo account: chiede di confermare l\'email', await nuovo.page.isVisible('#verifica'));

  for (const d of [tel, pc, fam, nuovo]) check(`nessun errore nella pagina (${d === tel ? 'telefono' : d === pc ? 'computer' : d === fam ? 'familiare' : 'nuovo'})`, d.errors.length === 0, d.errors.join(' | '));
  await browser.close(); srv.close();
  console.log(failures ? `\n${failures} controlli falliti` : '\nTutti i controlli superati');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
