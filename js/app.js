// Nazifoski Preventivi: interfaccia. Dati su Firestore (o in memoria con ?test=1).
import { num, isExpr, calc, fmtEur, fmtNum, fmtDate, today, numStr, nextNumero, duplicati, round2 } from './calc.js';
import { createStore, importa, localeHasData, FB_URL } from './store.js';
import { createAuth, isIosStandalone, messaggioErrore } from './auth.js';
import { righeDaPdf, leggiPreventivo, categoriaDa } from './pdfimport.js';
import { LISTINO_RIMINI, pianoListino } from './listino-rimini.js';
import { VERSIONE } from './versione.js';
import { firebaseConfig } from '../firebase-config.js';

const PARAMS = new URLSearchParams(location.search);
const TEST = PARAMS.has('test');
// ?emu=127.0.0.1 collega l'app agli emulatori Firebase locali (solo per le prove: npm run test:e2e).
const EMU = /^(127\.0\.0\.1|localhost)$/.test(PARAMS.get('emu') || '') ? PARAMS.get('emu') : null;
const EMU_CONFIG = { apiKey: 'demo-key', authDomain: 'demo-nazifoski.firebaseapp.com', projectId: 'demo-nazifoski', appId: 'demo-app' };

/* ---------- Costanti ---------- */
const STATI = [['bozza', 'Bozza'], ['inviato', 'Inviato'], ['accettato', 'Accettato'], ['rifiutato', 'Rifiutato']];
const UM = ['mq', 'ml', 'mc', 'cad', 'kg', 'q', 't', 'h', 'gg', 'a corpo'];
const IVA = [[10, '10% (ristrutturazione e manutenzione abitazioni)'], [22, '22% (aliquota ordinaria)'], [4, '4% (prima casa / nuova costruzione)'], [0, '0% (esente o non applicata)']];
const SEZ_RAPIDE = ['Demolizioni e rimozioni', 'Impianto idraulico', 'Impianto elettrico', 'Massetti e pavimenti', 'Rivestimenti', 'Cartongesso', 'Tinteggiatura', 'Copertura', 'Facciate e balconi', 'Smaltimento e pulizia'];
export const AZIENDA_BASE = {
  ragione: 'Impresa Edile Nazifoski', indirizzo: 'Via Villagrande 24, Rimini (RN)', telefono: '+39 352 203 7037',
  email: 'info@nazifoski.it', sito: 'www.nazifoski.it', piva: '03286630409', rea: 'RN-285905', iban: '',
  ivaDefault: 10, tempi: '', pagamento: '', note: '', firma: false
};

/* ---------- Stato ---------- */
const S = {
  view: 'lista', user: null, persone: [], started: false,
  loaded: { preventivi: false, listino: false, clienti: false },
  preventivi: [], listino: [], clienti: [], azienda: { ...AZIENDA_BASE },
  current: null, base: null, seen: false, gone: false, filter: 'tutti', q: '', lq: '', cq: '', sync: { online: true, pending: false }
};
let auth = null, store = null, unsubs = [];

/* ---------- Utilità ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const opt = (list, val) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('');
const DEL = Symbol('del');

const IC = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z"/></svg>'
};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3000);
}

/* ---------- Indietro (gesto Android, tasto del browser) ---------- */
// Finché c'è qualcosa di aperto (editor, finestra, anteprima) la cronologia ha UNA voce in più:
// «Indietro» chiude la cosa in cima. history.back() arriva in ritardo, quindi finché non è arrivato
// non si aggiunge una voce nuova (altrimenti il ritorno successivo uscirebbe dall'app).
const layers = [];
let hasEntry = false, backPending = false;
function ensureEntry() { if (layers.length && !hasEntry && !backPending) { history.pushState({ nz: 1 }, ''); hasEntry = true; } }
function openLayer(name, onBack) { layers.push({ name, onBack }); ensureEntry(); }
function closeLayer(name) {
  const i = layers.map(l => l.name).lastIndexOf(name);
  if (i < 0) return;
  layers.splice(i);
  if (!layers.length && hasEntry) { hasEntry = false; backPending = true; history.back(); }
}
addEventListener('popstate', () => {
  if (backPending) { backPending = false; ensureEntry(); return; }
  hasEntry = false;
  const l = layers.pop();
  if (l) l.onBack();
  ensureEntry();
});

/* ---------- Schermate di accesso ---------- */
const logoHtml = '<img class="logo l1" src="img/logo.png" alt="Impresa Edile Nazifoski" width="220" height="59"><img class="logo l2" src="img/logo-chiaro.png" alt="" width="220" height="59">';
function showScreen(id, html) {
  $('#boot').hidden = true; $('#app').hidden = true;
  const s = $('#screen'); s.innerHTML = `<div class="auth" id="${id}"><div class="auth-card">${logoHtml}${html}</div></div>`; s.hidden = false;
}
function showApp() { $('#boot').hidden = true; $('#screen').hidden = true; $('#screen').innerHTML = ''; $('#app').hidden = false; }

function showLogin(mode = 'accedi', note = '') {
  const ios = isIosStandalone();
  const google = `<button class="btn block gbtn" type="button" id="l-google">${IC.google} Accedi con Google</button>`;
  const form = `<form id="l-form" class="auth-card" style="gap:12px" novalidate>
      <label class="field"><span>Email</span><input class="in" id="l-email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" enterkeyhint="next" required></label>
      <label class="field"><span>Password</span><input class="in" id="l-pw" type="password" autocomplete="${mode === 'crea' ? 'new-password' : 'current-password'}" enterkeyhint="go" required minlength="6"></label>
      <button class="btn primary block" type="submit">${mode === 'crea' ? 'Crea account' : 'Accedi'}</button>
      <div class="links">
        <button class="link" type="button" id="l-mode">${mode === 'crea' ? 'Ho già un account' : 'Crea account'}</button>
        ${mode === 'crea' ? '' : '<button class="link" type="button" id="l-reset">Password dimenticata?</button>'}
      </div>
    </form>`;
  showScreen('login', `<h1>${mode === 'crea' ? 'Crea il tuo account' : 'Preventivi'}</h1>
    <p>${mode === 'crea' ? 'Dopo la registrazione ti arriva un\'email per confermare l\'indirizzo.' : 'Accedi per vedere e creare i preventivi.'}</p>
    <div id="l-msg" class="msg ${note ? 'info' : ''}" ${note ? '' : 'hidden'}>${esc(note)}</div>
    ${ios ? form + '<div class="sep">oppure</div>' + google + '<p style="font-size:13px">Se Google non si apre su iPhone, usa email e password.</p>' : google + '<div class="sep">oppure con email</div>' + form}`);
  const msg = (t, kind = 'err') => { const m = $('#l-msg'); m.textContent = t; m.className = 'msg ' + kind; m.hidden = !t; };
  const busy = on => $$('#login button').forEach(b => { b.disabled = on; });
  $('#l-google').onclick = async () => { busy(true); try { await auth.signInGoogle(); } catch (e) { msg(messaggioErrore(e)); } busy(false); };
  $('#l-mode').onclick = () => showLogin(mode === 'crea' ? 'accedi' : 'crea');
  const reset = $('#l-reset');
  if (reset) reset.onclick = async () => {
    const email = $('#l-email').value.trim();
    if (!email) { msg('Scrivi la tua email, poi tocca di nuovo «Password dimenticata?».'); $('#l-email').focus(); return; }
    try { await auth.resetPassword(email); msg('Ti abbiamo mandato un\'email per scegliere una nuova password.', 'ok'); } catch (e) { msg(messaggioErrore(e)); }
  };
  $('#l-form').onsubmit = async e => {
    e.preventDefault();
    const email = $('#l-email').value.trim(), pw = $('#l-pw').value;
    if (!email || !pw) { msg('Scrivi email e password.'); return; }
    busy(true);
    try { mode === 'crea' ? await auth.signUpEmail(email, pw) : await auth.signInEmail(email, pw); }
    catch (err) { msg(messaggioErrore(err)); }
    busy(false);
  };
}

function showVerify(u) {
  showScreen('verifica', `<h1>Conferma la tua email</h1>
    <p>Abbiamo mandato un link a <b>${esc(u.email)}</b>. Aprilo, poi torna qui e tocca «Ho confermato».</p>
    <div id="v-msg" class="msg" hidden></div>
    <button class="btn primary block" type="button" id="v-ok">Ho confermato</button>
    <button class="btn block" type="button" id="v-again">Rimanda l'email</button>
    <button class="link" type="button" id="v-out">Esci</button>`);
  const msg = (t, k = 'err') => { const m = $('#v-msg'); m.textContent = t; m.className = 'msg ' + k; m.hidden = false; };
  $('#v-ok').onclick = async () => { const nu = await auth.reload(); if (nu && nu.verified) onUser(nu); else msg('L\'indirizzo non risulta ancora confermato. Controlla anche nella posta indesiderata.'); };
  $('#v-again').onclick = async () => { try { await auth.resendVerification(); msg('Email inviata di nuovo.', 'ok'); } catch (e) { msg(messaggioErrore(e)); } };
  $('#v-out').onclick = () => auth.signOut();
}

function showWaiting() {
  stopData();
  showScreen('attesa', `<h1>Accesso in attesa</h1>
    <p>Sei entrato come <b>${esc(S.user?.email)}</b>, ma questo indirizzo non è ancora autorizzato.</p>
    <p>Chiedi al titolare di aggiungerlo in <b>Impostazioni → Persone autorizzate</b>, poi tocca «Riprova».</p>
    <button class="btn primary block" type="button" id="w-retry">Riprova</button>
    <button class="link" type="button" id="w-out">Esci</button>`);
  $('#w-retry').onclick = () => startData();
  $('#w-out').onclick = () => esci();
}

async function esci() {
  try { await auth.signOut(); } catch (e) {}
  try { await store.clearLocal(); } catch (e) { console.warn(e); }
  location.reload();
}

