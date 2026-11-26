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
      navigator.share = async d => { window.__shared = { n: d.files.length, name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }; };
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
    await page.screenshot({ path: path.join(OUT, 'iphone13-anteprima.png') });
    await page.click('#pv-close');
    check('condividi: «indietro» torna all\'editor', await page.isVisible('.totbar'));
    check('condividi: nessun errore', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} controlli falliti` : '\nTutti i controlli superati');
  process.exit(failures ? 1 : 0);
})();
