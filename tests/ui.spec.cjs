// Prove dell'interfaccia su telefono simulato (Chromium con profilo iPhone 13 e Pixel 7).
// Uso: node tests/ui.spec.cjs   (da nazifoski-app/). Screenshot in tests/out/.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  — ' + detail}`); if (!ok) failures++; };

const VENDOR = {
  'pdfmake.min.js': 'vendor/pdfmake.min.js', 'pdf.min.js': 'vendor/pdf.min.js', 'pdf.worker.min.js': 'vendor/pdf.worker.min.js'
};

async function open(browser, device, seed, extra = {}) {
  const ctx = await browser.newContext({ ...devices[device], ...extra });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'app.test') return r.abort();
    let p = u.pathname.replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, p);
    if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: 'not found' });
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css' };
    return r.fulfill({ path: file, contentType: types[path.extname(file)] || 'application/octet-stream' });
  });
  await page.addInitScript(s => { window.NZ_TEST_SEED = s; }, seed);
  await page.goto('https://app.test/index.html?test=1');
  return { page, ctx, errors };
}

const seedBase = () => ({
  user: { email: 'impresaedilenazifoski@gmail.com' },
  preventivi: [{ ...fx.acorpo }],
  listino: [{ id: 'l1', categoria: 'Tinteggiatura', desc: 'Tinteggiatura pareti, due mani', um: 'mq', prezzo: 8 }],
  clienti: [{ id: 'c1', nome: 'Mario Rossi', indirizzo: 'Via Roma 1, Rimini' }],
  impostazioni: [{ id: 'azienda', ragione: 'Impresa Edile Nazifoski', indirizzo: 'Via Villagrande 24, Rimini (RN)', ivaDefault: 10 }]
});

const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