/* ---------- Avvio ---------- */
async function boot() {
  let app = null;
  const seed = TEST ? (window.NZ_TEST_SEED || {}) : {};
  try {
    if (!TEST) {
      const config = EMU ? EMU_CONFIG : firebaseConfig;
      if (config) {
        const { initializeApp } = await import(FB_URL + 'firebase-app.js');
        app = initializeApp(config);
      }
    }
    // Senza configurazione Firebase: dati «solo su questo telefono», senza accesso.
    const kind = TEST ? 'test' : app ? 'online' : 'locale';
    auth = await createAuth(kind === 'test' ? 'fake' : kind === 'online' ? 'firebase' : 'locale', { app, user: seed.user, emulator: EMU });
    store = await createStore(kind === 'test' ? 'memory' : kind === 'online' ? 'firestore' : 'locale', { app, emulator: EMU, deny: !!seed.deny, seed: { preventivi: seed.preventivi, listino: seed.listino, clienti: seed.clienti, impostazioni: seed.impostazioni } });
    store.onSync(s => { S.sync = s; renderSync(); });
    auth.onUser(onUser);
  } catch (e) {
    console.error(e);
    showScreen('errore', '<h1>Non riesco ad aprire l\'app</h1><p>Controlla la connessione a internet e riprova.</p><button class="btn primary block" type="button" onclick="location.reload()">Riprova</button>');
  }
}

function onUser(u) {
  S.user = u;
  if (!u) { stopData(); showLogin(); return; }
  if (!u.verified) { stopData(); showVerify(u); return; }
  startData();
}

function stopData() { unsubs.forEach(f => f()); unsubs = []; S.started = false; }

function denied(err) { return err && (err.code === 'permission-denied' || /insufficient permissions/i.test(err.message || '')); }
function dataError(err) {
  if (denied(err)) { showWaiting(); return; }
  console.error(err);
  toast('Non riesco a leggere i dati. Controlla la connessione.');
}

function startData() {
  stopData();
  unsubs.push(store.subscribeDoc('accesso/persone', d => {
    S.persone = (d && Array.isArray(d.emails)) ? d.emails : [];
    if (!S.started) {
      S.started = true;
      startCollections();
      showApp();
      render();
    } else if (S.view === 'impostazioni') renderPeople();
  }, dataError));
}

let localeDaTrasferire = null;
async function controllaLocale() {
  if (TEST || !S.user || S.user.locale) return;
  try { if (localStorage.getItem('nz-locale-trasferito') === '1') return; } catch (e) {}
  const loc = await localeHasData();
  if (!loc) return;
  localeDaTrasferire = loc;
  if (S.view === 'lista') renderLista(true);
}
async function trasferisciLocale() {
  if (!localeDaTrasferire) return;
  try {
    const r = await importa(store, localeDaTrasferire.exportAll());
    try { localStorage.setItem('nz-locale-trasferito', '1'); } catch (e) {}
    localeDaTrasferire = null;
    renderLista(true);
    toast(r.creati ? `Trasferiti ${r.creati} elementi nell'archivio online` : 'Era già tutto online');
  } catch (e) { toast('Trasferimento non riuscito. Riprova.'); }
}
function trasferimentoBanner() {
  if (!localeDaTrasferire) return '';
  const d = localeDaTrasferire.exportAll();
  return `<div class="note" id="trasferisci"><span>Su questo telefono ci sono dati salvati prima del collegamento online: ${d.preventivi.length} preventivi, ${d.listino.length} voci di listino, ${d.clienti.length} clienti.</span><button class="btn primary" type="button" data-act="trasferisci">Trasferiscili online</button></div>`;
}

function startCollections() {
  controllaLocale();
  for (const name of ['preventivi', 'listino', 'clienti']) {
    unsubs.push(store.subscribe(name, list => {
      S[name] = list; S.loaded[name] = true;
      render(true);
    }, dataError));
  }
  unsubs.push(store.subscribeDoc('impostazioni/azienda', d => {
    S.azienda = { ...AZIENDA_BASE, ...(d || {}) };
    if (S.view !== 'impostazioni') render(true);
  }, dataError));
}

function renderSync() {
  const el = $('#sync'); if (!el) return;
  const { online, pending } = S.sync;
  el.hidden = online && !pending;
  el.classList.toggle('pend', online && pending);
  el.textContent = !online ? 'Offline' : 'Invio in corso…';
  el.title = !online ? 'Senza rete: le modifiche restano sul dispositivo e vengono inviate appena torna la connessione.' : '';
}

/* ---------- Salvataggio ---------- */
function setSaveState(s) {
  const el = $('#saveState'); if (!el) return;
  el.classList.toggle('err', s === 'err');
  el.textContent = s === 'saving' ? 'Salvataggio…' : s === 'saved' ? 'Salvato' : s === 'offline' ? 'Salvato sul dispositivo' : s === 'err' ? 'Non salvato' : '';
}
function write(coll, id, data) {
  const p = data === DEL ? store.remove(coll, id) : store.save(coll, id, data);
  if (!S.sync.online) setSaveState('offline');
  return p.then(() => setSaveState('saved')).catch(err => {
    setSaveState('err');
    toast(denied(err) ? 'Non hai il permesso di modificare questi dati.' : 'Salvataggio non riuscito. Riprova.');
  });
}

/* ---------- Navigazione ---------- */
const main = $('#main');
function go(view) {
  if (S.view === 'editor' && view !== 'editor') { flushEditor(); S.current = null; closeLayer('editor'); }
  S.view = view;
  render();
  window.scrollTo(0, 0);
}
$$('#app [data-view]').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
$('#brand').addEventListener('click', () => go('lista'));

function render(fromData) {
  document.body.classList.toggle('in-editor', S.view === 'editor');
  $$('#app [data-view]').forEach(t => t.setAttribute('aria-current', (t.dataset.view === S.view || (S.view === 'editor' && t.dataset.view === 'lista')) ? 'page' : 'false'));
  if (S.view !== 'editor') $('#totbar').innerHTML = '';
  if (S.view === 'lista') return renderLista(fromData);
  if (S.view === 'listino') return fromData && $('#lq') ? renderListinoRows() : renderListino();
  if (S.view === 'clienti') return fromData && $('#cq') ? renderClientiRows() : renderClienti();
  if (S.view === 'impostazioni') return fromData ? null : renderImpostazioni();
  if (S.view === 'editor') return fromData ? refreshEditorData() : renderEditor();
}
function enter() { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { main.classList.remove('view-enter'); void main.offsetWidth; main.classList.add('view-enter'); } }

