// Prove dell'app installabile: manifest, icone, funzionamento senza rete, invito all'installazione.
// Uso: node tests/pwa.spec.cjs   (da nazifoski-app/). Usa un piccolo server locale (il service worker vuole http://localhost).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const os = require('os');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  — ' + detail}`); if (!ok) failures++; };
const pngSize = file => { const b = fs.readFileSync(file); return b.toString('ascii', 1, 4) === 'PNG' ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : null; };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
function serve(root = ROOT) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(file).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const fbRoute = ctx => ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ path: path.join(ROOT, 'node_modules/firebase', path.basename(new URL(r.request().url()).pathname)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
const swReady = page => page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => 'ready'), new Promise(r => setTimeout(() => r('timeout'), 10000))]));
const seed = { user: { email: 'impresaedilenazifoski@gmail.com' }, preventivi: [fx.acorpo], listino: [], clienti: [] };

(async () => {
  // 1. Manifest e icone
  let m = null;
  try { m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8')); } catch (e) { check('manifest: leggibile', false, e.message); }
  if (m) {
    check('manifest: nome', m.name === 'Nazifoski Preventivi' && m.short_name === 'Nazifoski');
    check('manifest: a tutto schermo', m.display === 'standalone');
    check('manifest: indirizzi relativi', m.start_url === './' && m.scope === './');
    check('manifest: colori', m.theme_color === '#2E4A6B' && m.background_color === '#F4F2ED');
    check('manifest: lingua', m.lang === 'it');
    for (const want of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
      const ic = (m.icons || []).find(i => i.sizes === want[0] && (i.purpose || 'any').split(' ').includes(want[1]));
      check(`manifest: icona ${want[0]} ${want[1]}`, !!ic && pngSize(path.join(ROOT, ic.src)) === want[0], ic && pngSize(path.join(ROOT, ic.src)));
    }
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('icona Apple 180x180', /apple-touch-icon" href="icons\/apple-touch-icon.png"/.test(html) && pngSize(path.join(ROOT, 'icons/apple-touch-icon.png')) === '180x180');
  check('favicon 32x32', fs.existsSync(path.join(ROOT, 'icons/favicon-32.png')) && pngSize(path.join(ROOT, 'icons/favicon-32.png')) === '32x32');

  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();

  // 2. Senza rete dopo la prima visita
  {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    await fbRoute(ctx);
    await ctx.addInitScript(s => { window.NZ_TEST_SEED = s; }, seed);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + 'index.html?test=1');
    const ok = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'no-sw';
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 8000))]);
      return reg ? 'ready' : 'timeout';
    });
    check('offline: service worker attivo', ok === 'ready', ok);
    await page.waitForTimeout(500);
    await ctx.setOffline(true);
    await page.reload().catch(e => errors.push('reload: ' + e.message));
    await page.waitForSelector('[data-open]', { timeout: 8000 }).catch(() => {});
    check('offline: l\'app si apre senza rete', await page.isVisible('[data-open="acorpo"]'));
    await page.click('[data-open="acorpo"]').catch(() => {});
    await page.click('.totbar [data-act="preview"]').catch(() => {});
    await page.waitForSelector('#pv-pages canvas', { timeout: 20000 }).catch(() => {});
    check('offline: anche il PDF funziona senza rete', await page.isVisible('#pv-pages canvas'));
    check('offline: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 3. Invito all'installazione su iPhone (nel browser) e assente quando l'app è installata
  for (const standalone of [false, true]) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await ctx.addInitScript(([s, st]) => { window.NZ_TEST_SEED = s; if (st) Object.defineProperty(navigator, 'standalone', { value: true }); }, [seed, standalone]);
    const page = await ctx.newPage();
    await page.goto(base + 'index.html?test=1');
    await page.waitForSelector('[data-open]', { timeout: 8000 }).catch(() => {});
    const vis = await page.isVisible('#install');
    check(standalone ? 'installata: nessun invito' : 'iPhone nel browser: invito a installare', standalone ? !vis : vis);
    if (!standalone) {
      await page.click('#install [data-act="help"]').catch(() => {});
      check('iPhone: la guida spiega «Aggiungi alla schermata Home»', await page.isVisible('text=Aggiungi alla schermata Home'));
      await page.screenshot({ path: path.join(__dirname, 'out', 'iphone13-guida.png') });
      await page.click('[data-close]').catch(() => {});
      await page.click('#install [data-act="installNo"]').catch(() => {});
      await page.reload();
      await page.waitForSelector('[data-open]', { timeout: 8000 }).catch(() => {});
      check('iPhone: «Non ora» nasconde l\'invito anche dopo', !(await page.isVisible('#install')));
    }
    await ctx.close();
  }

  // 4. Guida dalle Impostazioni
  {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
    await ctx.addInitScript(s => { window.NZ_TEST_SEED = s; }, seed);
    const page = await ctx.newPage();
    await page.goto(base + 'index.html?test=1');
    await page.waitForSelector('[data-open]');
    await page.click('#bottomnav [data-view="impostazioni"]');
    await page.click('text=Come installarla su iPhone e Android');
    check('impostazioni: guida per Android', await page.isVisible('text=Installa app'));
    await ctx.close();
  }

  // 5. Con Firebase vero: dopo UNA sola visita l'app si apre senza rete (prima apertura dall'icona su iPhone)
  {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    let off = false;
    await ctx.route('https://www.gstatic.com/firebasejs/**', r => off ? r.abort('internetdisconnected') : r.fulfill({ path: path.join(ROOT, 'node_modules/firebase', path.basename(new URL(r.request().url()).pathname)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
    const page = await ctx.newPage();
    await page.goto(base + 'index.html?emu=127.0.0.1');
    check('offline Firebase: service worker attivo', (await swReady(page)) === 'ready');
    await page.waitForSelector('#login', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    off = true; await ctx.setOffline(true);
    await page.reload().catch(() => {});
    await page.waitForTimeout(3000);
    const id = await page.evaluate(() => document.querySelector('#screen .auth')?.id || (document.querySelector('#app:not([hidden])') ? 'app' : 'nessuna'));
    check('offline dopo una sola visita (Firebase vero): l\'app si apre', id === 'login' || id === 'app', id);
    await ctx.close();
  }

  // 6. Pubblicazione: versione nuova a ogni pubblicazione, «Aggiorna» e poi file tutti nuovi
  {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), 'nz-site-'));
    const prep = sha => execFileSync('sh', [path.join(ROOT, 'scripts/prepara-sito.sh'), site, sha], { cwd: ROOT, encoding: 'utf8' });
    let ok1 = true;
    try { prep('aaaaaaaa1111'); } catch (e) { ok1 = false; }
    check('pubblicazione: lo script prepara il sito', ok1 && fs.existsSync(path.join(site, 'index.html')));
    const v1 = ok1 ? /const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(site, 'sw.js'), 'utf8'))[1] : '';
    check('pubblicazione: versione legata al commit', v1.includes('aaaaaaaa'), v1);
    check('pubblicazione: versione visibile nell\'app', ok1 && fs.readFileSync(path.join(site, 'js/versione.js'), 'utf8').includes("'aaaaaaaa"));
    check('pubblicazione: niente test né documenti nel sito', ok1 && !fs.existsSync(path.join(site, 'tests')) && !fs.existsSync(path.join(site, 'package.json')));
    if (ok1) {
      const srv2 = await serve(site);
      const b2 = `http://127.0.0.1:${srv2.address().port}/`;
      const ctx = await browser.newContext({ ...devices['Pixel 7'] });
      await fbRoute(ctx);
      await ctx.addInitScript(s => { window.NZ_TEST_SEED = s; }, seed);
      const page = await ctx.newPage();
      await page.goto(b2 + 'index.html?test=1');
      check('aggiornamento: service worker attivo', (await swReady(page)) === 'ready');
      await page.waitForTimeout(800);
      await page.reload(); // l'app è già stata aperta altre volte (come sul telefono)
      await page.waitForSelector('[data-open]', { timeout: 10000 }).catch(() => {});
      // nuova pubblicazione con un file cambiato
      prep('bbbbbbbb2222');
      fs.appendFileSync(path.join(site, 'js/calc.js'), '\nwindow.__nzv = 2;\n');
      // l'app torna in primo piano (iPhone: «chiudi e riapri» spesso riprende senza ricaricare)
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(() => window.__nzv === 2, null, { timeout: 20000 }).catch(() => {});
      check('aggiornamento: tornando in primo piano si aggiorna da sola, senza toccare nulla', await page.evaluate(() => window.__nzv) === 2);
      const ver = await page.evaluate(async () => { const m = await import('./js/versione.js'); return m.VERSIONE; }).catch(() => '');
      check('aggiornamento: la versione nuova è quella del commit', String(ver).startsWith('bbbbbbbb'), ver);
      // con un preventivo aperto non ricarica: chiede
      await page.waitForSelector('[data-open]', { timeout: 10000 });
      await page.click('[data-open]');
      await page.waitForSelector('.totbar');
      prep('cccccccc3333');
      fs.appendFileSync(path.join(site, 'js/calc.js'), '\nwindow.__nzv = 3;\n');
      await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
      await page.waitForSelector('#nz-update', { timeout: 15000 }).catch(() => {});
      check('aggiornamento: con un preventivo aperto chiede «Aggiorna» invece di ricaricare', await page.isVisible('#nz-update') && await page.isVisible('.totbar'));
      await Promise.all([page.waitForEvent('load', { timeout: 15000 }).catch(() => {}), page.click('#nz-update button').catch(() => {})]);
      await page.waitForTimeout(1000);
      check('aggiornamento: dopo «Aggiorna» i file sono quelli nuovi', await page.evaluate(() => window.__nzv) === 3);
      await ctx.close(); srv2.close();
    }
  }

  await browser.close(); srv.close();
  console.log(failures ? `\n${failures} controlli falliti` : '\nTutti i controlli superati');
  process.exit(failures ? 1 : 0);
})();