(async () => {
  const browser = await chromium.launch();

  // 1. Senza accesso: schermata di login
  {
    const s = seedBase(); s.user = null;
    const { page, errors, ctx } = await open(browser, 'iPhone 13', s);
    await page.waitForSelector('#login', { timeout: 8000 }).catch(() => {});
    check('login: schermata visibile senza accesso', await page.isVisible('#login'));
    check('login: pulsante Google', await page.isVisible('text=Accedi con Google'));
    check('login: campo email', await page.isVisible('#l-email'));
    check('login: testo dei campi almeno 16px', await page.$eval('#l-email', e => parseFloat(getComputedStyle(e).fontSize) >= 16));
    await page.screenshot({ path: path.join(OUT, 'iphone-login.png') });
    await page.click('text=Accedi con Google');
    await page.waitForSelector('[data-open]', { timeout: 8000 }).catch(() => {});
    check('login: dopo l\'accesso compare l\'elenco', await page.isVisible('[data-open="acorpo"]'));
    check('login: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2. Telefono: elenco, barra in basso, nuovo preventivo e totali
  for (const device of ['iPhone 13', 'Pixel 7']) {
    const tag = device.replace(/\s/g, '').toLowerCase();
    const { page, errors, ctx } = await open(browser, device, seedBase());
    await page.waitForSelector('[data-open]', { timeout: 8000 }).catch(() => {});
    check(`${device}: barra delle sezioni in basso visibile`, await page.isVisible('#bottomnav'));
    const nb = await page.$eval('#bottomnav', e => { const r = e.getBoundingClientRect(); return { bottom: r.bottom, h: innerHeight }; }).catch(() => null);
    check(`${device}: barra in basso attaccata al fondo`, nb && Math.abs(nb.bottom - nb.h) < 2, JSON.stringify(nb));
    check(`${device}: nessuno scorrimento orizzontale (elenco)`, (await overflow(page)) <= 0);
    check(`${device}: totale in elenco calcolato dalle voci`, (await page.textContent('[data-open="acorpo"] .amt')).includes('€ 4.700,30'));
    // misurare a animazione finita: durante l'entrata della pagina le misure hanno errori di arrotondamento
    await page.evaluate(() => Promise.all(document.getAnimations().map(x => x.finished.catch(() => {}))));
    const small = await page.$$eval('#bottomnav button, .btn, .icon-btn', els => els.filter(e => e.offsetParent).map(e => ({ r: e.getBoundingClientRect(), h: e.outerHTML.slice(0, 90), cls: e.closest('[id]')?.id })).filter(x => x.r.height < 44 || x.r.width < 44).map(x => `${x.r.width}x${x.r.height} @${x.r.x},${x.r.y} in #${x.cls}: ${x.h.slice(0, 40)}`));
    check(`${device}: pulsanti almeno 44px`, small.length === 0, small.join(' | '));
    await page.screenshot({ path: path.join(OUT, `${tag}-lista.png`) });

    await page.click('#bottomnav [data-view="listino"]');
    check(`${device}: la barra porta al listino`, await page.isVisible('h1:has-text("Listino prezzi")'));
    await page.click('#bottomnav [data-view="lista"]');

    await page.click('[data-act="new"]');
    await page.waitForSelector('#sezioni textarea');
    check(`${device}: nell'editor la barra in basso lascia posto ai totali`, !(await page.isVisible('#bottomnav')) && await page.isVisible('.totbar'));
    await page.fill('#sezioni textarea', 'Tinteggiatura soggiorno');
    await page.fill('#sezioni [data-v="qta"]', '3*4');
    await page.fill('#sezioni [data-v="prezzo"]', '10');
    await page.waitForTimeout(100);
    check(`${device}: totale aggiornato (3*4 × 10 + IVA 10%)`, (await page.textContent('#t-tot')).trim() === '€ 132,00', await page.textContent('#t-tot'));
    check(`${device}: nessuno scorrimento orizzontale (editor)`, (await overflow(page)) <= 0);
    await page.screenshot({ path: path.join(OUT, `${tag}-editor.png`) });
    await page.click('[data-act="back"]');
    await page.waitForTimeout(900);
    check(`${device}: il nuovo preventivo è salvato in elenco`, (await page.$$('[data-open]')).length === 2);
    check(`${device}: nessun errore`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2b. Tasto Indietro (gesto di Android): chiude la cosa in cima, non esce dall'app
  {
    const { page, ctx, errors } = await open(browser, 'Pixel 7', seedBase());
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.click('[data-act="vPick"]');
    await page.waitForSelector('#pk-q');
    await page.click('[data-close="ok"]');
    await page.click('[data-act="vPick"]');
    await page.waitForSelector('#pk-q');
    await page.goBack();
    await page.waitForTimeout(300);
    check('indietro: chiude la finestra del listino e resta nel preventivo', !(await page.isVisible('#pk-q')) && await page.isVisible('.totbar'));
    await page.goBack();
    await page.waitForTimeout(300);
    check('indietro: dal preventivo torna all\'elenco', await page.isVisible('[data-open="acorpo"]') && !(await page.isVisible('.totbar')));
    await page.click('[data-open="acorpo"]');
    await page.click('[data-act="back"]');
    await page.waitForTimeout(300);
    check('indietro: dopo apri/chiudi l\'app è ancora aperta', page.url().includes('index.html') && await page.isVisible('[data-open="acorpo"]'));
    // finestra che si chiude e preventivo che si apre nello stesso momento
    await page.click('#bottomnav [data-view="clienti"]');
    await page.click('[data-cl="c1"]');
    await page.click('#cf-new');
    await page.waitForSelector('.totbar');
    await page.click('[data-act="back"]');
    await page.waitForTimeout(500);
    check('indietro: da cliente → nuovo preventivo → indietro, l\'app resta aperta', page.url().includes('index.html') && await page.isVisible('#main .head h1'));
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
    check('indietro: un altro «Indietro» non lascia l\'app con l\'editor aperto a metà', !(await page.isVisible('.totbar')));
    check('indietro: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2c. Listino: prezzi medi di Rimini
  {
    const s = seedBase();
    s.listino = [
      { id: 'l01', categoria: 'Demolizioni e rimozioni', desc: 'Vecchia voce indicativa', um: 'mq', prezzo: 18, indicativo: true },
      { id: 'mio', categoria: 'Varie', desc: 'Voce mia', um: 'mq', prezzo: 77 }
    ];
    const { page, ctx, errors } = await open(browser, 'Pixel 7', s);
    await page.waitForSelector('[data-open]');
    await page.click('#bottomnav [data-view="listino"]');
    await page.click('[data-act="lRimini"]').catch(() => {});
    await page.click('[data-close="ok"]').catch(() => {});
    await page.waitForTimeout(400);
    check('listino: «Nuova voce» visibile sul telefono', await page.isVisible('[data-act="lNew"]'));
    const n = (await page.$$('.li')).length;
    check('listino Rimini: caricate le voci di base', n >= 60, n);
    check('listino Rimini: la voce del titolare resta', await page.isVisible('.li:has-text("Voce mia") .p:has-text("€ 77,00")'));
    check('listino Rimini: la vecchia voce indicativa sparisce', !(await page.isVisible('text=Vecchia voce indicativa')));
    check('listino Rimini: voci segnate come indicative', (await page.$$('.li .tag')).length >= 60);
    await page.click('[data-act="lRimini"]').catch(() => {});
    await page.click('[data-close="ok"]').catch(() => {});
    await page.waitForTimeout(400);
    check('listino Rimini: ricaricare non crea doppioni', (await page.$$('.li')).length === n);
    await page.click('#bottomnav [data-view="impostazioni"]');
    // con il listino lungo le voci della finestra «Dal listino» devono leggersi per intero
    await page.click('#bottomnav [data-view="lista"]');
    await page.click('[data-open="acorpo"]');
    await page.click('[data-act="vPick"]');
    await page.waitForSelector('[data-pick]');
    const pk = await page.$$eval('#pk-list .pick, #pk-list .pick-cat', els => {
      const out = { traboccano: 0, sovrapposte: 0, n: els.length };
      els.forEach((e, i) => {
        if (e.scrollHeight > e.clientHeight + 1) out.traboccano++;
        const n = els[i + 1]; if (n && n.getBoundingClientRect().top < e.getBoundingClientRect().bottom - 1) out.sovrapposte++;
      });
      return out;
    });
    const hq = await page.$eval('#pk-q', e => { const r = e.getBoundingClientRect(); const box = e.parentElement.getBoundingClientRect(); const top = document.elementFromPoint(r.left + 20, r.top + r.height / 2); return { visibile: Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top), toccabile: top === e }; });
    check('dal listino: il campo di ricerca si vede intero e si può toccare', hq.visibile >= 44 && hq.toccabile, JSON.stringify(hq));
    check('dal listino: nessuna voce schiacciata o sovrapposta', pk.n > 60 && pk.traboccano === 0 && pk.sovrapposte === 0, JSON.stringify(pk));
    await page.click('[data-close="no"]');
    await page.click('[data-act="back"]');
    await page.click('#bottomnav [data-view="impostazioni"]');
    check('impostazioni: mostra la versione dell\'app', await page.isVisible('text=Versione'));
    check('listino Rimini: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2d. Suggerimenti dal listino mentre si scrive la descrizione
  {
    const s = seedBase();
    s.listino = [
      { id: 'b', categoria: 'Massetti e pavimenti', desc: 'Posa di pavimento in gres porcellanato fino a 60×60, collante compreso', um: 'mq', prezzo: 35 },
      { id: 'a', categoria: 'Massetti e pavimenti', desc: 'Fornitura di gres porcellanato di fascia media', um: 'mq', prezzo: 32 },
      { id: 'z', categoria: 'Smaltimento e pulizia', desc: 'Pulizia finale del cantiere', um: 'a corpo', prezzo: 280 }
    ];
    const { page, ctx, errors } = await open(browser, 'iPhone 13', s);
    await page.waitForSelector('[data-open]');
    await page.click('[data-act="new"]');
    await page.waitForSelector('#sezioni textarea');
    await page.click('#sezioni textarea');
    await page.keyboard.type('pav gres');
    await page.waitForSelector('.sugg [data-sugg]', { timeout: 3000 }).catch(() => {});
    const items = await page.$$eval('.sugg [data-sugg]', els => els.map(e => ({ t: e.innerText, h: e.getBoundingClientRect().height })));
    check('suggerimenti: compaiono mentre scrivi', items.length >= 1 && items[0].t.includes('Posa di pavimento in gres'), JSON.stringify(items));
    check('suggerimenti: mostrano unità e prezzo', items.length && /mq/.test(items[0].t) && items[0].t.includes('€ 35,00'));
    check('suggerimenti: facili da toccare (≥ 44px)', items.every(i => i.h >= 44));
    await page.screenshot({ path: path.join(OUT, 'iphone13-suggerimenti.png') });
    await page.click('.sugg [data-sugg="b"]').catch(() => {});
    await page.waitForTimeout(150);
    check('suggerimenti: il tocco compila descrizione, unità e prezzo', (await page.inputValue('#sezioni textarea')).startsWith('Posa di pavimento in gres') && (await page.inputValue('#sezioni [data-v="um"]')) === 'mq' && (await page.inputValue('#sezioni [data-v="prezzo"]')) === '35');
    check('suggerimenti: il cursore passa alla quantità', await page.evaluate(() => document.activeElement && document.activeElement.dataset.v === 'qta'));
    check('suggerimenti: il menu si chiude', !(await page.isVisible('.sugg [data-sugg]')));
    await page.keyboard.type('10');
    await page.waitForTimeout(100);
    check('suggerimenti: totale aggiornato (10 × 35 + IVA)', (await page.textContent('#t-tot')).trim() === '€ 385,00', await page.textContent('#t-tot'));
    // voce «a corpo»: quantità 1
    await page.click('[data-act="vAdd"]');
    const ta = await page.$$('#sezioni textarea');
    await ta[1].click();
    await page.keyboard.type('pulizia');
    await page.waitForSelector('.sugg [data-sugg="z"]', { timeout: 3000 }).catch(() => {});
    await page.click('.sugg [data-sugg="z"]').catch(() => {});
    await page.waitForTimeout(150);
    const q2 = await page.$$eval('#sezioni [data-v="qta"]', e => e[1] && e[1].value);
    check('suggerimenti: voce «a corpo» con quantità 1', q2 === '1', q2);
    // descrizione già identica: niente menu
    await page.click('[data-act="vAdd"]');
    const ta3 = (await page.$$('#sezioni textarea'))[2];
    await ta3.click();
    await page.keyboard.type('Pulizia finale del cantiere');
    await page.waitForTimeout(200);
    check('suggerimenti: niente menu se la descrizione è già uguale a una voce', !(await page.isVisible('.sugg [data-sugg]')));
    check('suggerimenti: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2e. Misure delle stanze
  {
    const { page, ctx, errors } = await open(browser, 'iPhone 13', seedBase());
    await page.waitForSelector('[data-open]');
    await page.click('[data-act="new"]');
    await page.waitForSelector('[data-act="vMisure"]');
    const bm = await page.$eval('[data-act="vMisure"]', e => e.getBoundingClientRect());
    check('misure: pulsante accanto alla quantità, facile da toccare', bm.width >= 44 && bm.height >= 44);
    await page.click('[data-act="vMisure"]');
    await page.waitForSelector('#ms');
    await page.fill('#ms-l-0', '4'); await page.fill('#ms-p-0', '3,5'); await page.fill('#ms-h-0', '2,7');
    await page.click('[data-act="msApertura"]');
    await page.fill('#ms-al-0-0', '0,8'); await page.fill('#ms-ah-0-0', '2,1'); await page.fill('#ms-an-0-0', '2');
    await page.waitForTimeout(100);
    const txt = await page.textContent('#ms');
    check('misure: mostra pavimento, soffitto e pareti', txt.includes('14 mq') && txt.includes('37,14 mq'), txt.slice(0, 300));
    await page.screenshot({ path: path.join(OUT, 'iphone13-misure.png') });
    await page.click('[data-usa="pareti"]');
    await page.waitForTimeout(150);
    const q = await page.inputValue('#sezioni [data-v="qta"]');
    check('misure: la quantità riceve il calcolo', q === '2*(4+3,5)*2,7-0,8*2,1*2', q);
    check('misure: mostra il risultato del calcolo', (await page.textContent('#sezioni .q .calc')).includes('37,14'));
    check('misure: unità impostata a mq', (await page.inputValue('#sezioni [data-v="um"]')) === 'mq');
    check('misure: finestra chiusa', !(await page.isVisible('#ms')));
    // due stanze sommate per il pavimento
    await page.click('[data-act="vMisure"]');
    await page.fill('#ms-l-0', '4'); await page.fill('#ms-p-0', '3,5');
    await page.click('[data-act="msStanza"]');
    await page.fill('#ms-l-1', '3'); await page.fill('#ms-p-1', '3');
    await page.click('[data-usa="pavimento"]');
    await page.waitForTimeout(150);
    check('misure: più stanze sommate', (await page.inputValue('#sezioni [data-v="qta"]')) === '4*3,5+3*3');
    check('misure: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2g. Revisioni
  {
    const { page, ctx, errors } = await open(browser, 'Pixel 7', seedBase());
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.click('[data-act="revisione"]').catch(() => {});
    await page.waitForTimeout(300);
    check('revisioni: titolo «2026/007 rev. 2»', (await page.textContent('.ed-top h1')).includes('2026/007 rev. 2'));
    await page.click('[data-act="revisioni"]').catch(() => {});
    await page.waitForSelector('#rv', { timeout: 3000 }).catch(() => {});
    const rv = await page.textContent('#rv').catch(() => '');
    check('revisioni: elenco con la prima versione e il suo totale', rv.includes('2026/007 (prima versione)') && rv.includes('€ 4.700,30'), rv);
    await page.click('#rv [data-act="rvVedi"]').catch(() => {});
    await page.waitForSelector('#pv-actions:not([hidden])', { timeout: 15000 }).catch(() => {});
    check('revisioni: la versione vecchia si apre in anteprima (sola lettura)', !!(await page.$('#pv-actions:not([hidden])')) && (await page.getAttribute('#pv-dl', 'download').catch(() => '') || '').includes('2026-007'));
    await page.click('#pv-close').catch(() => {});
    await page.waitForTimeout(300);
    await page.click('[data-act="revisioni"]').catch(() => {});
    await page.waitForSelector('#rv', { timeout: 3000 }).catch(() => {});
    await page.click('#rv [data-act="rvRipristina"]').catch(() => {});
    await page.click('#modal [data-close="ok"]').catch(() => {});
    await page.waitForTimeout(400);
    check('revisioni: ripristinare crea la rev. 3', (await page.textContent('.ed-top h1')).includes('rev. 3'));
    await page.click('[data-act="back"]');
    await page.waitForTimeout(900);
    check('revisioni: in elenco «2026/007 rev. 3»', (await page.textContent('[data-open="acorpo"]')).includes('2026/007 rev. 3'));
    check('revisioni: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2h. Margine (costi interni)
  {
    const s = seedBase();
    s.listino = [{ id: 'l1', categoria: 'Tinteggiatura', desc: 'Tinteggiatura pareti, due mani', um: 'mq', prezzo: 8, costo: 5 }];
    const { page, ctx, errors } = await open(browser, 'Pixel 7', s);
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    check('margine: nessun margine senza costi', await page.isHidden('#t-marg-w').catch(() => false));
    const costo = '[data-sez="0"] [data-voce="0"] [data-v="costo"]';
    await page.fill(costo, '3000').catch(() => {});
    await page.waitForTimeout(300);
    const vm = await page.textContent('[data-sez="0"] [data-voce="0"] .mg').catch(() => '');
    check('margine: sulla voce «margine € 1.273,00 (29,8%)»', vm.includes('margine € 1.273,00 (29,8%)'), vm);
    check('margine: nella barra dei totali', (await page.isVisible('#t-marg-w').catch(() => false)) && (await page.textContent('#t-marg').catch(() => '')).includes('€ 1.273,00'));
    // dal listino si copia anche il costo
    await page.click('[data-sez="0"] [data-act="vAdd"]').catch(() => {});
    const d1 = '[data-sez="0"] [data-voce="1"] [data-v="desc"]';
    await page.fill(d1, 'tinteg').catch(() => {});
    await page.click('[data-sugg]').catch(() => {});
    await page.waitForTimeout(300);
    check('margine: il suggerimento dal listino copia il costo', (await page.inputValue('[data-sez="0"] [data-voce="1"] [data-v="costo"]').catch(() => '')) === '5');
    check('margine: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2i. Acconti e saldo
  {
    const s = seedBase();
    s.impostazioni = [{ ...s.impostazioni[0], rateStandard: "30% all'accettazione, 40% a metà lavori, 30% a fine lavori" }];
    s.preventivi.push({ ...fx.acorpo, id: 'altro', numero: 8, stato: 'accettato' });
    const { page, ctx, errors } = await open(browser, 'Pixel 7', s);
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.click('#pagamenti [data-act="rStandard"]').catch(() => {});
    await page.waitForTimeout(300);
    const imp = await page.$$eval('#pagamenti [data-r="importo"]', a => a.map(x => x.value)).catch(() => []);
    check('pagamenti: rate standard 30/40/30 sul totale', imp.join(' | ') === '1.410,09 | 1.880,12 | 1.410,09', imp.join(' | '));
    const sum0 = await page.textContent('#pg-sum').catch(() => '');
    check('pagamenti: da incassare tutto il totale', sum0.includes('Da incassare € 4.700,30'), sum0);
    await page.click('#pagamenti [data-rata="0"] [data-act="rPagata"]').catch(() => {});
    await page.waitForTimeout(300);
    const sum1 = await page.textContent('#pg-sum').catch(() => '');
    check('pagamenti: segnata pagata → incassato e resto', sum1.includes('Incassato € 1.410,09') && sum1.includes('Da incassare € 3.290,21'), sum1);
    const ieri = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
    await page.fill('#pagamenti [data-rata="1"] [data-r="scadenza"]', ieri).catch(() => {});
    await page.waitForTimeout(900);
    await page.click('[data-act="back"]');
    await page.waitForTimeout(900);
    check('pagamenti: in elenco «Rata scaduta»', !!(await page.$('[data-open="acorpo"] .scaduta')));
    await page.click('[data-filter="incassare"].chip').catch(() => {});
    await page.waitForTimeout(300);
    const ids = await page.$$eval('#rows [data-open]', a => a.map(x => x.dataset.open)).catch(() => []);
    check('pagamenti: filtro «Da incassare»', ids.join() === 'acorpo', ids.join());
    check('pagamenti: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2j. Firma del cliente sul telefono
  {
    const { page, ctx, errors } = await open(browser, 'Pixel 7', seedBase());
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.click('.totbar [data-act="preview"]');
    await page.waitForSelector('#pv-actions:not([hidden])', { timeout: 30000 }).catch(() => {});
    await page.click('#pv-actions [data-act="firma"]').catch(() => {});
    await page.waitForSelector('#fi-pad', { timeout: 3000 }).catch(() => {});
    check('firma: «Conferma» spento finché non si firma', await page.isDisabled('#fi-ok').catch(() => false));
    const bx = await page.$eval('#fi-pad', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).catch(() => null);
    if (bx) {
      await page.mouse.move(bx.x + bx.w * 0.2, bx.y + bx.h * 0.6); await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(bx.x + bx.w * (0.2 + i * 0.05), bx.y + bx.h * (0.6 - Math.sin(i / 2) * 0.25));
      await page.mouse.up();
    }
    // la tastiera che si apre (o il telefono girato) cambia l'altezza: la firma non deve sparire
    const vs = page.viewportSize();
    await page.setViewportSize({ width: vs.width, height: Math.round(vs.height * 0.6) });
    await page.waitForTimeout(300);
    await page.setViewportSize(vs);
    await page.waitForTimeout(300);
    check('firma: resta dopo un cambio di dimensioni dello schermo', !(await page.isDisabled('#fi-ok').catch(() => true)) && await page.$eval('#fi-pad', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; }).catch(() => false));
    await page.fill('#fi-nome', 'Mario Rossi').catch(() => {});
    check('firma: dopo il tratto «Conferma» si accende', !(await page.isDisabled('#fi-ok').catch(() => true)));
    await page.evaluate(() => { const pm = window.pdfMake; if (!pm) return; const o = pm.createPdf.bind(pm); pm.createPdf = (dd, ...r) => { window.__dd = JSON.stringify(dd); return o(dd, ...r); }; });
    await page.click('#fi-ok').catch(() => {});
    await page.waitForFunction(() => window.__dd, null, { timeout: 15000 }).catch(() => {});
    const dd = await page.evaluate(() => window.__dd || '');
    check('firma: il PDF rifatto contiene «Firmato da Mario Rossi»', dd.includes('Firmato da Mario Rossi') && dd.includes('data:image/png;base64,'));
    await page.waitForSelector('#pv-actions:not([hidden])', { timeout: 15000 }).catch(() => {});
    await page.click('#pv-close').catch(() => {});
    await page.waitForTimeout(400);
    check('firma: il preventivo è «Accettato»', (await page.inputValue('#f-stato').catch(() => '')) === 'accettato');
    check('firma: nell\'editor «Firmato da Mario Rossi»', (await page.textContent('#main').catch(() => '')).includes('Firmato da Mario Rossi'));
    check('firma: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2k. Foto del sopralluogo
  {
    const { page, ctx, errors } = await open(browser, 'Pixel 7', seedBase(), { acceptDownloads: true });
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    // una foto grande come quelle del telefono (4000×3000)
    const aggiungi = () => page.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = 4000; cv.height = 3000;
      const g = cv.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 4000, 3000); gr.addColorStop(0, '#8a6a4a'); gr.addColorStop(1, '#d8d0c0');
      g.fillStyle = gr; g.fillRect(0, 0, 4000, 3000);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `hsl(${i % 360},40%,${30 + (i % 50)}%)`; g.fillRect((i * 997) % 4000, (i * 613) % 3000, 40, 30); }
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.95));
      const inp = document.querySelector('#foto-file'); if (!inp) return 0;
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'IMG_0001.jpg', { type: 'image/jpeg' }));
      inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
      return blob.size;
    }).catch(() => 0);
    const orig = await aggiungi();
    await page.waitForSelector('#foto .ft img', { timeout: 15000 }).catch(() => {});
    const info = await page.$eval('#foto .ft img', i => ({ len: i.src.length, w: i.naturalWidth, h: i.naturalHeight })).catch(() => null);
    check('foto: ridotta a 1600 px e ≤ 600 KB', !!info && info.w === 1600 && info.h === 1200 && info.len <= 600 * 1024, JSON.stringify(info) + ' originale ' + orig);
    await page.click('#foto .ft').catch(() => {});
    check('foto: tocco → si vede grande', await page.isVisible('#fv img').catch(() => false));
    await page.click('#fv [data-act="fotoDel"]').catch(() => {});
    await page.click('#modal [data-close="ok"]').catch(() => {});
    await page.waitForTimeout(400);
    check('foto: eliminata', (await page.$$('#foto .ft')).length === 0);
    await aggiungi();
    await page.waitForSelector('#foto .ft img', { timeout: 15000 }).catch(() => {});
    await page.click('[data-act="dup"]').catch(() => {});
    await page.waitForTimeout(600);
    check('foto: la copia del preventivo non ha foto', (await page.textContent('.ed-top h1')).includes('2026/') && !!(await page.$('#foto')) && (await page.$$('#foto .ft')).length === 0);
    const backup = async () => {
      if (await page.isVisible('.ed-top [data-act="back"]').catch(() => false)) { await page.click('.ed-top [data-act="back"]'); await page.waitForTimeout(700); }
      await page.locator('[data-view="impostazioni"]:visible').first().click().catch(() => {});
      await page.waitForSelector('[data-act="backup"]:visible').catch(() => {});
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('[data-act="backup"]:visible').first().click()]).catch(() => [null]);
      if (!dl) return null;
      const p = await dl.path(); return JSON.parse(fs.readFileSync(p, 'utf8'));
    };
    const b1 = await backup();
    check('foto: la copia di sicurezza contiene la foto', !!b1 && Array.isArray(b1.foto) && b1.foto.length === 1 && b1.foto[0].preventivoId === 'acorpo', b1 && JSON.stringify((b1.foto || []).map(f => f.preventivoId)));
    await page.locator('[data-view="lista"]:visible').first().click().catch(() => {});
    await page.click('[data-open="acorpo"]').catch(() => {});
    await page.click('[data-act="del"]').catch(() => {});
    await page.click('#modal [data-close="ok"]').catch(() => {});
    await page.waitForTimeout(500);
    const b2 = await backup();
    check('foto: eliminando il preventivo spariscono le sue foto', !!b2 && Array.isArray(b2.foto) && b2.foto.length === 0, b2 && JSON.stringify(b2.foto && b2.foto.length));
    check('foto: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2l. Foto senza rete: il salvataggio resta in coda ma le foto successive vanno avanti
  {
    const s = seedBase(); s.lento = ['foto'];
    const { page, ctx, errors } = await open(browser, 'Pixel 7', s);
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.evaluate(async () => {
      const dt = new DataTransfer();
      for (let k = 0; k < 3; k++) {
        const cv = document.createElement('canvas'); cv.width = 800; cv.height = 600; const g = cv.getContext('2d'); g.fillStyle = ['#a00', '#0a0', '#00a'][k]; g.fillRect(0, 0, 800, 600);
        dt.items.add(new File([await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9))], `f${k}.jpg`, { type: 'image/jpeg' }));
      }
      const inp = document.querySelector('#foto-file'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('#foto .ft img').length === 3, null, { timeout: 15000 }).catch(() => {});
    check('foto offline: tutte e tre visibili anche se il salvataggio è in coda', (await page.$$('#foto .ft img')).length === 3, String((await page.$$('#foto .ft img')).length));
    check('foto offline: niente «Riduco…» bloccato', !(await page.$('#foto .ft.carica')));
    check('foto offline: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2m. Preventivo firmato: per modificarlo serve una nuova revisione
  {
    const s = seedBase();
    s.preventivi = [{ ...fx.acorpo, stato: 'accettato', firma: { png: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', nome: 'Mario Rossi', data: '2026-11-20' } }];
    const { page, ctx, errors } = await open(browser, 'Pixel 7', s);
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.click('[data-sez="0"] [data-voce="0"] [data-v="prezzo"]').catch(() => {});
    await page.waitForTimeout(300);
    const t = await page.textContent('#modal').catch(() => '');
    check('firmato: toccando un prezzo chiede una nuova revisione', /firmato/i.test(t) && /revisione/i.test(t), t);
    await page.click('#modal [data-close="no"]').catch(() => {});
    await page.waitForTimeout(200);
    await page.click('[data-sez="0"] [data-act="vAdd"]').catch(() => {});
    await page.waitForTimeout(300);
    check('firmato: anche aggiungere una voce lo chiede', /firmato/i.test(await page.textContent('#modal').catch(() => '')));
    await page.click('#modal [data-close="ok"]').catch(() => {});
    await page.waitForTimeout(400);
    check('firmato: dopo la conferma è la rev. 2, bozza, senza firma', (await page.textContent('.ed-top h1')).includes('rev. 2') && (await page.inputValue('#f-stato')) === 'bozza' && !(await page.textContent('#main')).includes('Firmato da Mario'));
    await page.fill('[data-sez="0"] [data-voce="0"] [data-v="prezzo"]', '5000').catch(() => {});
    await page.waitForTimeout(200);
    check('firmato: ora si modifica liberamente', (await page.inputValue('[data-sez="0"] [data-voce="0"] [data-v="prezzo"]')) === '5000' && !(await page.isVisible('#modal').catch(() => false)));
    check('firmato: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2n. Misure fuori dal preventivo: rilievi salvati da soli
  {
    const { page, ctx, errors } = await open(browser, 'Pixel 7', seedBase());
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    const ordine = await page.$$eval('#bottomnav [data-view]', a => a.map(x => x.dataset.view).join(','));
    check('rilievi: «Misure» in basso tra Listino e Clienti', ordine === 'lista,listino,misure,clienti,impostazioni', ordine);
    check('rilievi: «Misure» anche nel menu in alto', (await page.$$eval('.tabs [data-view]', a => a.map(x => x.dataset.view).join(','))) === 'lista,listino,misure,clienti,impostazioni');
    await page.locator('[data-view="misure"]:visible').first().click().catch(() => {});
    await page.click('[data-act="mNew"]').catch(() => {});
    await page.waitForSelector('#rl-nome').catch(() => {});
    await page.fill('#rl-nome', 'Appartamento Rossi').catch(() => {});
    await page.fill('[data-st="0"] [data-k="nome"]', 'Bagno').catch(() => {});
    await page.fill('[data-st="0"] [data-k="l"]', '4').catch(() => {});
    await page.fill('[data-st="0"] [data-k="p"]', '3,5').catch(() => {});
    await page.fill('[data-st="0"] [data-k="h"]', '2,7').catch(() => {});
    await page.waitForTimeout(200);
    const ris = await page.textContent('[data-st="0"] .rl-ris').catch(() => '');
    check('rilievi: pavimento, pareti e perimetro della stanza', ris.includes('14 mq') && ris.includes('40,5 mq') && ris.includes('15 ml'), ris);
    await page.click('[data-act="mStanza"]').catch(() => {});
    await page.fill('[data-st="1"] [data-k="l"]', '3').catch(() => {});
    await page.fill('[data-st="1"] [data-k="p"]', '3').catch(() => {});
    await page.waitForTimeout(200);
    check('rilievi: totale di tutte le stanze', (await page.textContent('#rl-tot').catch(() => '')).includes('23 mq'));
    check('rilievi: nessun pulsante «Salva», si salva da solo', !(await page.$('#main [data-act="mSalva"]')) && /salvat/i.test(await page.textContent('#saveState').catch(() => '') || ''));
    await page.waitForTimeout(900);
    await page.click('.ed-top [data-act="back"]').catch(() => {});
    await page.waitForTimeout(500);
    const lista = await page.textContent('#main').catch(() => '');
    check('rilievi: in elenco con nome e metri quadri', lista.includes('Appartamento Rossi') && lista.includes('23 mq'), lista.slice(0, 200));
    // nel preventivo: si carica un rilievo salvato e le misure restano sulla voce
    await page.locator('[data-view="lista"]:visible').first().click().catch(() => {});
    await page.click('[data-open="acorpo"]');
    await page.click('[data-sez="0"] [data-voce="0"] [data-act="vMisure"]').catch(() => {});
    await page.waitForSelector('#ms').catch(() => {});
    await page.waitForSelector('#ms-rilievo').catch(() => {});
    await page.selectOption('#ms-rilievo', { label: 'Appartamento Rossi' }).catch(() => {});
    await page.waitForTimeout(200);
    const l01 = [await page.inputValue('#ms-l-0').catch(e => 'ERR ' + e.message.split('\n')[0]), await page.inputValue('#ms-l-1').catch(() => '-')];
    check('rilievi: caricato nel preventivo', l01[0] === '4' && l01[1] === '3', l01.join(' | ') + ' | ' + await page.$$eval('#ms-rilievo option', a => a.map(o => o.textContent).join('/')).catch(() => 'nessun select'));
    await page.click('[data-usa="pavimento"]').catch(() => {});
    await page.waitForTimeout(200);
    check('rilievi: quantità dal rilievo', (await page.inputValue('[data-sez="0"] [data-voce="0"] [data-v="qta"]')) === '4*3,5+3*3');
    await page.click('[data-sez="0"] [data-voce="0"] [data-act="vMisure"]').catch(() => {});
    await page.waitForSelector('#ms').catch(() => {});
    check('rilievi: riaprendo, le misure della voce ci sono ancora', (await page.inputValue('#ms-l-0').catch(() => '')) === '4' && (await page.inputValue('#ms-p-1').catch(() => '')) === '3');
    check('rilievi: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2o. Telefono piccolo (iPhone SE): campi leggibili e comodi da toccare
  {
    const s = seedBase();
    const ap = JSON.parse(JSON.stringify(fx.appartamento));
    ap.rate = [{ id: 'r1', desc: 'Acconto', perc: 30, importo: 100, scadenza: '', pagata: '2026-10-18' }];
    s.preventivi = [ap];
    const { page, ctx, errors } = await open(browser, 'iPhone SE', s);
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click(`[data-open="${ap.id}"]`);
    const q = await page.$eval('[data-sez="0"] [data-voce="0"] [data-v="qta"]', e => Math.round(e.getBoundingClientRect().width));
    check('telefono piccolo: la quantità si legge (≥ 70 px)', q >= 70, q + ' px');
    const k = await page.$eval('[data-sez="0"] [data-voce="0"] [data-v="costo"]', e => Math.round(e.getBoundingClientRect().height));
    check('telefono piccolo: «Costo tuo» comodo da toccare (≥ 44 px)', k >= 44, k + ' px');
    const d = await page.$eval('#pagamenti [data-rata="0"] [data-r="pagata"]', e => Math.round(e.getBoundingClientRect().width));
    check('telefono piccolo: la data «Pagata il» non è tagliata (≥ 130 px)', d >= 130, d + ' px');
    check('telefono piccolo: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2p. Indietro dopo una conferma aperta da una finestra: basta una pressione
  {
    const s = seedBase();
    s.preventivi = [{ ...fx.acorpo, rev: 2, revisioni: [{ n: 1, data: '2026-02-12', totale: 4700.3, contenuto: { sezioni: fx.acorpo.sezioni } }] }];
    const { page, ctx, errors } = await open(browser, 'Pixel 7', s);
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.click('[data-act="revisioni"]');
    await page.click('#rv [data-act="rvRipristina"]');
    await page.click('#modal [data-close="no"]');
    await page.waitForTimeout(300);
    await page.goBack().catch(() => {});
    await page.waitForTimeout(700);
    check('indietro: dopo «Annulla» una sola pressione torna all\'elenco', !!(await page.$('#main [data-open]')) && !(await page.$('.ed-top')));
    check('indietro: l\'app resta aperta', page.url().startsWith('https://app.test/'));
    check('indietro: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2q. Foto che non si riesce a salvare: avviso
  {
    const s = seedBase(); s.errore = ['foto'];
    const { page, ctx, errors } = await open(browser, 'Pixel 7', s);
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300; cv.getContext('2d').fillRect(0, 0, 400, 300);
      const dt = new DataTransfer(); dt.items.add(new File([await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9))], 'x.jpg', { type: 'image/jpeg' }));
      const inp = document.querySelector('#foto-file'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => /non salvat/i.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
    const t = await page.textContent('#toast').catch(() => '');
    check('foto non salvata: lo dice', /1 foto non salvat/i.test(t), t);
    check('foto non salvata: nessun errore nella pagina', errors.filter(e => !/salvataggio|permission/i.test(e)).length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2r. Firma e timbro dell'impresa (Impostazioni)
  {
    const { page, ctx, errors } = await open(browser, 'Pixel 7', seedBase());
    page.setDefaultTimeout(5000);
    await page.waitForSelector('[data-open]');
    await page.locator('[data-view="impostazioni"]:visible').first().click();
    await page.click('[data-act="fiDisegna"]').catch(() => {});
    await page.waitForSelector('#fi-pad', { timeout: 3000 }).catch(() => {});
    check('firma impresa: il riquadro dice «Firma dell\'impresa»', /impresa/i.test(await page.textContent('#fi-t').catch(() => '')));
    const bx = await page.$eval('#fi-pad', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).catch(() => null);
    if (bx) { await page.mouse.move(bx.x + 30, bx.y + bx.h / 2); await page.mouse.down(); for (let i = 1; i < 15; i++) await page.mouse.move(bx.x + 30 + i * 15, bx.y + bx.h / 2 + (i % 2 ? 20 : -20)); await page.mouse.up(); }
    await page.click('#fi-ok').catch(() => {});
    await page.waitForTimeout(500);
    check('firma impresa: anteprima nelle impostazioni', /^data:image\//.test(await page.getAttribute('#fi-anteprima', 'src').catch(() => '') || ''));
    await page.click('[data-act="fiTogli"]').catch(() => {});
    await page.click('#modal [data-close="ok"]').catch(() => {});
    await page.waitForTimeout(300);
    check('firma impresa: «Togli» la toglie', !(await page.$('#fi-anteprima')));
    // foto del timbro
    await page.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 600; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1200, 600); g.strokeStyle = '#1a3a8a'; g.lineWidth = 12; g.strokeRect(100, 100, 1000, 400);
      const dt = new DataTransfer(); dt.items.add(new File([await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9))], 'timbro.jpg', { type: 'image/jpeg' }));
      const inp = document.querySelector('#fi-file'); if (!inp) return; inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForSelector('#fi-anteprima', { timeout: 5000 }).catch(() => {});
    const w = await page.$eval('#fi-anteprima', i => i.naturalWidth).catch(() => 0);
    check('firma impresa: foto del timbro ridotta (≤ 800 px)', w > 0 && w <= 800, String(w));
    check('firma impresa: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2f. Da richiamare
  {
    const s = seedBase();
    const g = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    s.preventivi = [
      { ...fx.acorpo, id: 'r1', numero: 31, stato: 'inviato', dataInvio: g(20), cliente: { nome: 'Rossi Mario', telefono: '333 111 2222' } },
      { ...fx.acorpo, id: 'r2', numero: 32, stato: 'inviato', dataInvio: g(3), cliente: { nome: 'Bianchi' } },
      { ...fx.acorpo, id: 'r3', numero: 33, stato: 'bozza', cliente: { nome: 'Verdi' } }
    ];
    const { page, ctx, errors } = await open(browser, 'Pixel 7', s);
    await page.waitForSelector('[data-open]');
    const ban = await page.textContent('#richiama').catch(() => '');
    check('richiamare: avviso «1 preventivo da richiamare»', /1 preventivo da richiamare/.test(ban), ban);
    await page.click('#richiama').catch(() => {});
    await page.waitForTimeout(300);
    check('richiamare: filtro attivo', (await page.getAttribute('[data-filter="richiamare"].chip', 'aria-pressed').catch(() => null)) === 'true');
    const ids = await page.$$eval('#rows [data-open]', a => a.map(x => x.dataset.open));
    check('richiamare: in elenco solo quello vecchio', ids.join() === 'r1', ids.join());
    check('richiamare: «inviato 20 giorni fa»', (await page.textContent('#rows').catch(() => '')).includes('inviato 20 giorni fa'));
    check('richiamare: link per telefonare', (await page.getAttribute('#rows a[href^="tel:"]', 'href').catch(() => null)) === 'tel:3331112222');
    await page.click('#rows [data-act="richiamato"]').catch(() => {});
    await page.waitForTimeout(400);
    check('richiamare: «Richiamato» lo toglie dall\'elenco', (await page.$$('#rows [data-open]')).length === 0);
    check('richiamare: avviso sparito', (await page.$('#richiama')) === null);
    // passare a «Inviato» segna la data di invio
    await page.click('[data-filter="tutti"].chip');
    await page.click('[data-open="r3"]');
    await page.selectOption('#f-stato', 'inviato');
    await page.waitForTimeout(900);
    await page.click('[data-act="back"]');
    await page.waitForTimeout(900);
    // la data del preventivo è vecchia (febbraio): senza data di invio di oggi tornerebbe «da richiamare»
    check('richiamare: appena passato a «Inviato» non va richiamato', (await page.$('#richiama')) === null);
    check('richiamare: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 3. Numeri doppi
  {
    const s = seedBase();
    s.preventivi = [
      { ...fx.acorpo, id: 'd1', numero: 15, anno: 2026 },
      { ...fx.acorpo, id: 'd2', numero: 15, anno: 2026, cliente: { nome: 'Altro cliente' } },
      { ...fx.acorpo, id: 'd3', numero: 20, anno: 2026 }
    ];
    const { page, ctx } = await open(browser, 'Pixel 7', s);
    await page.waitForSelector('[data-open]');
    check('doppi: due avvisi «Numero già usato» in elenco', (await page.$$('.dup')).length === 2);
    await page.click('[data-open="d2"]');
    await page.click('[data-act="renumber"]');
    await page.waitForTimeout(100);
    check('doppi: nuovo numero 2026/021', (await page.textContent('.ed-top h1')).includes('2026/021'));
    await page.click('[data-act="back"]');
    await page.waitForTimeout(900);
    check('doppi: nessun avviso dopo la correzione', (await page.$$('.dup')).length === 0);
    await ctx.close();
  }

  // 4. Non autorizzato
  {
    const s = seedBase(); s.user = { email: 'sconosciuto@example.com' }; s.deny = true;
    const { page, ctx } = await open(browser, 'iPhone 13', s);
    await page.waitForSelector('#attesa', { timeout: 8000 }).catch(() => {});
    check('non autorizzato: schermata di attesa', await page.isVisible('#attesa'));
    check('non autorizzato: mostra la propria email', await page.isVisible('text=sconosciuto@example.com'));
    await ctx.close();
  }

  // 5. Persone autorizzate: solo il titolare
  {
    const s = seedBase(); s.user = { email: 'moglie@example.com' };
    const { page, ctx } = await open(browser, 'Pixel 7', s);
    await page.waitForSelector('[data-open]');
    await page.click('#bottomnav [data-view="impostazioni"]');
    check('familiare: non vede «Persone autorizzate»', !(await page.isVisible('text=Persone autorizzate')));
    await ctx.close();
    const o = await open(browser, 'Pixel 7', seedBase());
    await o.page.waitForSelector('[data-open]');
    await o.page.click('#bottomnav [data-view="impostazioni"]');
    check('titolare: vede «Persone autorizzate»', await o.page.isVisible('text=Persone autorizzate'));
    await o.page.fill('#pa-email', 'Figlio@Example.com');
    await o.page.click('[data-act="paAdd"]');
    check('titolare: email aggiunta in minuscolo', await o.page.isVisible('text=figlio@example.com'));
    await o.page.screenshot({ path: path.join(OUT, 'pixel7-impostazioni.png'), fullPage: true });
    await o.ctx.close();
  }

  // 6. Condividi PDF (foglio di condivisione del telefono simulato)
  {
    const { page, ctx, errors } = await open(browser, 'iPhone 13', seedBase());
    await page.evaluate(() => {
      window.__shared = null;
      navigator.canShare = d => !!(d && d.files && d.files.length);
      navigator.share = async d => { window.__shared = { n: d.files.length, name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, text: d.text || '' }; };
      window.__copiato = null;
      try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copiato = t; } } }); } catch (e) {}
    });
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.click('.totbar [data-act="preview"]');
    await page.waitForSelector('#pv-share:not([hidden])', { timeout: 30000 }).catch(() => {});
    check('condividi: pulsante visibile sul telefono', await page.isVisible('#pv-share'));
    const box = await page.$eval('#pv-actions', e => { const r = e.getBoundingClientRect(); return { bottom: r.bottom, h: innerHeight }; }).catch(() => null);
    check('condividi: pulsanti in basso sul telefono', box && Math.abs(box.bottom - box.h) < 2, JSON.stringify(box));
    await page.click('#pv-share').catch(() => {});
    await page.waitForTimeout(200);
    const sh = await page.evaluate(() => window.__shared);
    check('condividi: passa il PDF con il nome giusto', sh && sh.n === 1 && sh.type === 'application/pdf' && sh.name === 'Preventivo 2026-007 Cliente di prova.pdf' && sh.size > 10000, JSON.stringify(sh));
    check('whatsapp: insieme al PDF parte il messaggio già scritto', sh && sh.text.startsWith('Buongiorno Cliente di prova, le invio il preventivo n. 2026/007'), sh && sh.text);
    check('whatsapp: il messaggio è anche copiato', (await page.evaluate(() => window.__copiato || '')).startsWith('Buongiorno Cliente di prova'));
    await page.click('#pv-close');
    await page.click('[data-act="back"]');
    await page.waitForTimeout(800);
    check('whatsapp: dopo la condivisione il preventivo è «Inviato»', (await page.textContent('[data-open="acorpo"]')).includes('Inviato'));
    await page.click('[data-open="acorpo"]');
    await page.click('.totbar [data-act="preview"]');
    await page.waitForSelector('#pv-share:not([hidden])', { timeout: 30000 }).catch(() => {});
    await page.screenshot({ path: path.join(OUT, 'iphone13-anteprima.png') });
    await page.click('#pv-close');
    check('condividi: «indietro» torna all\'editor', await page.isVisible('.totbar'));
    check('condividi: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 7. WhatsApp dove il telefono non condivide file: pulsante con il messaggio
  {
    const sd = seedBase(); sd.preventivi = [{ ...fx.acorpo, cliente: { nome: 'Cliente di prova', telefono: '333 123 4567' } }];
    const { page, ctx } = await open(browser, 'Pixel 7', sd);
    await page.evaluate(() => { try { delete Navigator.prototype.canShare; delete Navigator.prototype.share; } catch (e) {} });
    await page.waitForSelector('[data-open]');
    await page.click('[data-open="acorpo"]');
    await page.click('.totbar [data-act="preview"]');
    await page.waitForSelector('#pv-actions:not([hidden])', { timeout: 30000 }).catch(() => {});
    const href = await page.getAttribute('#pv-wa', 'href').catch(() => null);
    check('whatsapp senza condivisione file: pulsante con numero e messaggio', !!href && href.startsWith('https://wa.me/393331234567?text=') && decodeURIComponent(href).includes('Buongiorno Cliente di prova'), href);
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} controlli falliti` : '\nTutti i controlli superati');
  process.exit(failures ? 1 : 0);
})();