/* ---------- Elenco ---------- */
function rowState(p) { return STATI.find(x => x[0] === p.stato) || STATI[0]; }
function sorted(list) {
  return list.slice().sort((a, b) => (a.esempio ? 1 : 0) - (b.esempio ? 1 : 0) || (b.anno || 0) - (a.anno || 0) || (b.numero || 0) - (a.numero || 0));
}
function renderLista(fromData) {
  const ae = document.activeElement; const keep = ae && ae.id === 'q' ? ae.selectionStart : null;
  const all = S.preventivi;
  const anno = new Date().getFullYear();
  const sumOf = arr => arr.reduce((t, p) => t + totaleDi(p), 0);
  const bozze = all.filter(p => p.stato === 'bozza' && !p.esempio);
  const attesa = all.filter(p => p.stato === 'inviato' && !p.esempio);
  const acc = all.filter(p => p.stato === 'accettato' && !p.esempio && String(p.data || '').startsWith(String(anno)));
  const dups = duplicati(all);
  const q = S.q.trim().toLowerCase();
  let rows = sorted(all).filter(p => S.filter === 'tutti' || p.stato === S.filter);
  if (q) rows = rows.filter(p => [numStr(p), p.cliente?.nome, p.oggetto, p.cantiere].join(' ').toLowerCase().includes(q));
  const sum = (k, color, label, list, word) => `<button class="sum" data-filter="${k}" type="button" aria-pressed="${S.filter === k}"><span class="k"><i style="background:var(${color})"></i>${label}</span><span class="v">${fmtEur(sumOf(list))}</span><span class="c">${list.length} ${word(list.length)}</span></button>`;
  main.innerHTML = `
    ${installBanner()}
    ${trasferimentoBanner()}
    <div class="head">
      <div><span class="eyebrow">${S.user && S.user.locale ? 'Dati solo su questo telefono' : 'Impresa Edile Nazifoski'}</span><h1>Preventivi</h1></div>
      <button class="btn primary" data-act="new" type="button">${IC.plus} Nuovo preventivo</button>
    </div>
    <div class="summary">
      ${sum('bozza', '--stone', 'Da completare', bozze, n => (n === 1 ? 'bozza' : 'bozze'))}
      ${sum('inviato', '--blue', 'Inviati, in attesa di risposta', attesa, n => (n === 1 ? 'preventivo' : 'preventivi'))}
      ${sum('accettato', '--ok', `Accettati nel ${anno}`, acc, n => (n === 1 ? 'lavoro confermato' : 'lavori confermati'))}
    </div>
    <div class="toolbar">
      <input class="in search" id="q" type="search" enterkeyhint="search" placeholder="Cerca per cliente, lavoro o numero" value="${esc(S.q)}" aria-label="Cerca preventivi">
      <div class="chips" role="group" aria-label="Filtra per stato">
        ${[['tutti', 'Tutti'], ...STATI].map(([k, l]) => `<button class="chip" type="button" data-filter="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="list" id="rows">
      ${!S.loaded.preventivi ? '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>' :
        rows.length ? rows.map(p => rowHtml(p, dups.has(p.id))).join('') :
        all.length ? '<div class="empty"><h3>Nessun preventivo trovato</h3><p>Prova a cambiare la ricerca o il filtro.</p></div>' :
        `<div class="empty"><h3>Ancora nessun preventivo</h3><p>Crea il primo: scegli le lavorazioni dal listino, l'app fa i conti e impagina il PDF da sola.</p><button class="btn primary" data-act="new" type="button">${IC.plus} Nuovo preventivo</button></div>`}
    </div>`;
  const qi = $('#q');
  qi.addEventListener('input', () => { S.q = qi.value; renderLista(); });
  if (keep !== null) { qi.focus(); try { qi.setSelectionRange(keep, keep); } catch (e) {} }
  bindInstall();
  if (!fromData) enter();
}
function rowHtml(p, dup) {
  const [sk, sl] = rowState(p);
  return `<button class="row" type="button" data-open="${esc(p.id)}">
    <span class="n">${esc(numStr(p))}${dup ? '<span class="dup">Numero già usato</span>' : ''}</span>
    <span class="who"><b>${esc(p.cliente?.nome || 'Cliente senza nome')}</b><span>${esc(p.oggetto || p.cantiere || 'Lavori da descrivere')}</span></span>
    <span class="st"><span class="pill st-${sk}">${sl}</span></span>
    <span class="amt">${fmtEur(totaleDi(p))}<small>${esc(fmtDate(p.data))}</small></span>
  </button>`;
}

const totaleDi = p => (Array.isArray(p.sezioni) ? calc(p).totale : Number(p.totale) || 0);

/* ---------- Nuovo / apri ---------- */
function nuovoPreventivo(cliente) {
  const a = S.azienda; const anno = new Date().getFullYear();
  return {
    id: uid(), anno, numero: nextNumero(S.preventivi, anno), data: today(), stato: 'bozza', esempio: false,
    cliente: { nome: '', indirizzo: '', cfpiva: '', telefono: '', email: '', ...(cliente || {}) },
    cantiere: '', oggetto: '',
    sezioni: [{ id: uid(), titolo: '', voci: [{ id: uid(), desc: '', um: 'mq', qta: '', prezzo: '' }] }],
    sconto: { tipo: '%', valore: '' }, iva: Number(a.ivaDefault ?? 10), dettaglio: 'voci',
    tempi: a.tempi || '', pagamento: a.pagamento || '', note: a.note || '',
    creato: new Date().toISOString()
  };
}
function openEditor(p) {
  if (S.view === 'editor') flushEditor(); else openLayer('editor', () => { flushEditor(); S.current = null; S.view = 'lista'; render(); });
  S.current = clone(p); S.base = p.modificato || null; S.seen = false; S.gone = false;
  S.view = 'editor'; render(); window.scrollTo(0, 0);
}

/* ---------- Editor ---------- */
let saveTimer = null;
function markDirty() { if (S.gone) return; clearTimeout(saveTimer); setSaveState('saving'); saveTimer = setTimeout(saveCurrent, 600); }
function saveCurrent() {
  clearTimeout(saveTimer); saveTimer = null;
  const p = S.current; if (!p || S.gone) return;
  p.totale = calc(p).totale; p.modificato = new Date().toISOString(); S.base = p.modificato;
  const { id, ...data } = p;
  write('preventivi', id, data);
}
function flushEditor() { if (saveTimer) saveCurrent(); }

function voceHtml(v, si, vi, nv) {
  return `<div class="voce" data-voce="${vi}">
    <span class="vn">${si + 1}.${vi + 1}</span>
    <div class="d"><span class="lbl">Descrizione</span><textarea class="in" rows="1" data-v="desc" enterkeyhint="next" placeholder="Es. Posa pavimento in gres porcellanato 60×60" aria-label="Descrizione voce ${si + 1}.${vi + 1}">${esc(v.desc)}</textarea></div>
    <div class="u"><span class="lbl">U.M.</span><select class="in" data-v="um" aria-label="Unità di misura">${opt(UM.map(u => [u, u]), v.um)}</select></div>
    <div class="q"><span class="lbl">Quantità</span><input class="in r" data-v="qta" inputmode="decimal" enterkeyhint="next" placeholder="${v.um === 'a corpo' ? '1' : 'es. 3,5*4'}" value="${esc(v.qta)}" aria-label="Quantità"><span class="calc"></span></div>
    <div class="p"><span class="lbl">Prezzo €</span><input class="in r" data-v="prezzo" inputmode="decimal" enterkeyhint="done" placeholder="0,00" value="${esc(v.prezzo)}" aria-label="Prezzo unitario"><span class="calc"></span></div>
    <div class="imp"><span class="lbl">Importo</span><span class="iv">—</span></div>
    <div class="tools">
      <button class="icon-btn" type="button" data-act="vSave" aria-label="Salva nel listino">${IC.star}</button>
      <button class="icon-btn" type="button" data-act="vUp" aria-label="Sposta su"${vi === 0 ? ' disabled' : ''}>${IC.up}</button>
      <button class="icon-btn" type="button" data-act="vDown" aria-label="Sposta giù"${vi === nv - 1 ? ' disabled' : ''}>${IC.down}</button>
      <button class="icon-btn del" type="button" data-act="vDel" aria-label="Elimina voce">${IC.trash}</button>
    </div>
  </div>`;
}
function sezHtml(s, si, n) {
  return `<section class="sez" data-sez="${si}">
    <div class="sez-h">
      <span class="sn">${si + 1}</span>
      <input data-s="titolo" value="${esc(s.titolo)}" placeholder="Titolo sezione (es. Demolizioni)" aria-label="Titolo sezione ${si + 1}" enterkeyhint="next">
      <span class="st">—</span>
      <span class="tools">
        <button class="icon-btn" type="button" data-act="sUp" aria-label="Sposta sezione su"${si === 0 ? ' disabled' : ''}>${IC.up}</button>
        <button class="icon-btn" type="button" data-act="sDown" aria-label="Sposta sezione giù"${si === n - 1 ? ' disabled' : ''}>${IC.down}</button>
        <button class="icon-btn del" type="button" data-act="sDel" aria-label="Elimina sezione">${IC.trash}</button>
      </span>
    </div>
    <div class="vhead"><span>N.</span><span>Descrizione</span><span>U.M.</span><span class="r">Quantità</span><span class="r">Prezzo €</span><span class="r">Importo</span><span></span></div>
    ${s.voci.map((v, vi) => voceHtml(v, si, vi, s.voci.length)).join('')}
    <div class="sez-f">
      <button class="btn" type="button" data-act="vAdd">${IC.plus} Voce</button>
      <button class="btn" type="button" data-act="vPick">${IC.list} Dal listino</button>
    </div>
  </section>`;
}
function dupNote(p) {
  if (p.esempio || !duplicati(S.preventivi.map(x => (x.id === p.id ? { ...x, anno: p.anno, numero: p.numero } : x))).has(p.id)) return '';
  return `<div class="note bad" id="dupnote"><span>Il numero ${esc(numStr(p))} è già usato da un altro preventivo.</span><button class="btn" type="button" data-act="renumber">Assegna nuovo numero</button></div>`;
}
function renderEditor() {
  const p = S.current;
  const sez = p.sezioni;
  main.innerHTML = `
    <div class="ed-top">
      <button class="btn ghost" type="button" data-act="back" aria-label="Torna ai preventivi">${IC.back}<span class="back-label">Preventivi</span></button>
      <div class="ttl"><span class="eyebrow">Preventivo</span><h1>${esc(numStr(p))}</h1></div>
      <span class="savestate" id="saveState" aria-live="polite"></span>
      <div class="ed-actions">
        <button class="btn" type="button" data-act="dup">Duplica</button>
        <button class="btn danger" type="button" data-act="del">Elimina</button>
        <button class="btn primary" type="button" data-act="preview">${IC.doc} Anteprima e PDF</button>
      </div>
    </div>
    <div id="dupwrap">${dupNote(p)}</div>
    ${p.esempio ? '<div class="note">Questo è un preventivo di esempio, con prezzi indicativi. Usalo per provare l\'app, poi eliminalo o duplicalo come base per uno vero.</div>' : ''}
    <section class="card">
      <h2>Dati del preventivo</h2>
      <div class="grid">
        ${p.esempio ? '' : `<label class="field"><span>Numero (${p.anno})</span><input class="in" id="f-num" type="number" inputmode="numeric" min="1" data-f="numero" data-t="num" value="${esc(p.numero)}"></label>`}
        <label class="field"><span>Data</span><input class="in" id="f-data" type="date" data-f="data" value="${esc(p.data)}"></label>
        <label class="field"><span>Stato</span><select class="in" id="f-stato" data-f="stato">${opt(STATI, p.stato)}</select></label>
      </div>
    </section>
    <section class="card">
      <h2>Cliente <small>se è in rubrica, i dati si compilano da soli</small></h2>
      <div class="grid two">
        <label class="field"><span>Nome e cognome / Ragione sociale</span><input class="in" id="f-cnome" list="dl-clienti" autocomplete="off" autocapitalize="words" data-f="cliente.nome" value="${esc(p.cliente.nome)}"></label>
        <label class="field"><span>Indirizzo</span><input class="in" id="f-cind" autocomplete="off" data-f="cliente.indirizzo" value="${esc(p.cliente.indirizzo)}"></label>
        <label class="field"><span>Codice fiscale / P.IVA</span><input class="in" id="f-ccf" autocapitalize="characters" data-f="cliente.cfpiva" value="${esc(p.cliente.cfpiva)}"></label>
        <label class="field"><span>Telefono</span><input class="in" id="f-ctel" type="tel" inputmode="tel" data-f="cliente.telefono" value="${esc(p.cliente.telefono)}"></label>
        <label class="field"><span>Email</span><input class="in" id="f-cmail" type="email" inputmode="email" autocapitalize="off" data-f="cliente.email" value="${esc(p.cliente.email)}"></label>
        <div class="field" style="justify-content:flex-end"><button class="btn" type="button" data-act="cSave">Salva cliente in rubrica</button></div>
      </div>
      <datalist id="dl-clienti"></datalist>
    </section>
    <section class="card">
      <h2>Lavori</h2>
      <div class="grid two">
        <label class="field"><span>Oggetto del preventivo</span><input class="in" id="f-ogg" data-f="oggetto" placeholder="Es. Rifacimento completo bagno" value="${esc(p.oggetto)}"></label>
        <label class="field"><span>Indirizzo del cantiere</span><input class="in" id="f-cant" data-f="cantiere" placeholder="Se diverso dall'indirizzo del cliente" value="${esc(p.cantiere)}"></label>
      </div>
    </section>
    <div id="sezioni">${sez.map((s, si) => sezHtml(s, si, sez.length)).join('')}</div>
    <div class="add-sez">
      <button class="btn" type="button" data-act="sAdd">${IC.plus} Aggiungi sezione</button>
      <span class="hint">oppure tocca un titolo:</span>
      <div class="chips">${SEZ_RAPIDE.map(t => `<button class="chip" type="button" data-act="sAddT" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    </div>
    <section class="card">
      <h2>Sconto e IVA</h2>
      <div class="grid">
        <label class="field"><span>Sconto</span><input class="in" id="f-sc" inputmode="decimal" data-f="sconto.valore" placeholder="nessuno" value="${esc(p.sconto?.valore)}"></label>
        <label class="field"><span>Tipo di sconto</span><select class="in" id="f-sct" data-f="sconto.tipo">${opt([['%', 'Percentuale (%)'], ['€', 'Importo fisso (€)']], p.sconto?.tipo || '%')}</select></label>
        <label class="field" style="grid-column: 1 / -1"><span>IVA</span><select class="in" id="f-iva" data-f="iva" data-t="num">${opt(IVA, p.iva)}</select></label>
      </div>
    </section>
    <section class="card">
      <h2>Cosa mostrare al cliente nel PDF</h2>
      <div class="radios">
        ${[['voci', 'Tutti i prezzi', 'Quantità, prezzo unitario e importo di ogni voce'], ['sezioni', 'Totali per sezione', 'Le voci con le quantità; il totale di ogni sezione'], ['totale', 'Solo il totale', 'Le voci con le quantità e il prezzo complessivo']].map(([k, b, s]) =>
          `<label class="radio"><input type="radio" name="dett" id="f-det-${k}" data-f="dettaglio" value="${k}"${(p.dettaglio || 'voci') === k ? ' checked' : ''}><span><b>${b}</b><span>${s}</span></span></label>`).join('')}
      </div>
    </section>
    <section class="card">
      <h2>Condizioni <small>i testi predefiniti si cambiano in Impostazioni</small></h2>
      <div class="grid two">
        <label class="field"><span>Tempi di esecuzione</span><textarea class="in" id="f-tempi" data-f="tempi" placeholder="Es. Circa 15 giorni lavorativi dall'inizio lavori">${esc(p.tempi)}</textarea></label>
        <label class="field"><span>Modalità di pagamento</span><textarea class="in" id="f-pag" data-f="pagamento" placeholder="Es. 30% all'accettazione, saldo a fine lavori">${esc(p.pagamento)}</textarea></label>
        <label class="field" style="grid-column: 1 / -1"><span>Note ed esclusioni</span><textarea class="in" id="f-note" data-f="note" placeholder="Es. Sono esclusi i lavori non indicati nel presente preventivo">${esc(p.note)}</textarea></label>
      </div>
    </section>`;
  $('#totbar').innerHTML = `<div class="totbar"><div class="wrap">
    <div class="t sm" id="t-lordo-w"><span>Lavori</span><b id="t-lordo">—</b></div>
    <div class="t sm" id="t-sc-w"><span>Sconto</span><b id="t-sc">—</b></div>
    <div class="t mid"><span>Imponibile</span><b id="t-imp">—</b></div>
    <div class="t"><span id="t-ival">IVA</span><b id="t-iva">—</b></div>
    <div class="t big"><span>Totale</span><b id="t-tot">—</b></div>
    <button class="btn primary" type="button" data-act="preview">${IC.doc} PDF</button>
  </div></div>`;
  refreshDatalist();
  $$('#main textarea[data-v]').forEach(autoGrow);
  updateTotals();
  enter();
}
// Arrivano dati nuovi mentre il preventivo è aperto: modifiche o eliminazione fatte su un altro dispositivo.
function refreshEditorData() {
  refreshDatalist();
  const p = S.current; if (!p) return;
  const remote = S.preventivi.find(x => x.id === p.id);
  const w = $('#dupwrap');
  if (!remote) {
    if (S.seen && !S.gone) {
      S.gone = true; clearTimeout(saveTimer); saveTimer = null; setSaveState('');
      if (w) w.innerHTML = `<div class="note bad" id="gone"><span>Questo preventivo è stato eliminato su un altro dispositivo. Le modifiche non vengono più salvate.</span><button class="btn" type="button" data-act="restore">Ripristinalo</button></div>`;
    }
    return;
  }
  S.seen = true;
  if (S.gone) { S.gone = false; }
  if ((remote.modificato || null) !== S.base) {
    if (!saveTimer) {
      S.current = clone(remote); S.base = remote.modificato || null;
      const y = window.scrollY; renderEditor(); window.scrollTo(0, y);
      toast('Aggiornato con le modifiche fatte su un altro dispositivo');
      return;
    }
    if (w && !$('#conflict')) w.insertAdjacentHTML('afterbegin', `<div class="note bad" id="conflict"><span>Questo preventivo è stato modificato anche su un altro dispositivo. Se continui, le tue modifiche sostituiscono le sue.</span><button class="btn" type="button" data-act="takeRemote">Usa la sua versione</button></div>`);
    return;
  }
  if (w && !$('#conflict')) w.innerHTML = dupNote(p);
}
function refreshDatalist() { const dl = $('#dl-clienti'); if (dl) dl.innerHTML = S.clienti.map(c => `<option value="${esc(c.nome)}"></option>`).join(''); }
function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.max(46, t.scrollHeight + 2) + 'px'; }

function updateTotals() {
  const p = S.current; if (!p) return;
  const c = calc(p);
  $$('#sezioni .sez').forEach(sEl => {
    const si = +sEl.dataset.sez; const cs = c.sez[si]; if (!cs) return;
    $('.sez-h .st', sEl).textContent = fmtEur(cs.tot);
    $$('.voce', sEl).forEach(vEl => {
      const vi = +vEl.dataset.voce; const v = p.sezioni[si].voci[vi]; const cv = cs.voci[vi]; if (!v || !cv) return;
      $('.iv', vEl).textContent = (isFinite(cv.q) && isFinite(cv.pr)) ? fmtEur(cv.imp) : '—';
      const [qc, pc] = $$('.calc', vEl);
      const show = (el, raw, val) => {
        const r = String(raw ?? '').trim();
        if (!r) { el.textContent = ''; el.classList.remove('bad'); return; }
        if (!isFinite(val)) { el.textContent = 'Controlla il numero'; el.classList.add('bad'); return; }
        el.classList.remove('bad'); el.textContent = isExpr(r) ? '= ' + fmtNum(val) : '';
      };
      show(qc, v.qta, cv.q); show(pc, v.prezzo, cv.pr);
    });
  });
  const set = (id, t) => { const el = $('#' + id); if (el) el.textContent = t; };
  set('t-lordo', fmtEur(c.lordo));
  $('#t-sc-w').hidden = !(c.sconto > 0); $('#t-lordo-w').hidden = !(c.sconto > 0);
  set('t-sc', '− ' + fmtEur(c.sconto));
  set('t-imp', fmtEur(c.imponibile));
  set('t-ival', `IVA ${c.aliq}%`);
  set('t-iva', fmtEur(c.iva));
  set('t-tot', fmtEur(c.totale));
}
function setPath(obj, path, val) {
  const ks = path.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}
function fillCliente(nome) {
  const c = S.clienti.find(x => (x.nome || '').trim().toLowerCase() === nome.trim().toLowerCase());
  if (!c) return;
  const p = S.current;
  [['indirizzo', 'f-cind'], ['cfpiva', 'f-ccf'], ['telefono', 'f-ctel'], ['email', 'f-cmail']].forEach(([k, id]) => {
    if (!p.cliente[k] && c[k]) { p.cliente[k] = c[k]; const el = $('#' + id); if (el) el.value = c[k]; }
  });
}

main.addEventListener('input', e => {
  const t = e.target;
  if (S.view === 'impostazioni' && t.dataset.set) return onSettingInput(t);
  if (S.view !== 'editor' || !S.current) return;
  const p = S.current;
  if (t.dataset.f) {
    let v = t.value; if (t.dataset.t === 'num') v = v === '' ? '' : Number(v);
    setPath(p, t.dataset.f, v);
    if (t.dataset.f === 'cliente.nome') fillCliente(t.value);
    if (t.dataset.f === 'numero' && v !== '') { $('.ed-top h1').textContent = numStr(p); $('#dupwrap').innerHTML = dupNote(p); }
  } else if (t.dataset.v) {
    const si = +t.closest('[data-sez]').dataset.sez, vi = +t.closest('[data-voce]').dataset.voce;
    p.sezioni[si].voci[vi][t.dataset.v] = t.value;
    if (t.tagName === 'TEXTAREA') autoGrow(t);
    if (t.dataset.v === 'um') { const q = $('[data-v="qta"]', t.closest('.voce')); if (q) q.placeholder = t.value === 'a corpo' ? '1' : 'es. 3,5*4'; }
  } else if (t.dataset.s) {
    p.sezioni[+t.closest('[data-sez]').dataset.sez][t.dataset.s] = t.value;
  } else return;
  updateTotals(); markDirty();
});

async function onAct(b) {
  const act = b.dataset.act; const p = S.current;
  if (act === 'new') { const np = nuovoPreventivo(); openEditor(np); saveCurrent(); return; }
  if (act === 'lNew') return editListino(null);
  if (act === 'lRimini') return caricaListinoRimini();
  if (act === 'cNew') return editCliente(null);
  if (act === 'paAdd') return addPersona();
  if (act === 'paDel') return removePersona(b.dataset.email);
  if (act === 'logout') return esci();
  if (act === 'help') return showHelp();
  if (act === 'import') return $('#imp-file').click();
  if (act === 'pdfImport') return $('#pdf-file').click();
  if (act === 'backup') return esportaBackup();
  if (act === 'trasferisci') return trasferisciLocale();
  if (!p) return;
  const sEl = b.closest('[data-sez]'); const si = sEl ? +sEl.dataset.sez : -1;
  const vEl = b.closest('[data-voce]'); const vi = vEl ? +vEl.dataset.voce : -1;
  const sez = p.sezioni;
  const rerender = focusSel => { const y = window.scrollY; renderEditor(); window.scrollTo(0, y); markDirty(); if (focusSel) { const f = $(focusSel); if (f) f.focus({ preventScroll: false }); } };
  switch (act) {
    case 'back': go('lista'); break;
    case 'restore': S.gone = false; $('#dupwrap').innerHTML = ''; saveCurrent(); toast('Preventivo ripristinato'); break;
    case 'takeRemote': {
      const remote = S.preventivi.find(x => x.id === p.id);
      clearTimeout(saveTimer); saveTimer = null;
      if (remote) { S.current = clone(remote); S.base = remote.modificato || null; const y = window.scrollY; renderEditor(); window.scrollTo(0, y); }
      break;
    }
    case 'preview': flushEditor(); openPreview(); break;
    case 'renumber': {
      p.numero = nextNumero(S.preventivi.filter(x => x.id !== p.id), Number(p.anno));
      $('.ed-top h1').textContent = numStr(p); const f = $('#f-num'); if (f) f.value = p.numero;
      $('#dupwrap').innerHTML = ''; markDirty(); toast('Nuovo numero: ' + numStr(p)); break;
    }
    case 'dup': {
      flushEditor();
      const anno = new Date().getFullYear();
      const np = { ...clone(p), id: uid(), anno, numero: nextNumero(S.preventivi, anno), data: today(), stato: 'bozza', esempio: false, creato: new Date().toISOString() };
      np.sezioni.forEach(s => { s.id = uid(); s.voci.forEach(v => { v.id = uid(); }); });
      openEditor(np); saveCurrent(); toast('Copia creata: preventivo ' + numStr(np)); break;
    }
    case 'del':
      if (await confirmBox('Eliminare il preventivo ' + numStr(p) + '?', 'Il preventivo viene cancellato per tutti. Non si può annullare.', 'Elimina')) {
        clearTimeout(saveTimer); saveTimer = null; write('preventivi', p.id, DEL); S.current = null; go('lista'); toast('Preventivo eliminato');
      }
      break;
    case 'cSave': {
      const c = p.cliente; if (!c.nome.trim()) { toast('Scrivi prima il nome del cliente'); break; }
      const ex = S.clienti.find(x => (x.nome || '').trim().toLowerCase() === c.nome.trim().toLowerCase());
      write('clienti', ex ? ex.id : uid(), { nome: c.nome.trim(), indirizzo: c.indirizzo, cfpiva: c.cfpiva, telefono: c.telefono, email: c.email });
      toast(ex ? 'Dati del cliente aggiornati in rubrica' : 'Cliente salvato in rubrica'); break;
    }
    case 'sAdd': sez.push({ id: uid(), titolo: '', voci: [{ id: uid(), desc: '', um: 'mq', qta: '', prezzo: '' }] }); rerender(`[data-sez="${sez.length - 1}"] [data-s]`); break;
    case 'sAddT': sez.push({ id: uid(), titolo: b.dataset.t, voci: [{ id: uid(), desc: '', um: 'mq', qta: '', prezzo: '' }] }); rerender(`[data-sez="${sez.length - 1}"] textarea`); break;
    case 'sUp': if (si > 0) { [sez[si - 1], sez[si]] = [sez[si], sez[si - 1]]; rerender(); } break;
    case 'sDown': if (si < sez.length - 1) { [sez[si + 1], sez[si]] = [sez[si], sez[si + 1]]; rerender(); } break;
    case 'sDel': {
      const s = sez[si]; const full = s.voci.some(v => v.desc || v.prezzo || v.qta);
      if (!full || await confirmBox('Eliminare la sezione «' + (s.titolo || 'senza titolo') + '»?', 'Vengono eliminate anche le sue ' + s.voci.length + ' voci.', 'Elimina sezione')) { sez.splice(si, 1); rerender(); }
      break;
    }
    case 'vAdd': sez[si].voci.push({ id: uid(), desc: '', um: 'mq', qta: '', prezzo: '' }); rerender(`[data-sez="${si}"] [data-voce="${sez[si].voci.length - 1}"] textarea`); break;
    case 'vPick': pickListino(si); break;
    case 'vUp': if (vi > 0) { const v = sez[si].voci; [v[vi - 1], v[vi]] = [v[vi], v[vi - 1]]; rerender(); } break;
    case 'vDown': { const v = sez[si].voci; if (vi < v.length - 1) { [v[vi + 1], v[vi]] = [v[vi], v[vi + 1]]; rerender(); } break; }
    case 'vDel': sez[si].voci.splice(vi, 1); rerender(); break;
    case 'vSave': {
      const v = sez[si].voci[vi];
      if (!v.desc.trim()) { toast('Scrivi prima la descrizione della voce'); break; }
      const ex = S.listino.find(x => (x.desc || '').trim().toLowerCase() === v.desc.trim().toLowerCase());
      const pr = num(v.prezzo);
      write('listino', ex ? ex.id : uid(), { desc: v.desc.trim(), um: v.um, prezzo: isFinite(pr) ? round2(pr) : 0, categoria: (ex && ex.categoria) || sez[si].titolo || 'Varie' });
      toast(ex ? 'Prezzo aggiornato nel listino' : 'Voce salvata nel listino'); break;
    }
  }
}
document.addEventListener('click', e => {
  if (!$('#app') || $('#app').hidden) return;
  const filt = e.target.closest('#main [data-filter]');
  if (filt && S.view === 'lista') { S.filter = S.filter === filt.dataset.filter && filt.classList.contains('sum') ? 'tutti' : filt.dataset.filter; renderLista(); return; }
  const open = e.target.closest('#main [data-open]');
  if (open) { const p = S.preventivi.find(x => x.id === open.dataset.open); if (p) openEditor(p); return; }
  const li = e.target.closest('#main [data-li]'); if (li) { const x = S.listino.find(i => i.id === li.dataset.li); if (x) editListino(x); return; }
  const cl = e.target.closest('#main [data-cl]'); if (cl) { const x = S.clienti.find(i => i.id === cl.dataset.cl); if (x) editCliente(x); return; }
  const b = e.target.closest('#main [data-act], #totbar [data-act]');
  if (b) onAct(b);
});

/* ---------- Finestre ---------- */
const modal = $('#modal');
let modalClose = null;
function openModal(html, onClose) {
  modal.innerHTML = html; modal.hidden = false; modalClose = onClose || null;
  openLayer('modal', () => closeModal(false, true));
  const f = $('[autofocus]', modal); if (f && matchMedia('(hover: hover)').matches) f.focus();
}
function closeModal(val, fromBack) {
  if (modal.hidden) return;
  modal.hidden = true; modal.innerHTML = '';
  if (!fromBack) closeLayer('modal');
  const c = modalClose; modalClose = null; if (c) c(val);
}
modal.addEventListener('click', e => { if (e.target === modal) closeModal(false); const b = e.target.closest('[data-close]'); if (b) closeModal(b.dataset.close === 'ok'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(false); });
function confirmBox(title, text, ok) {
  const rosso = /elimina|togli/i.test(ok) ? ' style="background:var(--bad);border-color:var(--bad);color:#fff"' : '';
  return new Promise(res => openModal(`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="cb-t" style="width:min(440px,100%)">
    <div class="sheet-h"><h2 id="cb-t">${esc(title)}</h2></div>
    <div class="sheet-b"><p style="margin:0;color:var(--ink-soft)">${esc(text)}</p></div>
    <div class="sheet-f"><button class="btn" type="button" data-close="no" autofocus>Annulla</button><button class="btn primary" type="button" data-close="ok"${rosso}>${esc(ok)}</button></div>
  </div>`, res));
}

function pickListino(si) {
  const draw = q => {
    q = (q || '').trim().toLowerCase();
    const items = S.listino.filter(x => !q || [x.desc, x.categoria].join(' ').toLowerCase().includes(q));
    if (!S.listino.length) return '<p style="color:var(--ink-soft);margin:0">Il listino è vuoto. Aggiungi voci dalla sezione Listino, oppure salva una voce con il segnalibro accanto alla riga.</p>';
    if (!items.length) return '<p style="color:var(--ink-soft);margin:0">Nessuna voce trovata.</p>';
    const byCat = {};
    items.forEach(x => { (byCat[x.categoria || 'Varie'] = byCat[x.categoria || 'Varie'] || []).push(x); });
    return Object.keys(byCat).sort((a, b) => a.localeCompare(b, 'it')).map(c => `<div class="pick-cat">${esc(c)}</div>` + byCat[c].sort((a, b) => (a.desc || '').localeCompare(b.desc || '', 'it')).map(x =>
      `<button class="pick" type="button" data-pick="${esc(x.id)}"><span>${esc(x.desc)}<small>${esc(x.um)}</small></span><span class="p">${fmtEur(Number(x.prezzo) || 0)}</span></button>`).join('')).join('');
  };
  openModal(`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pk-t">
    <div class="sheet-h"><h2 id="pk-t">Aggiungi dal listino</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="sheet-b fisso" style="padding-bottom:0"><input class="in" id="pk-q" type="search" enterkeyhint="search" placeholder="Cerca lavorazione" autofocus aria-label="Cerca nel listino"></div>
    <div class="sheet-b" id="pk-list">${draw('')}</div>
    <div class="sheet-f"><span class="left" id="pk-n" style="font-size:13.5px;color:var(--stone);align-self:center">Tocca una voce per aggiungerla alla sezione ${si + 1}</span><button class="btn primary" type="button" data-close="ok">Fatto</button></div>
  </div>`, () => { const y = window.scrollY; renderEditor(); window.scrollTo(0, y); });
  $('#pk-q').addEventListener('input', e => { $('#pk-list').innerHTML = draw(e.target.value); });
  let added = 0;
  $('#pk-list').addEventListener('click', e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const x = S.listino.find(i => i.id === b.dataset.pick); if (!x || !S.current) return;
    const voci = S.current.sezioni[si].voci;
    const empty = voci.length === 1 && !voci[0].desc && !voci[0].qta && !voci[0].prezzo;
    const nv = { id: uid(), desc: x.desc, um: x.um || 'mq', qta: x.um === 'a corpo' ? '1' : '', prezzo: String(x.prezzo ?? '').replace('.', ',') };
    if (empty) voci[0] = nv; else voci.push(nv);
    added++; markDirty();
    b.classList.add('added');
    $('#pk-n').textContent = `${added} ${added === 1 ? 'voce aggiunta' : 'voci aggiunte'}. Ricorda le quantità.`;
  });
}

/* ---------- Anteprima PDF ---------- */
async function openPreview() {
  const p = clone(S.current);
  try {
    const m = await import('./pdf.js');
    openLayer('preview', () => m.closePreview(true));
    await m.openPreview(p, S.azienda, {
      onClose: () => closeLayer('preview'),
      onSent: () => { if (S.current && S.current.id === p.id) { S.current.stato = 'inviato'; saveCurrent(); const sel = $('#f-stato'); if (sel) sel.value = 'inviato'; } toast('Preventivo segnato come inviato'); },
      toast
    });
  } catch (e) { console.error(e); toast('Non riesco ad aprire l\'anteprima. Riprova.'); }
}

/* ---------- Listino ---------- */
function renderListino() {
  main.innerHTML = `
    <div class="head"><div><span class="eyebrow">Voci pronte da riusare</span><h1>Listino prezzi</h1></div>
      <div class="head-actions"><button class="btn" type="button" data-act="lRimini">Prezzi medi Rimini</button><button class="btn primary" type="button" data-act="lNew">${IC.plus} Nuova voce</button></div></div>
    <div class="toolbar"><input class="in search" id="lq" type="search" enterkeyhint="search" placeholder="Cerca lavorazione o categoria" value="${esc(S.lq)}" aria-label="Cerca nel listino"></div>
    <div class="tbl" id="lrows"></div>`;
  $('#lq').addEventListener('input', e => { S.lq = e.target.value; renderListinoRows(); });
  renderListinoRows(); enter();
}
function renderListinoRows() {
  const box = $('#lrows'); if (!box) return;
  const q = S.lq.trim().toLowerCase();
  if (!S.loaded.listino) { box.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  if (!S.listino.length) { box.innerHTML = `<div class="empty"><h3>Listino vuoto</h3><p>Aggiungi le lavorazioni che fate più spesso con il loro prezzo: nei preventivi le inserisci con un tocco.</p><button class="btn primary" type="button" data-act="lNew">${IC.plus} Nuova voce</button></div>`; return; }
  const items = S.listino.filter(x => !q || [x.desc, x.categoria].join(' ').toLowerCase().includes(q));
  if (!items.length) { box.innerHTML = '<div class="empty"><p>Nessuna voce trovata.</p></div>'; return; }
  const byCat = {};
  items.forEach(x => { (byCat[x.categoria || 'Varie'] = byCat[x.categoria || 'Varie'] || []).push(x); });
  box.innerHTML = Object.keys(byCat).sort((a, b) => a.localeCompare(b, 'it')).map(c => `<div class="cat">${esc(c)}</div>` + byCat[c].sort((a, b) => (a.desc || '').localeCompare(b.desc || '', 'it')).map(x =>
    `<button class="li" type="button" data-li="${esc(x.id)}"><span class="d">${esc(x.desc)} ${x.indicativo ? '<span class="tag">prezzo indicativo</span>' : ''}</span><span class="u">${esc(x.um)}</span><span class="p">${fmtEur(Number(x.prezzo) || 0)}</span></button>`).join('')).join('');
}
function editListino(x) {
  const isNew = !x; x = x || { desc: '', um: 'mq', prezzo: '', categoria: '' };
  const cats = Array.from(new Set([...S.listino.map(i => i.categoria).filter(Boolean), ...SEZ_RAPIDE])).sort((a, b) => a.localeCompare(b, 'it'));
  openModal(`<form class="sheet" id="lf" role="dialog" aria-modal="true" aria-labelledby="lf-t">
    <div class="sheet-h"><h2 id="lf-t">${isNew ? 'Nuova voce di listino' : 'Modifica voce'}</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="sheet-b">
      <label class="field"><span>Descrizione</span><textarea class="in" id="lf-d" required autofocus>${esc(x.desc)}</textarea></label>
      <div class="grid">
        <label class="field"><span>Unità di misura</span><select class="in" id="lf-u">${opt(UM.map(u => [u, u]), x.um)}</select></label>
        <label class="field"><span>Prezzo (€)</span><input class="in" id="lf-p" inputmode="decimal" value="${esc(String(x.prezzo ?? '').replace('.', ','))}"></label>
      </div>
      <label class="field"><span>Categoria</span><input class="in" id="lf-c" list="lf-cats" value="${esc(x.categoria)}" placeholder="Es. Tinteggiatura"><datalist id="lf-cats">${cats.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
    </div>
    <div class="sheet-f">${isNew ? '' : '<button class="btn danger left" type="button" id="lf-del">Elimina</button>'}<button class="btn" type="button" data-close="no">Annulla</button><button class="btn primary" type="submit">Salva</button></div>
  </form>`);
  $('#lf').addEventListener('submit', e => {
    e.preventDefault();
    const desc = $('#lf-d').value.trim(); if (!desc) { toast('Scrivi la descrizione'); return; }
    const pr = num($('#lf-p').value);
    if ($('#lf-p').value.trim() && !isFinite(pr)) { toast('Controlla il prezzo'); return; }
    write('listino', isNew ? uid() : x.id, { desc, um: $('#lf-u').value, prezzo: isFinite(pr) ? round2(pr) : 0, categoria: $('#lf-c').value.trim() || 'Varie' });
    closeModal(true); toast('Listino aggiornato');
  });
  const del = $('#lf-del');
  if (del) del.onclick = () => { write('listino', x.id, DEL); closeModal(true); toast('Voce eliminata dal listino'); };
}

async function caricaListinoRimini() {
  const piano = pianoListino(S.listino);
  if (!piano.scrivi.length && !piano.elimina.length) { toast('Il listino ha già tutte le voci con i prezzi medi di Rimini'); return; }
  const ok = await confirmBox('Caricare i prezzi medi di Rimini?', `Aggiungo o aggiorno ${piano.scrivi.length} voci con prezzi medi indicativi per la zona di Rimini (IVA esclusa). Le voci che hai modificato tu e quelle prese dai tuoi PDF restano come sono.`, 'Carica');
  if (!ok) return;
  for (const id of piano.elimina) write('listino', id, DEL);
  for (const v of piano.scrivi) { const { id, ...d } = v; write('listino', id, d); }
  toast(`Listino aggiornato: ${piano.scrivi.length} voci con prezzi medi di Rimini`);
}

/* ---------- Clienti ---------- */
function renderClienti() {
  main.innerHTML = `
    <div class="head"><div><span class="eyebrow">Rubrica</span><h1>Clienti</h1></div>
      <button class="btn primary" type="button" data-act="cNew">${IC.plus} Nuovo cliente</button></div>
    <div class="toolbar"><input class="in search" id="cq" type="search" enterkeyhint="search" placeholder="Cerca cliente" value="${esc(S.cq)}" aria-label="Cerca cliente"></div>
    <div class="tbl" id="crows"></div>`;
  $('#cq').addEventListener('input', e => { S.cq = e.target.value; renderClientiRows(); });
  renderClientiRows(); enter();
}
function renderClientiRows() {
  const box = $('#crows'); if (!box) return;
  if (!S.loaded.clienti) { box.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  if (!S.clienti.length) { box.innerHTML = '<div class="empty"><h3>Rubrica vuota</h3><p>I clienti si aggiungono da qui o dal preventivo, con «Salva cliente in rubrica».</p></div>'; return; }
  const q = S.cq.trim().toLowerCase();
  const items = S.clienti.filter(c => !q || [c.nome, c.indirizzo, c.telefono, c.email].join(' ').toLowerCase().includes(q)).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
  if (!items.length) { box.innerHTML = '<div class="empty"><p>Nessun cliente trovato.</p></div>'; return; }
  box.innerHTML = items.map(c => {
    const n = S.preventivi.filter(p => (p.cliente?.nome || '').trim().toLowerCase() === (c.nome || '').trim().toLowerCase()).length;
    return `<button class="li cl" type="button" data-cl="${esc(c.id)}"><span class="d"><b style="font-weight:600">${esc(c.nome)}</b></span><span class="s">${esc([c.indirizzo, c.telefono].filter(Boolean).join(' · '))}</span><span class="p" style="font-weight:400;color:var(--stone);font-size:14px">${n} ${n === 1 ? 'preventivo' : 'preventivi'}</span></button>`;
  }).join('');
}
function editCliente(c) {
  const isNew = !c; c = c || { nome: '', indirizzo: '', cfpiva: '', telefono: '', email: '' };
  openModal(`<form class="sheet" id="cf" role="dialog" aria-modal="true" aria-labelledby="cf-t">
    <div class="sheet-h"><h2 id="cf-t">${isNew ? 'Nuovo cliente' : esc(c.nome)}</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="sheet-b">
      <label class="field"><span>Nome e cognome / Ragione sociale</span><input class="in" id="cf-n" required autocapitalize="words" value="${esc(c.nome)}" autofocus></label>
      <label class="field"><span>Indirizzo</span><input class="in" id="cf-i" value="${esc(c.indirizzo)}"></label>
      <div class="grid">
        <label class="field"><span>Codice fiscale / P.IVA</span><input class="in" id="cf-cf" autocapitalize="characters" value="${esc(c.cfpiva)}"></label>
        <label class="field"><span>Telefono</span><input class="in" id="cf-t2" type="tel" inputmode="tel" value="${esc(c.telefono)}"></label>
      </div>
      <label class="field"><span>Email</span><input class="in" id="cf-e" type="email" inputmode="email" autocapitalize="off" value="${esc(c.email)}"></label>
    </div>
    <div class="sheet-f">${isNew ? '' : '<button class="btn danger left" type="button" id="cf-del">Elimina</button><button class="btn" type="button" id="cf-new">Nuovo preventivo</button>'}<button class="btn" type="button" data-close="no">Annulla</button><button class="btn primary" type="submit">Salva</button></div>
  </form>`);
  const collect = () => ({ nome: $('#cf-n').value.trim(), indirizzo: $('#cf-i').value.trim(), cfpiva: $('#cf-cf').value.trim(), telefono: $('#cf-t2').value.trim(), email: $('#cf-e').value.trim() });
  $('#cf').addEventListener('submit', e => { e.preventDefault(); const d = collect(); if (!d.nome) { toast('Scrivi il nome'); return; } write('clienti', isNew ? uid() : c.id, d); closeModal(true); toast('Cliente salvato'); });
  const del = $('#cf-del'); if (del) del.onclick = () => { write('clienti', c.id, DEL); closeModal(true); toast('Cliente eliminato dalla rubrica'); };
  const nw = $('#cf-new'); if (nw) nw.onclick = () => { const d = collect(); closeModal(true); const np = nuovoPreventivo(d); openEditor(np); saveCurrent(); };
}

/* ---------- Impostazioni ---------- */
let setTimer = null;
function renderImpostazioni() {
  const a = S.azienda; const u = S.user || {};
  const f = (k, l, extra = '') => `<label class="field"><span>${l}</span><input class="in" id="s-${k}" data-set="${k}" value="${esc(a[k])}" ${extra}></label>`;
  const t = (k, l, ph) => `<label class="field"><span>${l}</span><textarea class="in" id="s-${k}" data-set="${k}" placeholder="${esc(ph)}">${esc(a[k])}</textarea></label>`;
  main.innerHTML = `
    <div class="head"><div><span class="eyebrow">Valgono per tutti i nuovi preventivi</span><h1>Impostazioni</h1></div><span class="savestate" id="saveState" aria-live="polite"></span></div>
    <div class="settings">
      ${u.locale ? `<section class="card">
        <h2>Dati solo su questo telefono</h2>
        <p class="help" style="margin:0 0 12px">L'archivio online non è ancora collegato: preventivi, listino e clienti sono salvati solo su questo dispositivo. Fai spesso una copia di sicurezza. Quando colleghi Firebase (ISTRUZIONI, passo 1) potrai trasferirli online.</p>
        <button class="btn primary" type="button" data-act="backup">Esporta copia di sicurezza</button>
      </section>` : `<section class="card">
        <h2>Il tuo account</h2>
        <div class="account"><span>Accesso come <b>${esc(u.email)}</b>${u.isOwner ? ' · titolare' : ''}</span><button class="btn" type="button" data-act="logout">Esci</button></div>
      </section>`}
      ${u.isOwner ? `<section class="card">
        <h2>Persone autorizzate</h2>
        <p class="help">Chi è in questo elenco può vedere e modificare preventivi, listino e clienti. Usa l'email con cui la persona accede (Google o email e password).</p>
        <ul class="people" id="people"></ul>
        <div class="inline"><input class="in" id="pa-email" type="email" inputmode="email" autocapitalize="off" enterkeyhint="done" placeholder="email@esempio.it" aria-label="Email da autorizzare"><button class="btn primary" type="button" data-act="paAdd">Aggiungi</button></div>
      </section>` : ''}
      <section class="card">
        <h2>Dati dell'impresa</h2>
        <p class="help">Compaiono nell'intestazione e a piè di pagina di ogni PDF.</p>
        <div class="grid two">
          ${f('ragione', 'Ragione sociale')}${f('indirizzo', 'Indirizzo della sede')}
          ${f('telefono', 'Telefono', 'type="tel" inputmode="tel"')}${f('email', 'Email', 'type="email" inputmode="email" autocapitalize="off"')}
          ${f('sito', 'Sito internet', 'autocapitalize="off"')}${f('piva', 'P.IVA e C.F.', 'inputmode="numeric"')}
          ${f('rea', 'Numero REA')}${f('iban', 'IBAN per i pagamenti (facoltativo)', 'autocapitalize="characters" placeholder="IT00 X000 0000 0000 0000 0000 000"')}
        </div>
      </section>
      <section class="card">
        <h2>Valori predefiniti</h2>
        <div class="grid"><label class="field"><span>IVA predefinita</span><select class="in" id="s-iva" data-set="ivaDefault" data-t="num">${opt(IVA, a.ivaDefault)}</select></label></div>
      </section>
      <section class="card">
        <h2>Testi predefiniti</h2>
        <p class="help">Vengono copiati in ogni nuovo preventivo; nel singolo preventivo puoi sempre cambiarli.</p>
        <div class="grid two">
          ${t('tempi', 'Tempi di esecuzione', 'Es. Da concordare in base al calendario dei lavori')}
          ${t('pagamento', 'Modalità di pagamento', 'Es. 30% all\'accettazione, saldo a fine lavori')}
          <div style="grid-column:1/-1">${t('note', 'Note ed esclusioni', 'Es. Sono esclusi i lavori non indicati nel presente preventivo')}</div>
        </div>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="s-firma" data-set="firma"${a.firma ? ' checked' : ''}> Aggiungi in fondo al PDF gli spazi per le firme</label>
      </section>
      <section class="card">
        <h2>App sul telefono</h2>
        <p class="help">Installa l'app sulla schermata Home per aprirla come le altre app, anche senza rete.</p>
        <button class="btn" type="button" data-act="help">Come installarla su iPhone e Android</button>
      </section>
      <section class="card">
        <h2>Importa preventivi da PDF</h2>
        <p class="help">Scegli i PDF dei preventivi fatti in passato (anche tanti insieme). Vengono letti su questo dispositivo, senza inviarli a nessuno. Per ognuno controlli quello che è stato capito, correggi se serve e lo salvi: le voci finiscono anche nel listino e i clienti in rubrica.</p>
        <input type="file" id="pdf-file" accept="application/pdf,.pdf" multiple hidden>
        <button class="btn primary" type="button" data-act="pdfImport">Scegli i PDF…</button>
      </section>
      <section class="card">
        <h2>Importa dati</h2>
        <p class="help">Carica il file <b>nazifoski-dati.json</b> con preventivi, listino e clienti dell'app precedente. Vengono aggiunti solo quelli che mancano: puoi ripeterlo senza creare doppioni.</p>
        <input type="file" id="imp-file" accept="application/json,.json" hidden>
        <button class="btn" type="button" data-act="import">Scegli il file…</button>
      </section>
      <p style="text-align:center;color:var(--stone);font-size:13px;margin:18px 0 0">Nazifoski Preventivi · Versione ${esc(VERSIONE)}</p>
      ${u.locale ? '' : `<section class="card">
        <h2>Copia di sicurezza</h2>
        <p class="help">Un file con tutti i preventivi, il listino e i clienti, da conservare o reimportare.</p>
        <button class="btn" type="button" data-act="backup">Esporta copia di sicurezza</button>
      </section>`}
    </div>`;
  renderPeople();
  $('#imp-file').addEventListener('change', onImportFile);
  $('#pdf-file').addEventListener('change', onPdfFiles);
  const pa = $('#pa-email'); if (pa) pa.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPersona(); } });
  enter();
}
function renderPeople() {
  const ul = $('#people'); if (!ul) return;
  const rows = [`<li><span>${esc(S.user.email)} <span class="me">· titolare</span></span></li>`]
    .concat(S.persone.map(e => `<li><span>${esc(e)}</span><button class="icon-btn del" type="button" data-act="paDel" data-email="${esc(e)}" aria-label="Togli ${esc(e)}">${IC.trash}</button></li>`));
  ul.innerHTML = rows.join('');
}
function addPersona() {
  const inp = $('#pa-email'); const email = (inp.value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Scrivi un indirizzo email valido'); return; }
  if (email === (S.user.email || '').toLowerCase() || S.persone.includes(email)) { toast('Questa email è già autorizzata'); return; }
  S.persone = [...S.persone, email];
  write('accesso', 'persone', { emails: S.persone });
  inp.value = ''; renderPeople(); toast(email + ' può ora accedere');
}
async function removePersona(email) {
  if (!(await confirmBox('Togliere ' + email + '?', 'Questa persona non potrà più vedere né modificare i preventivi.', 'Togli'))) return;
  S.persone = S.persone.filter(e => e !== email);
  write('accesso', 'persone', { emails: S.persone });
  renderPeople();
}
function onSettingInput(t) {
  let v = t.type === 'checkbox' ? t.checked : t.value;
  if (t.dataset.t === 'num') v = Number(v) || 0;
  S.azienda[t.dataset.set] = v;
  setSaveState('saving');
  clearTimeout(setTimer);
  setTimer = setTimeout(() => write('impostazioni', 'azienda', { ...S.azienda }), 600);
}
async function onImportFile(e) {
  const file = e.target.files && e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const dati = JSON.parse(await file.text());
    const r = await importa(store, dati);
    toast(r.creati ? `Importati ${r.creati} elementi${r.saltati ? `, ${r.saltati} già presenti` : ''}` : 'Niente da importare: è già tutto presente');
  } catch (err) {
    toast(err instanceof SyntaxError ? 'Il file non è leggibile. Usa il file nazifoski-dati.json.' : (err.message || 'Importazione non riuscita'));
  }
}

/* ---------- Preventivi vecchi da PDF ---------- */
async function onPdfFiles(e) {
  const files = Array.from(e.target.files || []); e.target.value = '';
  if (!files.length) return;
  let lib;
  try { lib = await (await import('./pdf.js')).caricaPdfJs(); } catch (err) { toast('Non riesco a leggere i PDF qui. Riprova.'); return; }
  openModal(`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="lp-t" style="width:min(440px,100%)">
    <div class="sheet-h"><h2 id="lp-t">Leggo i PDF…</h2></div>
    <div class="sheet-b"><p id="lp-n" style="margin:0;color:var(--ink-soft)">0 di ${files.length}</p><div class="progress"><i id="lp-bar" style="width:0%"></i></div></div></div>`);
  const letti = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let r;
    try { r = leggiPreventivo(await righeDaPdf(lib, new Uint8Array(await f.arrayBuffer()))); }
    catch (err) { console.warn(err); r = { errore: 'illeggibile', avvisi: [] }; }
    letti.push({ nome: f.name, ...r });
    const n = $('#lp-n'), bar = $('#lp-bar');
    if (n) n.textContent = `${i + 1} di ${files.length}`;
    if (bar) bar.style.width = Math.round((i + 1) / files.length * 100) + '%';
  }
  closeModal(false);
  // in ordine di data: i numeri seguono la cronologia; quelli illeggibili alla fine
  letti.sort((a, b) => (a.preventivo && a.preventivo.data ? 0 : 1) - (b.preventivo && b.preventivo.data ? 0 : 1) || String(a.preventivo?.data || '').localeCompare(String(b.preventivo?.data || '')));
  const esito = { salvati: 0, saltati: 0, voci: 0 };
  for (let i = 0; i < letti.length; i++) await rivedi(letti[i], i, letti.length, esito);
  toast(esito.salvati ? `Importati ${esito.salvati} preventivi${esito.voci ? `, ${esito.voci} voci nel listino` : ''}${esito.saltati ? ` (${esito.saltati} saltati)` : ''}` : 'Nessun preventivo importato');
  if (S.view === 'impostazioni') renderImpostazioni();
}

function rivedi(item, i, n, esito) {
  return new Promise(resolve => {
    const ultimo = i === n - 1;
    const testa = `<div class="sheet-h"><h2 id="ri-t">Preventivo vecchio ${i + 1} di ${n}</h2><span style="font-size:13px;color:var(--stone);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%">${esc(item.nome)}</span></div>`;
    if (item.errore === 'senza-testo' || item.errore === 'illeggibile' || !item.preventivo) {
      openModal(`<div class="sheet" id="ri" role="dialog" aria-modal="true" aria-labelledby="ri-t">${testa}
        <div class="sheet-b"><p class="msg err" style="margin:0">${item.errore === 'senza-testo' ? 'Questo PDF non contiene testo (forse è una foto o una scansione): non posso leggerlo. Inseriscilo a mano con «Nuovo preventivo».' : 'Questo file non si riesce a leggere come PDF.'}</p></div>
        <div class="sheet-f"><button class="btn primary" type="button" id="ri-salta">${ultimo ? 'Chiudi' : 'Avanti'}</button></div></div>`, () => resolve());
      $('#ri-salta').onclick = () => { esito.saltati++; closeModal(false); };
      return;
    }
    const p = item.preventivo;
    const umOpt = v => opt(UM.map(u => [u, u]), v);
    const ivaList = IVA.some(([v]) => Number(v) === Number(p.iva)) ? IVA : [...IVA, [p.iva, p.iva + '%']];
    const voceHtml = (v, k) => `<div class="ri-voce" data-k="${k}">
      <div class="rd"><textarea class="in" data-k="desc" aria-label="Descrizione voce ${k + 1}">${esc(v.desc)}</textarea></div>
      <input class="in" data-k="qta" inputmode="decimal" value="${esc(v.qta)}" aria-label="Quantità" placeholder="Q.tà">
      <select class="in" data-k="um" aria-label="Unità di misura">${umOpt(v.um)}</select>
      <input class="in" data-k="prezzo" inputmode="decimal" value="${esc(v.prezzo)}" aria-label="Prezzo €" placeholder="Prezzo €">
      <button class="icon-btn del" type="button" data-rdel="${k}" aria-label="Togli voce">${IC.trash}</button></div>`;
    openModal(`<div class="sheet" id="ri" role="dialog" aria-modal="true" aria-labelledby="ri-t" style="width:min(820px,100%)">${testa}
      <div class="sheet-b">
        ${item.avvisi.length ? `<ul class="ri-avvisi" id="ri-avvisi">${item.avvisi.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        <div class="grid two">
          <label class="field"><span>Cliente</span><input class="in" id="ri-nome" value="${esc(p.cliente.nome)}" autocapitalize="words"></label>
          <label class="field"><span>Indirizzo</span><input class="in" id="ri-ind" value="${esc(p.cliente.indirizzo)}"></label>
          <label class="field"><span>Data</span><input class="in" id="ri-data" type="date" value="${esc(p.data)}"></label>
          <label class="field"><span>Oggetto</span><input class="in" id="ri-ogg" value="${esc(p.oggetto)}"></label>
          <label class="field"><span>Stato</span><select class="in" id="ri-stato">${opt(STATI, 'inviato')}</select></label>
          <label class="field"><span>IVA</span><select class="in" id="ri-iva">${opt(ivaList, p.iva)}</select></label>
        </div>
        <div id="ri-voci">${p.sezioni[0].voci.map(voceHtml).join('')}</div>
        <button class="btn" type="button" id="ri-add" style="align-self:flex-start">${IC.plus} Voce</button>
        <div class="ri-tot" id="ri-tot"></div>
        <label class="check"><input type="checkbox" id="ri-listino" checked> Aggiungi le voci al listino prezzi</label>
        <label class="check"><input type="checkbox" id="ri-rubrica" checked> Aggiungi il cliente alla rubrica</label>
      </div>
      <div class="sheet-f"><button class="btn left" type="button" id="ri-salta">Salta</button><button class="btn primary" type="button" id="ri-salva">${ultimo ? 'Salva e chiudi' : 'Salva e avanti'}</button></div>
    </div>`, () => resolve());
    const leggiVoci = () => $$('#ri-voci .ri-voce').map((el, k) => ({ id: 'v' + (k + 1), desc: $('[data-k="desc"]', el).value.trim(), qta: $('[data-k="qta"]', el).value.trim(), um: $('[data-k="um"]', el).value, prezzo: $('[data-k="prezzo"]', el).value.trim() }));
    const corrente = () => ({ ...p, iva: Number($('#ri-iva').value), sezioni: [{ id: uid(), titolo: '', voci: leggiVoci() }] });
    const aggiorna = () => {
      const tot = calc(corrente()).totale; const el = $('#ri-tot'); if (!el) return;
      const letto = item.totaleLetto;
      const ok = isFinite(letto) ? Math.abs(letto - tot) < 0.02 : false;
      el.className = 'ri-tot ' + (ok ? 'ok' : 'bad');
      el.innerHTML = `<span>Totale calcolato ${fmtEur(tot)}</span><span>${isFinite(letto) ? `sul PDF ${fmtEur(letto)} ${ok ? '✓' : '— controlla'}` : 'totale del PDF non trovato'}</span>`;
    };
    $$('#ri textarea').forEach(autoGrow);
    aggiorna();
    $('#ri').addEventListener('input', e => { if (e.target.tagName === 'TEXTAREA') autoGrow(e.target); aggiorna(); });
    $('#ri-voci').addEventListener('click', e => { const b = e.target.closest('[data-rdel]'); if (b) { b.closest('.ri-voce').remove(); aggiorna(); } });
    $('#ri-add').onclick = () => { $('#ri-voci').insertAdjacentHTML('beforeend', voceHtml({ desc: '', qta: '', um: 'mq', prezzo: '' }, $$('#ri-voci .ri-voce').length)); aggiorna(); };
    $('#ri-salta').onclick = () => { esito.saltati++; closeModal(false); };
    $('#ri-salva').onclick = () => {
      const nome = $('#ri-nome').value.trim();
      const data = $('#ri-data').value || today();
      const voci = leggiVoci().filter(v => v.desc || v.prezzo);
      if (!nome) { toast('Scrivi il nome del cliente'); $('#ri-nome').focus(); return; }
      if (!voci.length) { toast('Serve almeno una voce'); return; }
      const anno = Number(data.slice(0, 4)) || new Date().getFullYear();
      const np = {
        ...p, id: uid(), anno, numero: nextNumero(S.preventivi.concat(esito.nuovi || []), anno), data, esempio: false,
        stato: $('#ri-stato').value, iva: Number($('#ri-iva').value), oggetto: $('#ri-ogg').value.trim(),
        cliente: { ...p.cliente, nome, indirizzo: $('#ri-ind').value.trim() },
        sezioni: [{ id: uid(), titolo: '', voci: voci.map(v => ({ ...v, id: uid() })) }],
        creato: new Date().toISOString(), modificato: new Date().toISOString(), importatoDa: item.nome
      };
      np.totale = calc(np).totale;
      (esito.nuovi = esito.nuovi || []).push(np);
      const { id, ...dati } = np;
      write('preventivi', id, dati);
      if ($('#ri-listino').checked) {
        for (const v of voci) {
          const pr = num(v.prezzo); if (!v.desc || !isFinite(pr)) continue;
          const key = v.desc.toLowerCase();
          const ex = S.listino.find(x => (x.desc || '').trim().toLowerCase() === key);
          if (ex && ex.dataPrezzo && ex.dataPrezzo > data) continue;
          const { id: lid, ...rest } = ex || {};
          write('listino', ex ? ex.id : uid(), { ...rest, desc: v.desc, um: v.um, prezzo: round2(pr), categoria: (ex && ex.categoria) || categoriaDa(v.desc), dataPrezzo: data, indicativo: false });
          if (!ex) esito.voci++;
        }
      }
      if ($('#ri-rubrica').checked && !S.clienti.some(c => (c.nome || '').trim().toLowerCase() === nome.toLowerCase())) {
        write('clienti', uid(), { nome, indirizzo: np.cliente.indirizzo, cfpiva: np.cliente.cfpiva || '', telefono: np.cliente.telefono || '', email: np.cliente.email || '' });
      }
      esito.salvati++;
      closeModal(true);
    };
  });
}

/* ---------- Copia di sicurezza ---------- */
async function esportaBackup() {
  const strip = r => ({ ...r });
  const { ...az } = S.azienda;
  const dati = { formato: 'nazifoski-dati', esportato: new Date().toISOString(), preventivi: S.preventivi.map(strip), listino: S.listino.map(strip), clienti: S.clienti.map(strip), azienda: az };
  const nome = `nazifoski-dati-${today()}.json`;
  const blob = new Blob([JSON.stringify(dati, null, 1)], { type: 'application/json' });
  const file = new File([blob], nome, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: nome }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('Copia di sicurezza salvata: ' + nome);
}

/* ---------- Installazione (completata in pwa.js) ---------- */
function installBanner() { return window.NZ_PWA ? window.NZ_PWA.banner() : ''; }
function bindInstall() { if (window.NZ_PWA) window.NZ_PWA.bind(main); }
function showHelp() {
  if (window.NZ_PWA) return window.NZ_PWA.help(openModal);
  toast('Apri l\'app dal browser del telefono per installarla.');
}

addEventListener('pagehide', flushEditor);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushEditor(); });

boot();
