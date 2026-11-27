// Nazifoski Preventivi: interfaccia. Dati su Firestore (o in memoria con ?test=1).
import { num, isExpr, calc, fmtEur, fmtNum, fmtDate, today, numStr, nextNumero, duplicati, round2, suggerisci, messaggioInvio, MESSAGGIO_BASE, daRichiamare, giorniDa, nuovaRevisione, ripristinaRevisione, calcMargine, qtaOf, rateDaTesto, ricalcolaRate, statoPagamenti, RATE_BASE, segnaRichiamato, modelloDa, daModello, nuovaVariante, totaleVariante, totaleExtra, documentoVariante, consuntivo, TIPI_SPESA } from './calc.js';
import { createStore, importa, localeHasData, FB_URL } from './store.js';
import { createAuth, isIosStandalone, messaggioErrore } from './auth.js';
import { righeDaPdf, leggiPreventivo, categoriaDa } from './pdfimport.js';
import { LISTINO_RIMINI, pianoListino } from './listino-rimini.js';
import { fineLavori, spostaLavorativi, durataDaTesto, scadenzeDaCantiere, icsCantiere, lavorativo, lunediDi, agendaSettimana, daProgrammare, cantieri, giornoLavoro } from './agenda.js';
import { areeStanza, espressione, perimetro, totaliStanze, LAVORAZIONI, vociPerLavorazione, sezioniDaRilievo } from './misure.js';
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
  ivaDefault: 10, tempi: '', pagamento: '', note: '', firma: false, giorniRichiamo: 10, rateStandard: RATE_BASE
};

/* ---------- Stato ---------- */
const S = {
  view: 'lista', user: null, persone: [], started: false,
  loaded: { preventivi: false, listino: false, clienti: false, misure: false, modelli: false, noteAgenda: false }, misure: [], modelli: [], noteAgenda: [], settimana: null, indietro: 'lista', rilievo: null, mq: '',
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
  metro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/></svg>',
  firma: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17c3-4 5-9 7-9 2.5 0-1 9 1.5 9 1.8 0 2.5-3 4-3 1.2 0 1 2 2.5 2H21"/><path d="M3 21h18"/></svg>',
  calendario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  persone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
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
addEventListener('nz-archivio-bloccato', () => showScreen('attesa', '<h1>Aggiorno l\'archivio del telefono</h1><p>Chiudi le altre finestre o schede di Nazifoski ancora aperte: appena sono chiuse l\'app si apre da sola. I tuoi dati restano dove sono.</p>'));
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
    store = await createStore(kind === 'test' ? 'memory' : kind === 'online' ? 'firestore' : 'locale', { app, emulator: EMU, deny: !!seed.deny, lento: seed.lento, errore: seed.errore, seed: { preventivi: seed.preventivi, listino: seed.listino, clienti: seed.clienti, impostazioni: seed.impostazioni, foto: seed.foto, misure: seed.misure, modelli: seed.modelli, noteAgenda: seed.noteAgenda } });
    store.onSync(s => { S.sync = s; renderSync(); });
    auth.onUser(onUser);
  } catch (e) {
    console.error(e);
    const locale = !TEST && !app;
    showScreen('errore', locale
      ? `<h1>Non riesco ad aprire i dati del telefono</h1><p>Chiudi del tutto l'app (anche dalle app recenti) e riaprila. Se succede ancora, controlla che il telefono abbia spazio libero.</p><p class="help" style="font-size:13px">${esc((e && e.message) || '')}</p><button class="btn primary block" type="button" onclick="location.reload()">Riprova</button>`
      : '<h1>Non riesco ad aprire l\'app</h1><p>Controlla la connessione a internet e riprova.</p><button class="btn primary block" type="button" onclick="location.reload()">Riprova</button>');
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
    const r = await importa(store, await localeDaTrasferire.exportAllAsync());
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
  for (const name of ['preventivi', 'listino', 'clienti', 'misure', 'modelli', 'noteAgenda']) {
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
  return p.then(() => { setSaveState('saved'); return true; }).catch(err => {
    setSaveState('err');
    toast(denied(err) ? 'Non hai il permesso di modificare questi dati.' : 'Salvataggio non riuscito. Riprova.');
    return false;
  });
}

/* ---------- Navigazione ---------- */
const main = $('#main');
function go(view) {
  if (S.view === 'editor' && view !== 'editor') { flushEditor(); S.current = null; closeLayer('editor'); seguiFoto(null); }
  if (S.rilievo) { flushRilievo(); S.rilievo = null; closeLayer('rilievo'); }
  if ((S.view === 'agenda' || (S.view === 'editor' && S.indietro === 'agenda')) && view !== 'agenda' && view !== 'editor') closeLayer('agenda');
  const daEditor = S.view === 'editor';
  if (view === 'agenda' && S.view !== 'agenda' && !daEditor) S.settimana = lunediDi(today());
  if (view !== 'editor' && !(daEditor && view === 'agenda')) S.indietro = 'lista';
  S.view = view;
  render();
  window.scrollTo(0, 0);
}
$$('#app [data-view]').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
$('#brand').addEventListener('click', () => go('lista'));

function render(fromData) {
  document.body.classList.toggle('in-editor', S.view === 'editor');
  $$('#app [data-view]').forEach(t => t.setAttribute('aria-current', (t.dataset.view === S.view || (S.view === 'editor' && t.dataset.view === (S.indietro === 'agenda' ? 'agenda' : 'lista'))) ? 'page' : 'false'));
  if (S.view !== 'editor') $('#totbar').innerHTML = '';
  if (S.view === 'lista') return renderLista(fromData);
  if (S.view === 'listino') return fromData && $('#lq') ? renderListinoRows() : renderListino();
  if (S.view === 'clienti') return fromData && $('#cq') ? renderClientiRows() : renderClienti();
  if (S.view === 'agenda') return modal.hidden || !fromData ? renderAgenda() : null;
  if (S.view === 'misure') return S.rilievo ? (fromData ? null : renderRilievo()) : (fromData && $('#mq') ? renderMisureRows() : renderMisure());
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
  const oggi = today();
  const richiamo = daRichiamare(all, oggi, Number(S.azienda.giorniRichiamo) || 10);
  const incassare = new Set(all.filter(p => daIncassare(p, oggi)).map(p => p.id));
  const q = S.q.trim().toLowerCase();
  let rows = sorted(all).filter(p => S.filter === 'tutti' || (S.filter === 'richiamare' ? richiamo.has(p.id) : S.filter === 'incassare' ? incassare.has(p.id) : p.stato === S.filter));
  if (q) rows = rows.filter(p => [numStr(p), p.cliente?.nome, p.oggetto, p.cantiere].join(' ').toLowerCase().includes(q));
  const sum = (k, color, label, list, word) => `<button class="sum" data-filter="${k}" type="button" aria-pressed="${S.filter === k}"><span class="k"><i style="background:var(${color})"></i>${label}</span><span class="v">${fmtEur(sumOf(list))}</span><span class="c">${list.length} ${word(list.length)}</span></button>`;
  main.innerHTML = `
    ${installBanner()}
    ${trasferimentoBanner()}
    ${richiamo.size ? `<button class="note richiama" id="richiama" type="button" data-filter="${S.filter === 'richiamare' ? 'tutti' : 'richiamare'}">${IC.tel}<span><b>${richiamo.size} ${richiamo.size === 1 ? 'preventivo' : 'preventivi'} da richiamare</b> · inviati da più di ${Number(S.azienda.giorniRichiamo) || 10} giorni senza risposta</span><span class="vedi">${S.filter === 'richiamare' ? 'Mostra tutti' : 'Vedi'}</span></button>` : ''}
    ${agendaBanner()}
    <div class="head">
      <div><span class="eyebrow">${S.user && S.user.locale ? 'Dati solo su questo telefono' : 'Impresa Edile Nazifoski'}</span><h1>Preventivi</h1></div>
      <div class="head-actions"><button class="btn" data-act="modelli" type="button">${IC.list} Modelli</button><button class="btn primary" data-act="new" type="button">${IC.plus} Nuovo preventivo</button></div>
    </div>
    <div class="summary">
      ${sum('bozza', '--stone', 'Da completare', bozze, n => (n === 1 ? 'bozza' : 'bozze'))}
      ${sum('inviato', '--blue', 'Inviati, in attesa di risposta', attesa, n => (n === 1 ? 'preventivo' : 'preventivi'))}
      ${sum('accettato', '--ok', `Accettati nel ${anno}`, acc, n => (n === 1 ? 'lavoro confermato' : 'lavori confermati'))}
    </div>
    <div class="toolbar">
      <input class="in search" id="q" type="search" enterkeyhint="search" placeholder="Cerca per cliente, lavoro o numero" value="${esc(S.q)}" aria-label="Cerca preventivi">
      <div class="chips" role="group" aria-label="Filtra per stato">
        ${[['tutti', 'Tutti'], ...STATI, ['richiamare', 'Da richiamare'], ['incassare', 'Da incassare']].map(([k, l]) => `<button class="chip" type="button" data-filter="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="list" id="rows">
      ${!S.loaded.preventivi ? '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>' :
        rows.length ? rows.map(p => rowHtml(p, dups.has(p.id), richiamo.has(p.id) ? oggi : null)).join('') :
        all.length ? '<div class="empty"><h3>Nessun preventivo trovato</h3><p>Prova a cambiare la ricerca o il filtro.</p></div>' :
        `<div class="empty"><h3>Ancora nessun preventivo</h3><p>Crea il primo: scegli le lavorazioni dal listino, l'app fa i conti e impagina il PDF da sola.</p><button class="btn primary" data-act="new" type="button">${IC.plus} Nuovo preventivo</button></div>`}
    </div>`;
  const qi = $('#q');
  qi.addEventListener('input', () => { S.q = qi.value; renderLista(); });
  if (keep !== null) { qi.focus(); try { qi.setSelectionRange(keep, keep); } catch (e) {} }
  bindInstall();
  if (!fromData) enter();
}
function rowHtml(p, dup, oggi, dentro) {
  const [sk, sl] = rowState(p);
  if (oggi && S.filter === 'richiamare' && !dentro) {
    const tel = String(p.cliente?.telefono || '').replace(/[^\d+]/g, '');
    return `<div class="row-wrap">${rowHtml(p, dup, oggi, true)}<div class="row-call">
      ${tel ? `<a class="btn" href="tel:${esc(tel)}">${IC.tel} Chiama</a>` : ''}
      <button class="btn" type="button" data-act="richiamato" data-id="${esc(p.id)}">${IC.check} Richiamato</button>
    </div></div>`;
  }
  return `<button class="row" type="button" data-open="${esc(p.id)}">
    <span class="n">${esc(numStr(p))}${dup ? '<span class="dup">Numero già usato</span>' : ''}${p.rate && p.rate.length && p.stato !== 'rifiutato' && statoPagamenti(p, today()).scadute ? '<span class="scaduta">Rata scaduta</span>' : ''}</span>
    <span class="who"><b>${esc(p.cliente?.nome || 'Cliente senza nome')}</b><span>${esc(p.oggetto || p.cantiere || 'Lavori da descrivere')}</span></span>
    <span class="st"><span class="pill st-${sk}">${sl}</span></span>
    <span class="amt">${fmtEur(totaleDi(p))}<small${oggi ? ' class="tardi"' : ''}>${esc(oggi ? quando(p, oggi) : fmtDate(p.data))}</small></span>
  </button>`;
}
/** Lavoro con rate da incassare: accettato (o con un acconto già preso) e non ancora saldato. */
function daIncassare(p, oggi) {
  if (p.esempio || !p.rate || !p.rate.length || p.stato === 'rifiutato') return false;
  if (p.stato !== 'accettato' && !p.rate.some(r => r.pagata)) return false;
  return statoPagamenti(p, oggi).daIncassare > 0.005;
}
function quando(p, oggi) {
  const n = giorniDa(p.richiamato || p.dataInvio || p.data, oggi);
  return `${p.richiamato ? 'richiamato' : 'inviato'} ${n === 1 ? '1 giorno' : n + ' giorni'} fa`;
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
  if (S.view === 'editor') flushEditor(); else { S.indietro = S.view === 'agenda' ? 'agenda' : 'lista'; openLayer('editor', () => { flushEditor(); S.current = null; seguiFoto(null); S.view = S.indietro; render(); }); }
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
    <div class="q"><span class="lbl">Quantità</span><div class="qbox"><input class="in r" data-v="qta" inputmode="decimal" enterkeyhint="next" placeholder="${v.um === 'a corpo' ? '1' : 'es. 3,5*4'}" value="${esc(v.qta)}" aria-label="Quantità"><button class="icon-btn mis" type="button" data-act="vMisure" aria-label="Calcola dalle misure della stanza" title="Calcola dalle misure della stanza">${IC.metro}<span>Misure</span></button></div><span class="calc"></span></div>
    <div class="p"><span class="lbl">Prezzo €</span><input class="in r" data-v="prezzo" inputmode="decimal" enterkeyhint="done" placeholder="0,00" value="${esc(v.prezzo)}" aria-label="Prezzo unitario"><span class="calc"></span></div>
    <div class="imp"><span class="lbl">Importo</span><span class="iv">—</span></div>
    <div class="vc"><label><span>Costo tuo €</span><input class="in r" data-v="costo" inputmode="decimal" enterkeyhint="done" placeholder="facoltativo" value="${esc(v.costo ?? '')}" aria-label="Costo unitario (non va nel PDF)"></label><span class="mg"></span></div>
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
  seguiFoto(p.esempio ? null : p.id);
  const sez = p.sezioni;
  main.innerHTML = `
    <div class="ed-top">
      <button class="btn ghost" type="button" data-act="back" aria-label="Torna ai preventivi">${IC.back}<span class="back-label">Preventivi</span></button>
      <div class="ttl"><span class="eyebrow">Preventivo</span><h1>${esc(numStr(p))}</h1></div>
      <span class="savestate" id="saveState" aria-live="polite"></span>
      <div class="ed-actions">
        <button class="btn" type="button" data-act="dup">Duplica</button>
        ${p.esempio ? '' : '<button class="btn" type="button" data-act="modello" title="Salva come modello per i prossimi preventivi">Salva modello</button>'}
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
      ${firmaEditor(p)}
      ${p.esempio ? '' : `<div class="rev-bar">
        <button class="btn" type="button" data-act="revisione">${IC.plus} Nuova revisione</button>
        ${(p.revisioni || []).length ? `<button class="btn" type="button" data-act="revisioni">Revisioni precedenti (${p.revisioni.length})</button>` : ''}
      </div>`}
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
    </section>
    ${p.esempio ? '' : `<section class="card" id="foto">
      <h2>Foto del sopralluogo <small>restano nell'app, non vanno nel PDF</small></h2>
      <div class="foto-grid" id="foto-grid">${fotoHtml()}</div>
      <label class="btn foto-add" for="foto-file">${IC.camera} Scatta o scegli foto</label>
      <input type="file" id="foto-file" accept="image/*" multiple hidden>
    </section>`}
    ${p.esempio ? '' : `<section class="card" id="agenda"${mostraExtra(p) || p.agenda ? '' : ' hidden'}>
      <h2>Cantiere in agenda <small>le date dei lavori: le ritrovi nella pagina Agenda</small></h2>
      <div class="grid ag-grid">
        <label class="field"><span>Inizio lavori</span><input class="in" type="date" data-ag="inizio" value="${esc((p.agenda && p.agenda.inizio) || '')}"></label>
        <label class="field"><span>Giorni lavorativi</span><input class="in r" data-ag="giorni" inputmode="numeric" value="${esc((p.agenda && p.agenda.giorni) || '')}" placeholder="es. 10"></label>
        <label class="field ag-full"><span>Chi ci lavora</span><input class="in" data-ag="chi" autocapitalize="words" value="${esc((p.agenda && p.agenda.chi) || '')}" placeholder="Es. Ardit e Luca"></label>
        <label class="field ag-full"><span>Note del cantiere</span><textarea class="in" data-ag="note" placeholder="Es. chiavi dalla vicina, citofono 3; portare silicone grigio">${esc((p.agenda && p.agenda.note) || '')}</textarea></label>
      </div>
      <p class="ag-fine" id="ag-fine">${agFineHtml(p)}</p>
      <div class="pg-act ag-act"><span class="ag-lbl">Sposta</span>${[-1, 1, 2, 5].map(n => `<button class="btn" type="button" data-act="agSposta" data-n="${n}" aria-label="Sposta di ${n} giorni lavorativi">${n > 0 ? '+' + n : '−1'}</button>`).join('')}
        <button class="btn" type="button" data-act="agIcs">${IC.calendario} Aggiungi al calendario</button></div>
    </section>`}
    ${p.esempio ? '' : `<section class="card" id="extra"${mostraExtra(p) ? '' : ' hidden'}>
      <h2>Lavori extra <small>varianti chieste durante il cantiere: PDF e firma a parte</small></h2>
      <div id="extra-list">${(p.extra || []).map(varianteHtml).join('')}</div>
      <button class="btn" type="button" data-act="xAdd">${IC.plus} Nuova variante</button>
      <div class="pg-sum" id="extra-tot" style="margin-top:12px">${extraTotHtml(p)}</div>
    </section>`}
    ${p.esempio ? '' : `<section class="card" id="spese"${mostraExtra(p) || (p.spese || []).length ? '' : ' hidden'}>
      <h2>Costi reali del cantiere <small>solo per voi, importi senza IVA: non vanno nel PDF</small></h2>
      <div class="pg-sum" id="sp-sum">${speseSumHtml(p)}</div>
      <div id="sp-list">${(p.spese || []).map(spesaHtml).join('')}</div>
      <button class="btn" type="button" data-act="spAdd" style="margin-top:10px">${IC.plus} Aggiungi spesa</button>
    </section>`}
    ${p.esempio ? '' : `<section class="card" id="pagamenti">
      <h2>Pagamenti <small>acconti e saldo, solo per voi: il PDF non cambia</small></h2>
      <div id="pg-body">${pagamentiHtml(p)}</div>
    </section>`}`;
  $('#totbar').innerHTML = `<div class="totbar"><div class="wrap">
    <div class="t sm" id="t-lordo-w"><span>Lavori</span><b id="t-lordo">—</b></div>
    <div class="t sm" id="t-sc-w"><span>Sconto</span><b id="t-sc">—</b></div>
    <div class="t mid"><span>Imponibile</span><b id="t-imp">—</b></div>
    <div class="t iva"><span id="t-ival">IVA</span><b id="t-iva">—</b></div>
    <div class="t marg" id="t-marg-w" hidden><span id="t-marg-l">Margine</span><b id="t-marg">—</b></div>
    <div class="t big"><span>Totale</span><b id="t-tot">—</b></div>
    <button class="btn primary" type="button" data-act="preview">${IC.doc} PDF</button>
  </div></div>`;
  refreshDatalist();
  $$('#main textarea[data-v], #main textarea[data-xv], #main textarea[data-ag]').forEach(autoGrow);
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
      const mg = $('.mg', vEl);
      if (mg) {
        const k = num(v.costo);
        if (!String(v.costo ?? '').trim()) { mg.textContent = ''; mg.className = 'mg'; }
        else if (!isFinite(k)) { mg.textContent = 'Controlla il costo'; mg.className = 'mg bad'; }
        else {
          const unit = isFinite(cv.pr) ? cv.pr - k : NaN;
          const q = isFinite(cv.q) ? cv.q : 0;
          mg.textContent = isFinite(unit) ? `margine ${fmtEur(round2(unit * q))} (${cv.pr > 0 ? fmtNum(Math.round(unit / cv.pr * 1000) / 10, 1) : '0'}%)` : '';
          mg.className = 'mg' + (unit < 0 ? ' bad' : '');
        }
      }
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
  aggiornaExtra();
  aggiornaSpese();
  aggiornaPagamenti();
  const m = calcMargine(p);
  const mw = $('#t-marg-w');
  if (mw) {
    mw.hidden = !m.conCosto; mw.classList.toggle('neg', m.margine < 0);
    $('#t-marg').innerHTML = `${fmtEur(m.margine)}<small> · ${fmtNum(m.perc, 1)}%</small>`;
    set('t-marg-l', m.vociConCosto < m.voci ? `Margine (${m.vociConCosto}/${m.voci} voci)` : 'Margine');
    mw.title = m.vociConCosto < m.voci ? `Solo per voi, non va nel PDF. Calcolato sulle ${m.vociConCosto} voci su ${m.voci} che hanno il costo.` : 'Solo per voi: non compare nel PDF';
  }
}
function setPath(obj, path, val) {
  const ks = path.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}
/* Suggerimenti dal listino sotto la descrizione della voce */
function chiudiSuggerimenti() { $$('#main .sugg').forEach(el => el.remove()); }
function mostraSuggerimenti(ta) {
  const cella = ta.parentElement;
  const lista = suggerisci(ta.value, S.listino, 4);
  let box = $('.sugg', cella);
  if (!lista.length) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.className = 'sugg'; box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', 'Voci simili nel listino'); cella.appendChild(box); }
  box.innerHTML = lista.map(v => `<button type="button" class="sugg-i" role="option" data-sugg="${esc(v.id)}"><span>${esc(v.desc)}</span><small>${esc(v.um || '')} · ${fmtEur(Number(v.prezzo) || 0)}</small></button>`).join('');
}
function usaSuggerimento(b) {
  const p = S.current; const vEl = b.closest('[data-voce]'); const sEl = b.closest('[data-sez]');
  const x = S.listino.find(i => i.id === b.dataset.sugg);
  if (!p || !vEl || !sEl || !x) return;
  const v = p.sezioni[+sEl.dataset.sez].voci[+vEl.dataset.voce];
  v.desc = x.desc; v.um = x.um || 'mq'; v.prezzo = String(x.prezzo ?? '').replace('.', ',');
  if (x.costo !== undefined && x.costo !== '' && x.costo !== null) v.costo = String(x.costo).replace('.', ',');
  if (v.um === 'a corpo' && !String(v.qta || '').trim()) v.qta = '1';
  const ta = $('[data-v="desc"]', vEl); ta.value = v.desc; autoGrow(ta);
  $('[data-v="um"]', vEl).value = v.um;
  const q = $('[data-v="qta"]', vEl); q.value = v.qta || ''; q.placeholder = v.um === 'a corpo' ? '1' : 'es. 3,5*4';
  $('[data-v="prezzo"]', vEl).value = v.prezzo;
  const ce = $('[data-v="costo"]', vEl); if (ce) ce.value = v.costo ?? '';
  chiudiSuggerimenti();
  updateTotals(); markDirty();
  q.focus(); try { q.select(); } catch (e) {}
}
// il tocco sul suggerimento non deve far perdere il fuoco al campo prima del clic
document.addEventListener('mousedown', e => { if (e.target.closest('.sugg')) e.preventDefault(); });
main.addEventListener('focusout', e => { if (e.target.dataset && e.target.dataset.v === 'desc') setTimeout(() => { if (!document.activeElement || !document.activeElement.closest('.sugg')) { const c = e.target.parentElement; const b = c && $('.sugg', c); if (b && document.activeElement !== e.target) b.remove(); } }, 200); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiSuggerimenti(); });

function fillCliente(nome) {
  const c = S.clienti.find(x => (x.nome || '').trim().toLowerCase() === nome.trim().toLowerCase());
  if (!c) return;
  const p = S.current;
  [['indirizzo', 'f-cind'], ['cfpiva', 'f-ccf'], ['telefono', 'f-ctel'], ['email', 'f-cmail']].forEach(([k, id]) => {
    if (!p.cliente[k] && c[k]) { p.cliente[k] = c[k]; const el = $('#' + id); if (el) el.value = c[k]; }
  });
}

/* Un preventivo firmato non si modifica: la firma vale per quella versione. Si passa da una nuova revisione. */
const ATTI_CONTENUTO = ['vAdd', 'vDel', 'vUp', 'vDown', 'vPick', 'vMisure', 'sAdd', 'sAddT', 'sDel', 'sUp', 'sDown', 'renumber'];
const campoProtetto = t => !!(t && t.closest && t.closest('#main') && t.matches('[data-v], [data-s], [data-f]:not([data-f="stato"])'));
let chiedoRevisione = false;
async function revisionePerModificare() {
  const p = S.current; if (!p || !p.firma || chiedoRevisione) return false;
  chiedoRevisione = true;
  try {
    const ok = await confirmBox('Preventivo firmato', `${p.firma.nome || 'Il cliente'} ha firmato questa versione. Per modificarla faccio una nuova revisione: quella firmata resta salvata, con la firma, in «Revisioni precedenti».`, 'Nuova revisione');
    if (!ok || S.current !== p) return false;
    flushEditor();
    S.current = nuovaRevisione(p, today()); saveCurrent(); renderEditor();
    toast('Ora stai modificando ' + numStr(S.current));
    return true;
  } finally { chiedoRevisione = false; }
}
main.addEventListener('focusin', e => {
  if (S.view !== 'editor' || !S.current || !S.current.firma || !campoProtetto(e.target)) return;
  e.target.blur();
  revisionePerModificare();
});
function salvaFirmaImpresa(url) {
  if (url) S.azienda.firmaImpresa = url; else delete S.azienda.firmaImpresa;
  write('impostazioni', 'azienda', { ...S.azienda });
  const y = window.scrollY; renderImpostazioni(); window.scrollTo(0, y);
  toast(url ? 'Firma dell\'impresa salvata: comparirà nei PDF' : 'Firma dell\'impresa tolta');
}
main.addEventListener('change', e => {
  if (e.target.id === 'fi-file') {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (file) import('./foto.js').then(m => m.riduciFoto(file, 800, 0.85)).then(salvaFirmaImpresa).catch(() => toast('Non riesco a leggere questa foto'));
    return;
  }
  if (e.target.id === 'foto-file') { const files = [...(e.target.files || [])]; e.target.value = ''; aggiungiFoto(files); }
});
main.addEventListener('input', e => {
  const t = e.target;
  if (S.view === 'impostazioni' && t.dataset.set) return onSettingInput(t);
  if (S.view === 'misure' && S.rilievo) return onRilievoInput(t);
  if (S.view !== 'editor' || !S.current) return;
  const p = S.current;
  if (t.dataset.f) {
    let v = t.value; if (t.dataset.t === 'num') v = v === '' ? '' : Number(v);
    setPath(p, t.dataset.f, v);
    if (t.dataset.f === 'cliente.nome') fillCliente(t.value);
    if (t.dataset.f === 'stato' && v === 'inviato') { p.dataInvio = today(); delete p.richiamato; }
    if (t.dataset.f === 'stato') { const ag = $('#agenda'); if (ag) ag.hidden = !mostraExtra(p) && !p.agenda; aggiornaAgenda(); const ex = $('#extra'); if (ex) ex.hidden = !mostraExtra(p); const sp = $('#spese'); if (sp) sp.hidden = !mostraExtra(p) && !(p.spese || []).length; }
    if (t.dataset.f === 'numero' && v !== '') { $('.ed-top h1').textContent = numStr(p); $('#dupwrap').innerHTML = dupNote(p); }
  } else if (t.dataset.v) {
    const si = +t.closest('[data-sez]').dataset.sez, vi = +t.closest('[data-voce]').dataset.voce;
    p.sezioni[si].voci[vi][t.dataset.v] = t.value;
    if (t.tagName === 'TEXTAREA') autoGrow(t);
    if (t.dataset.v === 'desc') mostraSuggerimenti(t);
    if (t.dataset.v === 'um') { const q = $('[data-v="qta"]', t.closest('.voce')); if (q) q.placeholder = t.value === 'a corpo' ? '1' : 'es. 3,5*4'; }
  } else if (t.dataset.s) {
    p.sezioni[+t.closest('[data-sez]').dataset.sez][t.dataset.s] = t.value;
  } else if (t.dataset.ag) {
    const a = p.agenda = p.agenda || {};
    const k = t.dataset.ag;
    if (k === 'giorni') { const n = parseInt(t.value, 10); a.giorni = n >= 1 ? Math.min(n, 999) : ''; }
    else a[k] = t.value;
    if (k === 'inizio' && t.value) delete a.nessuna;
    if (k === 'inizio' && a.inizio && !a.giorni) {
      const d = durataDaTesto(p.tempi);
      if (d) { a.giorni = d; const g = $('#agenda [data-ag="giorni"]'); if (g) g.value = d; }
    }
    if (k === 'note' && t.tagName === 'TEXTAREA') autoGrow(t);
    aggiornaAgenda();
  } else if (t.dataset.sp) {
    const sp = (p.spese || [])[+t.closest('[data-spi]').dataset.spi]; if (!sp) return;
    if (t.dataset.sp === 'importo') { const v = num(t.value); sp.importo = t.value.trim() && isFinite(v) ? round2(v) : ''; }
    else sp[t.dataset.sp] = t.value;
  } else if (t.dataset.xv || t.dataset.xt) {
    const x = (p.extra || [])[+t.closest('[data-x]').dataset.x]; if (!x || x.firma) return;
    if (t.dataset.xt) x.titolo = t.value;
    else { const v = x.voci[+t.closest('[data-xj]').dataset.xj]; if (!v) return; v[t.dataset.xv] = t.value; if (t.tagName === 'TEXTAREA') autoGrow(t); }
  } else if (t.dataset.r) {
    const r = p.rate && p.rate[+t.closest('[data-rata]').dataset.rata]; if (!r) return;
    const k = t.dataset.r;
    if (k === 'perc') { const v = num(t.value); r.perc = t.value.trim() && isFinite(v) ? v : ''; }
    else if (k === 'importo') { const v = num(t.value); r.importo = isFinite(v) ? round2(v) : 0; r.perc = ''; const pe = $('[data-r="perc"]', t.closest('[data-rata]')); if (pe) pe.value = ''; }
    else r[k] = t.value;
    if (k === 'scadenza') delete r.scadenzaAuto;
    if (k === 'pagata' && !t.value) { r.pagata = ''; ridisegnaPagamenti(); }
    if (k === 'scadenza') t.closest('[data-rata]').classList.toggle('late', !r.pagata && !!r.scadenza && r.scadenza < today());
  } else return;
  updateTotals(); markDirty();
});

async function onAct(b) {
  const act = b.dataset.act; const p = S.current;
  if (S.view === 'misure' && (await onActMisure(act, b))) return;
  if (S.view === 'editor' && p && p.firma && ATTI_CONTENUTO.includes(act)) { revisionePerModificare(); return; }
  if (act === 'new') { if (S.modelli.length) return scegliModello(); const np = nuovoPreventivo(); openEditor(np); saveCurrent(); return; }
  if (act === 'modelli') return scegliModello();
  if (act === 'agenda') return go('agenda');
  if (S.view === 'agenda' && (await onActAgenda(act, b))) return;
  if (act === 'lNew') return editListino(null);
  if (act === 'fiDisegna') {
    const { apriFirma, chiudiFirma } = await import('./firma.js');
    openLayer('firma', () => chiudiFirma());
    const f = await apriFirma({ titolo: 'Firma dell\'impresa', nota: 'Firma come sui documenti: comparirà nei PDF sotto «Per l\'impresa».', chiediNome: false });
    closeLayer('firma');
    if (f) salvaFirmaImpresa(f.png);
    return;
  }
  if (act === 'fiTogli') {
    if (await confirmBox('Togliere firma e timbro?', 'Dai prossimi PDF spariscono. Puoi rimetterli quando vuoi.', 'Togli')) salvaFirmaImpresa('');
    return;
  }
  if (act === 'richiamato') {
    const x = S.preventivi.find(i => i.id === b.dataset.id); if (!x) return;
    const { id, ...data } = segnaRichiamato(x, today(), new Date().toISOString());
    x.richiamato = data.richiamato; x.modificato = data.modificato;
    write('preventivi', id, data);
    renderLista(true);
    toast('Segnato come richiamato: te lo ricordo di nuovo tra qualche giorno');
    return;
  }
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
    case 'back': go(S.indietro || 'lista'); break;
    case 'restore': S.gone = false; $('#dupwrap').innerHTML = ''; saveCurrent(); toast('Preventivo ripristinato'); break;
    case 'takeRemote': {
      const remote = S.preventivi.find(x => x.id === p.id);
      clearTimeout(saveTimer); saveTimer = null;
      if (remote) { S.current = clone(remote); S.base = remote.modificato || null; const y = window.scrollY; renderEditor(); window.scrollTo(0, y); }
      break;
    }
    case 'preview': flushEditor(); openPreview(); break;
    case 'revisione': {
      flushEditor();
      const firmato = !!p.firma;
      if (p.stato !== 'bozza' && !(await confirmBox('Fare una nuova revisione?', `La versione attuale resta salvata in «Revisioni precedenti». Il preventivo torna «Bozza»${firmato ? ' e la firma del cliente va rifatta' : ''}.`, 'Nuova revisione'))) break;
      S.current = nuovaRevisione(p, today());
      saveCurrent(); renderEditor();
      toast('Ora stai modificando ' + numStr(S.current));
      break;
    }
    case 'revisioni': flushEditor(); apriRevisioni(); break;
    case 'modello': flushEditor(); salvaModello(p); break;
    case 'agSposta': {
      const a = p.agenda || {};
      if (!a.inizio) { toast('Metti prima la data di inizio'); break; }
      a.inizio = spostaLavorativi(a.inizio, Number(b.dataset.n));
      const i = $('#agenda [data-ag="inizio"]'); if (i) i.value = a.inizio;
      aggiornaAgenda(); markDirty();
      toast(`Inizio spostato a ${giornoSett(a.inizio)} ${fmtDate(a.inizio)}`);
      break;
    }
    case 'agIcs': flushEditor(); calendarioCantiere(p); break;
    case 'spAdd': (p.spese = p.spese || []).push({ id: uid(), data: today(), desc: '', tipo: 'materiali', importo: '' }); ridisegnaSpese(); markDirty(); { const d = $$('#spese [data-sp="desc"]'); if (d.length) d[d.length - 1].focus(); } break;
    case 'spDel': {
      const i = +b.closest('[data-spi]').dataset.spi; const sp = (p.spese || [])[i]; if (!sp) break;
      if ((sp.desc || sp.importo) && !(await confirmBox('Togliere questa spesa?', `${sp.desc || 'La spesa'} viene tolta dai costi reali.`, 'Togli'))) break;
      p.spese.splice(i, 1); ridisegnaSpese(); markDirty(); break;
    }
    case 'xAdd': (p.extra = p.extra || []).push(nuovaVariante(p, today(), uid)); ridisegnaExtra(); markDirty(); { const t = $$('#extra [data-xt]'); if (t.length) t[t.length - 1].focus(); } break;
    case 'xDel': case 'xvAdd': case 'xvDel': case 'xPdf': {
      const xi = +b.closest('[data-x]').dataset.x; const x = (p.extra || [])[xi]; if (!x) break;
      if (act === 'xPdf') { flushEditor(); openPreview(null, { variante: xi }); break; }
      if (x.firma) break;
      if (act === 'xDel') { if (!(await confirmBox(`Eliminare la variante ${x.n}?`, 'Le sue voci vengono tolte. Non si può annullare.', 'Elimina'))) break; p.extra.splice(xi, 1); }
      if (act === 'xvAdd') x.voci.push({ id: uid(), desc: '', um: 'a corpo', qta: '', prezzo: '' });
      if (act === 'xvDel') { x.voci.splice(+b.closest('[data-xj]').dataset.xj, 1); if (!x.voci.length) x.voci.push({ id: uid(), desc: '', um: 'a corpo', qta: '', prezzo: '' }); }
      ridisegnaExtra(); updateTotals(); markDirty(); break;
    }
    case 'rStandard': {
      const testo = S.azienda.rateStandard || RATE_BASE;
      const nuove = rateDaTesto(testo, calc(p).totale);
      if (!nuove.length) { toast('Nelle Impostazioni scrivi le rate con le percentuali, es. 30% acconto, 70% saldo'); break; }
      if ((p.rate || []).length && !(await confirmBox('Sostituire le rate?', 'Le rate scritte finora vengono sostituite da quelle standard.', 'Sostituisci'))) break;
      p.rate = nuove; aggiornaAgenda(); ridisegnaPagamenti(); markDirty(); break;
    }
    case 'rAdd': {
      const st = statoPagamenti(p, today());
      const giaPrevisto = (p.rate || []).filter(r => !r.pagata).reduce((t, r) => t + (Number(r.importo) || 0), 0);
      (p.rate = p.rate || []).push({ id: 'r' + uid(), desc: p.rate.length ? 'Saldo' : 'Acconto', perc: '', importo: round2(Math.max(0, st.daIncassare - giaPrevisto)), scadenza: '', pagata: '' });
      ridisegnaPagamenti(); markDirty();
      const ins = $$('#pagamenti [data-r="desc"]'); if (ins.length) ins[ins.length - 1].focus();
      break;
    }
    case 'rPagata': case 'rNonPagata': case 'rDel': {
      const i = +b.closest('[data-rata]').dataset.rata; const r = p.rate && p.rate[i]; if (!r) break;
      if (act === 'rPagata') r.pagata = today();
      if (act === 'rNonPagata') r.pagata = '';
      if (act === 'rDel') p.rate.splice(i, 1);
      aggiornaPagamenti(); ridisegnaPagamenti(); markDirty();
      if (act === 'rPagata') toast(`Segnata pagata: ${fmtEur(Number(r.importo) || 0)}`);
      break;
    }
    case 'renumber': {
      p.numero = nextNumero(S.preventivi.filter(x => x.id !== p.id), Number(p.anno));
      $('.ed-top h1').textContent = numStr(p); const f = $('#f-num'); if (f) f.value = p.numero;
      $('#dupwrap').innerHTML = ''; markDirty(); toast('Nuovo numero: ' + numStr(p)); break;
    }
    case 'dup': {
      flushEditor();
      const anno = new Date().getFullYear();
      const np = { ...clone(p), id: uid(), anno, numero: nextNumero(S.preventivi, anno), data: today(), stato: 'bozza', esempio: false, creato: new Date().toISOString() };
      for (const k of ['rev', 'revisioni', 'firma', 'dataInvio', 'richiamato', 'rate', 'extra', 'spese', 'agenda']) delete np[k];
      np.sezioni.forEach(s => { s.id = uid(); s.voci.forEach(v => { v.id = uid(); }); });
      openEditor(np); saveCurrent(); toast('Copia creata: preventivo ' + numStr(np)); break;
    }
    case 'del':
      if (await confirmBox('Eliminare il preventivo ' + numStr(p) + '?', 'Il preventivo viene cancellato per tutti. Non si può annullare.', 'Elimina')) {
        clearTimeout(saveTimer); saveTimer = null; write('preventivi', p.id, DEL);
        const pid = p.id;
        store.idsWhere('foto', 'preventivoId', pid).then(ids => ids.forEach(id => write('foto', id, DEL))).catch(() => { if (fotoDi === pid) (S.foto || []).forEach(f => write('foto', f.id, DEL)); });
        S.current = null; go('lista'); toast('Preventivo eliminato');
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
    case 'vMisure': apriMisure(si, vi); break;
    case 'vUp': if (vi > 0) { const v = sez[si].voci; [v[vi - 1], v[vi]] = [v[vi], v[vi - 1]]; rerender(); } break;
    case 'vDown': { const v = sez[si].voci; if (vi < v.length - 1) { [v[vi + 1], v[vi]] = [v[vi], v[vi + 1]]; rerender(); } break; }
    case 'vDel': sez[si].voci.splice(vi, 1); rerender(); break;
    case 'vSave': {
      const v = sez[si].voci[vi];
      if (!v.desc.trim()) { toast('Scrivi prima la descrizione della voce'); break; }
      const ex = S.listino.find(x => (x.desc || '').trim().toLowerCase() === v.desc.trim().toLowerCase());
      const pr = num(v.prezzo);
      const kv = num(v.costo);
      write('listino', ex ? ex.id : uid(), { desc: v.desc.trim(), um: v.um, prezzo: isFinite(pr) ? round2(pr) : 0, categoria: (ex && ex.categoria) || sez[si].titolo || 'Varie', ...(String(v.costo ?? '').trim() && isFinite(kv) ? { costo: round2(kv) } : {}) });
      toast(ex ? 'Prezzo aggiornato nel listino' : 'Voce salvata nel listino'); break;
    }
  }
}
document.addEventListener('click', e => {
  if (!$('#app') || $('#app').hidden) return;
  const filt = e.target.closest('#main [data-filter]');
  if (filt && S.view === 'lista') { S.filter = S.filter === filt.dataset.filter && filt.classList.contains('sum') ? 'tutti' : filt.dataset.filter; renderLista(); return; }
  const open = e.target.closest('#main [data-open]');
  if (open) { const p = S.preventivi.find(x => x.id === open.dataset.open); if (p) { openEditor(p); if (open.dataset.agendaData) { const ag = $('#agenda'); if (ag) { ag.hidden = false; ag.scrollIntoView({ block: 'start' }); const i = $('[data-ag="inizio"]', ag); if (i) i.focus({ preventScroll: true }); } } } return; }
  const rl = e.target.closest('#main [data-rl]'); if (rl) { const x = S.misure.find(i => i.id === rl.dataset.rl); if (x) apriRilievo(x); return; }
  const li = e.target.closest('#main [data-li]'); if (li) { const x = S.listino.find(i => i.id === li.dataset.li); if (x) editListino(x); return; }
  const cl = e.target.closest('#main [data-cl]'); if (cl) { const x = S.clienti.find(i => i.id === cl.dataset.cl); if (x) editCliente(x); return; }
  const ft = e.target.closest('#main [data-foto]'); if (ft) { apriFoto(ft.dataset.foto); return; }
  const sg = e.target.closest('#main [data-sugg]');
  if (sg) { usaSuggerimento(sg); return; }
  const b = e.target.closest('#main [data-act], #totbar [data-act]');
  if (b) onAct(b);
});

/* ---------- Finestre ---------- */
const modal = $('#modal');
let modalClose = null;
function openModal(html, onClose) {
  const giaAperta = !modal.hidden;
  modal.innerHTML = html; modal.hidden = false; modalClose = onClose || null;
  if (!giaAperta) openLayer('modal', () => closeModal(false, true));
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
    if (x.costo !== undefined && x.costo !== '' && x.costo !== null) nv.costo = String(x.costo).replace('.', ',');
    if (empty) voci[0] = nv; else voci.push(nv);
    added++; markDirty();
    b.classList.add('added');
    $('#pk-n').textContent = `${added} ${added === 1 ? 'voce aggiunta' : 'voci aggiunte'}. Ricorda le quantità.`;
  });
}

/* ---------- Rilievi delle misure (fuori dal preventivo) ---------- */
const mqTxt = n => `${fmtNum(n)} mq`;
function risultatiHtml(a, per) {
  return `<span>Pavimento <b>${mqTxt(a.pavimento)}</b></span><span>Soffitto <b>${mqTxt(a.soffitto)}</b></span><span>Pareti <b>${mqTxt(a.pareti)}</b></span><span>Perimetro <b>${fmtNum(per)} ml</b></span>`;
}
function renderMisure() {
  main.innerHTML = `
    <div class="head"><div><span class="eyebrow">Rilievi in cantiere</span><h1>Misure</h1></div>
      <button class="btn primary" type="button" data-act="mNew">${IC.plus} Nuovo rilievo</button></div>
    <div class="toolbar"><input class="in search" id="mq" type="search" enterkeyhint="search" placeholder="Cerca per nome o stanza" value="${esc(S.mq)}" aria-label="Cerca rilievo"></div>
    <div class="tbl" id="mrows"></div>`;
  $('#mq').addEventListener('input', e => { S.mq = e.target.value; renderMisureRows(); });
  renderMisureRows(); enter();
}
function renderMisureRows() {
  const box = $('#mrows'); if (!box) return;
  if (!S.loaded.misure) { box.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  if (!S.misure.length) { box.innerHTML = `<div class="empty"><h3>Nessun rilievo</h3><p>Segna qui le misure delle stanze quando sei in cantiere: pavimento, pareti e perimetro si calcolano da soli e tutto si salva mentre scrivi. Poi le carichi nel preventivo con il pulsante «Misure».</p><button class="btn primary" type="button" data-act="mNew">${IC.plus} Nuovo rilievo</button></div>`; return; }
  const q = S.mq.trim().toLowerCase();
  const items = S.misure.filter(r => !q || [r.nome, ...(r.stanze || []).map(s => s.nome)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => String(b.modificato || b.creato || '').localeCompare(String(a.modificato || a.creato || '')));
  if (!items.length) { box.innerHTML = '<div class="empty"><p>Nessun rilievo trovato.</p></div>'; return; }
  box.innerHTML = items.map(r => {
    const n = (r.stanze || []).length; const t = totaliStanze(r.stanze);
    const nomi = (r.stanze || []).map(s => s.nome).filter(Boolean).join(', ');
    return `<button class="li" type="button" data-rl="${esc(r.id)}"><span class="d"><b style="font-weight:600">${esc(r.nome || 'Rilievo senza nome')}</b></span><span class="s">${n} ${n === 1 ? 'stanza' : 'stanze'}${nomi ? ' · ' + esc(nomi) : ''} · ${esc(fmtDate(r.data))}</span><span class="p">${mqTxt(t.pavimento)}</span></button>`;
  }).join('');
}
const nuovaStanza = h => ({ nome: '', l: '', p: '', h: h || '2,70', aperture: [] });
function apriRilievo(r) {
  if (!S.rilievo) openLayer('rilievo', () => { flushRilievo(); S.rilievo = null; render(); });
  S.rilievo = clone(r); render(); window.scrollTo(0, 0);
}
function chiudiRilievo() { flushRilievo(); S.rilievo = null; closeLayer('rilievo'); render(); window.scrollTo(0, 0); }
let rilievoTimer = null;
function markRilievo() { setSaveState('saving'); clearTimeout(rilievoTimer); rilievoTimer = setTimeout(salvaRilievo, 600); }
function salvaRilievo() {
  clearTimeout(rilievoTimer); rilievoTimer = null;
  const r = S.rilievo; if (!r) return;
  r.modificato = new Date().toISOString();
  const { id, ...dati } = r;
  write('misure', id, dati);
}
function flushRilievo() { if (rilievoTimer) salvaRilievo(); }
function stanzaHtml(s, i) {
  const f = (k, lbl, ph) => `<label class="field"><span>${lbl}</span><input class="in r" data-k="${k}" inputmode="decimal" value="${esc(s[k] ?? '')}" placeholder="${ph}"></label>`;
  return `<section class="card rl-st" data-st="${i}">
    <div class="rl-h"><input class="in" data-k="nome" autocapitalize="sentences" value="${esc(s.nome || '')}" placeholder="Stanza ${i + 1} (es. Bagno)" aria-label="Nome della stanza"><button class="icon-btn del" type="button" data-act="mStDel" aria-label="Togli stanza">${IC.trash}</button></div>
    <div class="grid rl-dim">${f('l', 'Lunghezza m', 'es. 4')}${f('p', 'Larghezza m', 'es. 3,5')}${f('h', 'Altezza m', '2,70')}</div>
    ${(s.aperture || []).map((a, j) => `<div class="grid rl-ap" data-ap="${j}">
      <label class="field"><span>Porta/finestra largh.</span><input class="in r" data-k="al" inputmode="decimal" value="${esc(a.l ?? '')}" placeholder="0,8"></label>
      <label class="field"><span>Altezza</span><input class="in r" data-k="ah" inputmode="decimal" value="${esc(a.h ?? '')}" placeholder="2,1"></label>
      <label class="field"><span>Quante</span><input class="in r" data-k="an" inputmode="decimal" value="${esc(a.n ?? '')}" placeholder="1"></label>
      <button class="icon-btn del" type="button" data-act="mApDel" aria-label="Togli porta o finestra">${IC.x}</button></div>`).join('')}
    <button class="btn" type="button" data-act="mAp">${IC.plus} Porta o finestra da togliere</button>
    <div class="rl-ris" aria-live="polite">${risultatiHtml(areeStanza(s), perimetro(s))}</div>
  </section>`;
}
function renderRilievo() {
  const r = S.rilievo;
  main.innerHTML = `
    <div class="ed-top">
      <button class="btn ghost" type="button" data-act="back" aria-label="Torna alle misure">${IC.back}<span class="back-label">Misure</span></button>
      <div class="ttl"><span class="eyebrow">Rilievo</span><h1 id="rl-h1">${esc(r.nome || 'Nuovo rilievo')}</h1></div>
      <span class="savestate" id="saveState" aria-live="polite"></span>
      <div class="ed-actions"><button class="btn danger" type="button" data-act="mDel">Elimina</button></div>
    </div>
    <section class="card">
      <div class="grid two">
        <label class="field"><span>Nome del rilievo</span><input class="in" id="rl-nome" autocapitalize="sentences" value="${esc(r.nome || '')}" placeholder="Es. Appartamento Rossi, via Roma 3"></label>
        <label class="field"><span>Data</span><input class="in" id="rl-data" type="date" value="${esc(r.data || '')}"></label>
      </div>
      <p class="help" style="margin:10px 0 0;font-size:13px;color:var(--stone)">Si salva da solo mentre scrivi. Nel preventivo lo carichi dal pulsante «Misure» della quantità.</p>
    </section>
    <div id="rl-stanze" class="rl-stanze">${(r.stanze || []).map(stanzaHtml).join('')}</div>
    <button class="btn rl-add" type="button" data-act="mStanza">${IC.plus} Aggiungi stanza</button>
    <section class="card rl-totc"><h2>Totale ${(r.stanze || []).length > 1 ? `di ${r.stanze.length} stanze` : ''}</h2><div class="rl-ris" id="rl-tot">${totHtml(r)}</div>
      <button class="btn primary rl-prev" type="button" data-act="mPreventivo">${IC.doc} Crea preventivo con queste misure</button></section>`;
  enter();
}
function totHtml(r) { const t = totaliStanze(r.stanze); return risultatiHtml(t, t.perimetro); }
function onRilievoInput(t) {
  const r = S.rilievo;
  if (t.id === 'rl-nome') { r.nome = t.value; const h = $('#rl-h1'); if (h) h.textContent = t.value.trim() || 'Nuovo rilievo'; }
  else if (t.id === 'rl-data') r.data = t.value;
  else if (t.dataset.k) {
    const sEl = t.closest('[data-st]'); const s = r.stanze[+sEl.dataset.st]; if (!s) return;
    const apEl = t.closest('[data-ap]');
    if (apEl) { const a = s.aperture[+apEl.dataset.ap]; if (!a) return; a[{ al: 'l', ah: 'h', an: 'n' }[t.dataset.k]] = t.value; }
    else s[t.dataset.k] = t.value;
    const ris = $('.rl-ris', sEl); if (ris) ris.innerHTML = risultatiHtml(areeStanza(s), perimetro(s));
    $('#rl-tot').innerHTML = totHtml(r);
  } else return;
  markRilievo();
}
async function onActMisure(act, b) {
  const r = S.rilievo;
  if (act === 'mNew') {
    apriRilievo({ id: uid(), nome: '', data: today(), stanze: [nuovaStanza()], creato: new Date().toISOString() });
    { const n = $('#rl-nome'); if (n) n.focus(); } // subito: un ritardo potrebbe rubare il cursore a un altro campo
    return true;
  }
  if (!r) return false;
  const si = b.closest('[data-st]') ? +b.closest('[data-st]').dataset.st : -1;
  const ridisegna = sel => { const y = window.scrollY; renderRilievo(); window.scrollTo(0, y); markRilievo(); if (sel) { const el = $(sel); if (el) el.focus(); } };
  switch (act) {
    case 'back': chiudiRilievo(); return true;
    case 'mStanza': { const ult = r.stanze[r.stanze.length - 1]; r.stanze.push(nuovaStanza(ult && ult.h)); ridisegna(`[data-st="${r.stanze.length - 1}"] [data-k="nome"]`); return true; }
    case 'mStDel': {
      const s = r.stanze[si]; const piena = s && (s.l || s.p || s.nome);
      if (piena && !(await confirmBox('Togliere questa stanza?', `${s.nome || 'La stanza ' + (si + 1)} viene tolta dal rilievo.`, 'Togli'))) return true;
      r.stanze.splice(si, 1); if (!r.stanze.length) r.stanze.push(nuovaStanza()); ridisegna(); return true;
    }
    case 'mPreventivo': flushRilievo(); preventivoDaRilievo(r); return true;
    case 'mAp': r.stanze[si].aperture.push({ l: '', h: '', n: '1' }); ridisegna(`[data-st="${si}"] [data-ap="${r.stanze[si].aperture.length - 1}"] [data-k="al"]`); return true;
    case 'mApDel': r.stanze[si].aperture.splice(+b.closest('[data-ap]').dataset.ap, 1); ridisegna(); return true;
    case 'mDel':
      if (await confirmBox(`Eliminare il rilievo ${r.nome ? '«' + r.nome + '»' : ''}?`, 'Il rilievo viene cancellato per tutti. Non si può annullare.', 'Elimina')) {
        clearTimeout(rilievoTimer); rilievoTimer = null;
        if (S.misure.some(x => x.id === r.id)) write('misure', r.id, DEL);
        S.rilievo = null; closeLayer('rilievo'); render(); toast('Rilievo eliminato');
      }
      return true;
  }
  return false;
}

function preventivoDaRilievo(r) {
  if (!(r.stanze || []).some(s => num(s.l) > 0 && num(s.p) > 0)) { toast('Scrivi prima lunghezza e larghezza di almeno una stanza'); return; }
  const righe = LAVORAZIONI.map(l => ({ l, opz: vociPerLavorazione(l, S.listino) }));
  const scelta = (l, opz) => { const sel = $(`#rp [data-lv="${l.k}"]`); return sel && sel.value !== '' ? opz[+sel.value] : null; };
  openModal(`<div class="sheet" id="rp" role="dialog" aria-modal="true" aria-labelledby="rp-t">
    <div class="sheet-h"><h2 id="rp-t">Preventivo da «${esc(r.nome || 'rilievo')}»</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="sheet-b">
      <p class="help" style="margin:0;font-size:13.5px;color:var(--stone)">Scegli i lavori: per ogni stanza le quantità si calcolano dalle misure. Il prezzo arriva dal listino quando c'è; puoi cambiarlo qui o dopo.</p>
      ${righe.map(({ l, opz }) => { const v = opz[0]; return `<div class="rp-row">
        <div class="rp-top"><label class="check"><input type="checkbox" data-lav="${l.k}"${l.si ? ' checked' : ''}> <b>${esc(l.nome)}</b></label>
        <label class="rp-pr"><input class="in r" data-lp="${l.k}" inputmode="decimal" value="${esc(v && v.prezzo != null ? String(v.prezzo).replace('.', ',') : '')}" placeholder="prezzo" aria-label="Prezzo ${esc(l.nome)}"><span>€/${l.um}</span></label></div>
        <select class="in rp-sel" data-lv="${l.k}" aria-label="Voce per ${esc(l.nome)}">${opz.map((o, i) => `<option value="${i}">${esc(o.desc)}${o.prezzo != null ? ' — ' + fmtEur(Number(o.prezzo)) : ''}</option>`).join('')}<option value="">${esc(l.desc)} (voce generica)</option></select>
      </div>`; }).join('')}
    </div>
    <div class="sheet-f"><button class="btn" type="button" data-close="no">Annulla</button><button class="btn primary" type="button" id="rp-ok">Crea preventivo</button></div>
  </div>`);
  $('#rp').addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.lv; if (!k) return;
    const r0 = righe.find(x => x.l.k === k); const v = scelta(r0.l, r0.opz);
    $(`#rp [data-lp="${k}"]`).value = v && v.prezzo != null ? String(v.prezzo).replace('.', ',') : '';
    $(`#rp [data-lav="${k}"]`).checked = true;
  });
  $('#rp-ok').onclick = () => {
    const scelte = righe.filter(({ l }) => $(`#rp [data-lav="${l.k}"]`).checked).map(({ l, opz }) => ({ l, v: scelta(l, opz) })).map(({ l, v }) => ({
      desc: v ? v.desc : l.desc, um: l.um, tipo: l.tipo, prezzo: $(`#rp [data-lp="${l.k}"]`).value.trim(), costo: v && v.costo != null ? String(v.costo).replace('.', ',') : ''
    }));
    if (!scelte.length) { toast('Scegli almeno un lavoro'); return; }
    const sezioni = sezioniDaRilievo(r, scelte, uid);
    if (!sezioni.length) { toast('Nessuna stanza con le misure complete'); return; }
    closeModal(true);
    const np = nuovoPreventivo();
    Object.assign(np, { oggetto: r.nome || '', sezioni, rilievoId: r.id });
    S.rilievo = null; closeLayer('rilievo');
    openEditor(np); saveCurrent();
    toast('Preventivo creato dalle misure: controlla i prezzi e aggiungi il cliente');
  };
}

/* ---------- Misure delle stanze ---------- */
function apriMisure(si, vi) {
  const voce = S.current && S.current.sezioni[si] && S.current.sezioni[si].voci[vi];
  const stanze = voce && Array.isArray(voce.misure) && voce.misure.length ? clone(voce.misure) : [{ l: '', p: '', h: '2,70', aperture: [] }];
  // le misure scritte restano sulla voce: riaprendo la finestra ci sono ancora
  const ricorda = () => { if (!voce || !S.current) return; voce.misure = clone(stanze); markDirty(); };
  const campo = (id, lbl, v, ph) => `<label class="field"><span>${lbl}</span><input class="in" id="${id}" inputmode="decimal" value="${esc(v)}" placeholder="${ph || ''}"></label>`;
  const disegna = () => {
    $('#ms-stanze').innerHTML = stanze.map((s, i) => `<div class="ms-stanza" data-st="${i}">
      ${stanze.length > 1 ? `<div class="ms-tit">Stanza ${i + 1}</div>` : ''}
      <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${campo(`ms-l-${i}`, 'Lunghezza m', s.l, 'es. 4')}${campo(`ms-p-${i}`, 'Larghezza m', s.p, 'es. 3,5')}${campo(`ms-h-${i}`, 'Altezza m', s.h)}</div>
      ${s.aperture.map((a, j) => `<div class="grid ms-ap" style="grid-template-columns:repeat(3,minmax(0,1fr))">${campo(`ms-al-${i}-${j}`, 'Porta/finestra largh.', a.l, '0,8')}${campo(`ms-ah-${i}-${j}`, 'Altezza', a.h, '2,1')}${campo(`ms-an-${i}-${j}`, 'Quante', a.n, '1')}</div>`).join('')}
      <button class="btn" type="button" data-act="msApertura" data-st="${i}">${IC.plus} Porta o finestra da togliere</button>
    </div>`).join('');
    aggiorna();
  };
  const leggi = () => stanze.forEach((s, i) => {
    s.l = $(`#ms-l-${i}`)?.value || ''; s.p = $(`#ms-p-${i}`)?.value || ''; s.h = $(`#ms-h-${i}`)?.value || '';
    s.aperture.forEach((a, j) => { a.l = $(`#ms-al-${i}-${j}`)?.value || ''; a.h = $(`#ms-ah-${i}-${j}`)?.value || ''; a.n = $(`#ms-an-${i}-${j}`)?.value || ''; });
  });
  const aggiorna = () => {
    leggi();
    const tot = stanze.map(areeStanza).reduce((t, a) => ({ pavimento: t.pavimento + a.pavimento, soffitto: t.soffitto + a.soffitto, pareti: t.pareti + a.pareti }), { pavimento: 0, soffitto: 0, pareti: 0 });
    const r = (k, l) => `<button class="ms-res" type="button" data-usa="${k}"${tot[k === 'pareti+soffitto' ? 'pareti' : k] > 0 ? '' : ' disabled'}><span>${l}</span><b>${fmtNum(k === 'pareti+soffitto' ? round2(tot.pareti + tot.soffitto) : tot[k])} mq</b><small>Usa</small></button>`;
    $('#ms-ris').innerHTML = r('pavimento', 'Pavimento') + r('soffitto', 'Soffitto') + r('pareti', 'Pareti') + r('pareti+soffitto', 'Pareti + soffitto');
  };
  openModal(`<div class="sheet" id="ms" role="dialog" aria-modal="true" aria-labelledby="ms-t">
    <div class="sheet-h"><h2 id="ms-t">Misure della stanza</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="sheet-b">${S.misure.length ? `<label class="field"><span>Carica un rilievo salvato</span><select class="in" id="ms-rilievo"><option value="">— scegli —</option>${S.misure.slice().sort((x, y) => String(y.modificato || '').localeCompare(String(x.modificato || ''))).map(r => `<option value="${esc(r.id)}">${esc(r.nome || 'Rilievo senza nome')}</option>`).join('')}</select></label>` : ''}<div id="ms-stanze"></div>
      <button class="btn" type="button" data-act="msStanza">${IC.plus} Aggiungi un'altra stanza</button>
      <div class="ms-ris" id="ms-ris" aria-live="polite"></div>
      <p class="help" style="margin:0;font-size:13px;color:var(--stone)">Nella quantità resta il calcolo (es. 4*3,5): puoi sempre correggerlo.</p>
    </div></div>`);
  disegna();
  $('#ms').addEventListener('input', e => {
    if (e.target.id === 'ms-rilievo') {
      const r = S.misure.find(x => x.id === e.target.value); if (!r) return;
      stanze.splice(0, stanze.length, ...clone(r.stanze || []).map(x => ({ l: x.l || '', p: x.p || '', h: x.h || '', aperture: x.aperture || [] })));
      if (!stanze.length) stanze.push({ l: '', p: '', h: '2,70', aperture: [] });
      disegna(); ricorda(); return;
    }
    aggiorna(); ricorda();
  });
  $('#ms').addEventListener('click', e => {
    const b = e.target.closest('[data-act], [data-usa]'); if (!b) return;
    if (b.dataset.act === 'msApertura') { leggi(); stanze[+b.dataset.st].aperture.push({ l: '', h: '', n: '1' }); disegna(); ricorda(); return; }
    if (b.dataset.act === 'msStanza') { leggi(); stanze.push({ l: '', p: '', h: stanze[stanze.length - 1].h, aperture: [] }); disegna(); ricorda(); return; }
    if (b.dataset.usa) {
      leggi();
      const expr = espressione(stanze, b.dataset.usa);
      if (!expr || !S.current) return;
      const v = S.current.sezioni[si].voci[vi];
      v.qta = expr; v.um = 'mq'; v.misure = clone(stanze);
      closeModal(true);
      const row = $(`#sezioni [data-sez="${si}"] [data-voce="${vi}"]`);
      if (row) { $('[data-v="qta"]', row).value = expr; $('[data-v="um"]', row).value = 'mq'; }
      updateTotals(); markDirty();
    }
  });
}

function firmaEditor(p) {
  return p.firma ? `<div class="note firma-ed" id="firma-ed" style="margin:12px 0 0">${IC.check}<span>Firmato da <b>${esc(p.firma.nome || 'il cliente')}</b> il ${esc(fmtDate(p.firma.data))}. Per cambiare qualcosa fai una nuova revisione: andrà rifirmato.</span></div>` : '<span id="firma-ed" hidden></span>';
}

/* ---------- Foto del sopralluogo ---------- */
// Caricate solo per il preventivo aperto (mai nell'elenco).
let fotoSub = null, fotoDi = null;
function seguiFoto(id) {
  if (fotoDi === id) return;
  if (fotoSub) { fotoSub(); fotoSub = null; }
  fotoDi = id; S.foto = [];
  if (!id) return;
  fotoSub = store.subscribeWhere('foto', 'preventivoId', id, list => {
    S.foto = list.sort((a, b) => String(a.creata).localeCompare(String(b.creata)));
    const g = $('#foto-grid'); if (g) g.innerHTML = fotoHtml();
  }, err => console.error(err));
}
function fotoHtml() {
  const l = S.foto || [];
  return l.map((f, i) => `<button class="ft" type="button" data-foto="${esc(f.id)}" aria-label="Foto ${i + 1} di ${l.length}"><img src="${esc(f.dataURL)}" alt="" loading="lazy" decoding="async"></button>`).join('')
    + (fotoCaricamento ? `<div class="ft carica" aria-live="polite">Riduco ${fotoCaricamento}…</div>` : '');
}
let fotoCaricamento = 0;
// Le foto che non si riescono a salvare: un solo avviso con il conteggio (arriva dopo «Foto aggiunta»).
let nonSalvate = 0, nonSalvateTimer = null;
function fotoNonSalvata() {
  nonSalvate++; clearTimeout(nonSalvateTimer);
  nonSalvateTimer = setTimeout(() => { toast(`${nonSalvate} ${nonSalvate === 1 ? 'foto non salvata' : 'foto non salvate'}: riprova`); nonSalvate = 0; }, 400);
}
async function aggiungiFoto(files) {
  const p = S.current; if (!p || !files.length) return;
  const { riduciFoto } = await import('./foto.js');
  let ok = 0, ko = 0;
  for (const file of files) {
    fotoCaricamento = files.length - ok - ko; const g = $('#foto-grid'); if (g) g.innerHTML = fotoHtml();
    try {
      const dataURL = await riduciFoto(file);
      // senza rete Firestore conferma solo quando torna il segnale: la foto resta in coda e si passa alla prossima
      write('foto', uid(), { preventivoId: p.id, creata: new Date().toISOString(), dataURL }).then(salvata => { if (!salvata) fotoNonSalvata(); });
      ok++;
    } catch (e) { console.error(e); ko++; }
  }
  fotoCaricamento = 0; const g = $('#foto-grid'); if (g) g.innerHTML = fotoHtml();
  if (ko) toast(`${ko} ${ko === 1 ? 'foto non caricata' : 'foto non caricate'}: formato non leggibile`);
  else toast(ok === 1 ? 'Foto aggiunta' : `${ok} foto aggiunte`);
}
function apriFoto(id) {
  const l = S.foto || []; let i = l.findIndex(f => f.id === id); if (i < 0) return;
  const draw = () => {
    const f = l[i];
    $('#fv-img').src = f.dataURL;
    $('#fv-n').textContent = `${i + 1} di ${l.length} · ${f.creata ? fmtDate(String(f.creata).slice(0, 10)) : ''}`;
    $('#fv-prev').disabled = i === 0; $('#fv-next').disabled = i === l.length - 1;
  };
  openModal(`<div class="sheet foto-view" id="fv" role="dialog" aria-modal="true" aria-labelledby="fv-n">
    <div class="sheet-h"><span id="fv-n"></span><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="fv-b"><img id="fv-img" alt="Foto del sopralluogo"></div>
    <div class="sheet-f"><button class="btn danger left" type="button" data-act="fotoDel">${IC.trash} Elimina</button><button class="btn" type="button" id="fv-prev" aria-label="Foto precedente">${IC.back}</button><button class="btn fv-next" type="button" id="fv-next" aria-label="Foto successiva">${IC.back}</button></div>
  </div>`);
  draw();
  $('#fv-prev').onclick = () => { if (i > 0) { i--; draw(); } };
  $('#fv-next').onclick = () => { if (i < l.length - 1) { i++; draw(); } };
  $('#fv [data-act="fotoDel"]').onclick = async () => {
    const f = l[i];
    if (!(await confirmBox('Eliminare questa foto?', 'La foto viene cancellata per tutti. Non si può annullare.', 'Elimina'))) return;
    write('foto', f.id, DEL); toast('Foto eliminata');
  };
}

/* ---------- Modelli di preventivo ---------- */
function salvaModello(p) {
  openModal(`<form class="sheet" id="md-form" role="dialog" aria-modal="true" aria-labelledby="md-t" style="width:min(460px,100%)">
    <div class="sheet-h"><h2 id="md-t">Salva come modello</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="sheet-b">
      <label class="field"><span>Nome del modello</span><input class="in" id="md-nome" required autocapitalize="sentences" value="${esc(p.oggetto || '')}" placeholder="Es. Bagno completo"></label>
      <p class="help" style="margin:0;font-size:13.5px;color:var(--stone)">Si salvano voci, prezzi, costi, IVA e testi. Il cliente, le firme e i pagamenti no. Lo ritrovi toccando «Nuovo preventivo».</p>
    </div>
    <div class="sheet-f"><button class="btn" type="button" data-close="no">Annulla</button><button class="btn primary" type="submit">Salva modello</button></div>
  </form>`);
  $('#md-form').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = $('#md-nome').value.trim(); if (!nome) return;
    const uguale = S.modelli.find(m => (m.nome || '').trim().toLowerCase() === nome.toLowerCase());
    closeModal(true);
    if (uguale && !(await confirmBox(`Sostituire il modello «${uguale.nome}»?`, 'C\'è già un modello con questo nome: viene aggiornato con questo preventivo.', 'Sostituisci'))) return;
    write('modelli', uguale ? uguale.id : uid(), { ...modelloDa(p, nome), creato: (uguale && uguale.creato) || new Date().toISOString(), modificato: new Date().toISOString() });
    toast(`Modello «${nome}» salvato`);
  });
}
function scegliModello() {
  const lista = S.modelli.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
  openModal(`<div class="sheet" id="nm" role="dialog" aria-modal="true" aria-labelledby="nm-t">
    <div class="sheet-h"><h2 id="nm-t">Nuovo preventivo</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="sheet-b">
      <button class="pick" type="button" data-act="nmVuoto"><span><b>Preventivo vuoto</b><small>Parti da zero</small></span><span class="p">${IC.plus}</span></button>
      <div class="pick-cat">Dai tuoi modelli</div>
      ${lista.length ? '' : `<div class="nm-vuoto"><b>Non hai ancora nessun modello.</b> Per crearne uno:<ol><li>apri un preventivo fatto bene, per esempio un bagno completo;</li><li>in alto tocca <b>«Salva modello»</b> e dagli un nome.</li></ol>Da quel momento lo trovi qui e ogni volta che tocchi «Nuovo preventivo»: escono le stesse voci e gli stessi prezzi, tu aggiungi solo il cliente.</div>`}
      ${lista.map(m => { const nv = (m.sezioni || []).reduce((t, s) => t + (s.voci || []).length, 0); return `<div class="nm-row"><button class="pick" type="button" data-modello="${esc(m.id)}"><span><b>${esc(m.nome || 'Modello')}</b><small>${nv} ${nv === 1 ? 'voce' : 'voci'}${m.oggetto && m.oggetto !== m.nome ? ' · ' + esc(m.oggetto) : ''}</small></span><span class="p">${fmtEur(totaleDi(m))}</span></button><button class="icon-btn del" type="button" data-act="mdDel" data-id="${esc(m.id)}" aria-label="Elimina modello ${esc(m.nome || '')}">${IC.trash}</button></div>`; }).join('')}
      <button class="btn nm-pronti" type="button" data-act="mdPronti">${IC.plus} Carica modelli pronti (prezzi medi Rimini)</button>
    </div></div>`);
  $('#nm').addEventListener('click', async e => {
    const b = e.target.closest('[data-act], [data-modello]'); if (!b) return;
    if (b.dataset.act === 'mdPronti') {
      const { modelliPronti } = await import('./modelli-pronti.js');
      const ci = new Set(S.modelli.map(m => (m.nome || '').trim().toLowerCase()));
      const nuovi = modelliPronti(S.listino).filter(m => !ci.has(m.nome.toLowerCase()));
      const ora = new Date().toISOString();
      nuovi.forEach(m => write('modelli', uid(), { ...m, creato: ora, modificato: ora, pronto: true }));
      toast(nuovi.length ? `Aggiunti ${nuovi.length} modelli pronti: quantità di un caso tipo, correggile con le misure vere` : 'I modelli pronti ci sono già');
      setTimeout(scegliModello, 150);
      return;
    }
    if (b.dataset.act === 'nmVuoto') { closeModal(true); const np = nuovoPreventivo(); openEditor(np); saveCurrent(); return; }
    if (b.dataset.modello) {
      const m = S.modelli.find(x => x.id === b.dataset.modello); if (!m) return;
      closeModal(true);
      const np = daModello(m, nuovoPreventivo(), uid);
      openEditor(np); saveCurrent(); toast(`Preventivo dal modello «${m.nome}»: aggiungi il cliente`);
      return;
    }
    if (b.dataset.act === 'mdDel') {
      const m = S.modelli.find(x => x.id === b.dataset.id); if (!m) return;
      if (!(await confirmBox(`Eliminare il modello «${m.nome}»?`, 'I preventivi già fatti con questo modello restano come sono.', 'Elimina'))) return;
      write('modelli', m.id, DEL); toast('Modello eliminato');
    }
  });
}

/* ---------- Pagina Agenda ---------- */
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const piuGiorni = (isoD, n) => { const d = new Date(isoD + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ggmm = isoD => `${giornoSett(isoD)} ${isoD.slice(8, 10)}/${isoD.slice(5, 7)}`;
function agendaBanner() {
  const oggi = today();
  const cs = cantieri(S.preventivi);
  const corso = cs.filter(c => c.inizio <= oggi && c.fine >= oggi).length;
  const presto = cs.filter(c => c.inizio > oggi && c.inizio <= piuGiorni(oggi, 7)).sort((a, b) => a.inizio.localeCompare(b.inizio));
  const prog = daProgrammare(S.preventivi).length;
  const indietro = S.noteAgenda.filter(n => !n.fatto && n.data && n.data <= oggi).length;
  const parti = [];
  if (corso) parti.push(`<b>${corso} ${corso === 1 ? 'cantiere in corso' : 'cantieri in corso'}</b>`);
  if (presto.length) parti.push(`${presto.length === 1 ? '1 inizia' : presto.length + ' iniziano'} ${ggmm(presto[0].inizio)}`);
  if (prog) parti.push(`${prog} da programmare`);
  if (indietro) parti.push(`${indietro} ${indietro === 1 ? 'nota da fare' : 'note da fare'}`);
  if (!parti.length) {
    const prossimo = cs.filter(c => c.inizio > oggi).sort((a, b) => a.inizio.localeCompare(b.inizio))[0];
    if (prossimo) parti.push(`prossimo inizio ${ggmm(prossimo.inizio)}`);
    else if (S.noteAgenda.length || S.preventivi.some(p => !p.esempio && (p.stato === 'accettato' || p.firma))) parti.push('cantieri e note dei giorni');
    else return '';
  }
  return `<button class="note ag-banner" id="agenda-banner" type="button" data-act="agenda">${IC.calendario}<span><b>Agenda</b> · ${parti.join(' · ')}</span><span class="vedi">Apri</span></button>`;
}
function cantiereHtml(c, oggi) {
  const p = c.p; const a = p.agenda || {};
  const g = giornoLavoro(oggi, a.inizio, c.giorni);
  return `<button class="ag-item" type="button" data-open="${esc(p.id)}">
    <b>${esc(p.cliente?.nome || 'Cliente')} – ${esc(p.oggetto || 'lavori')}</b>
    ${p.cantiere || p.cliente?.indirizzo ? `<span>${esc(p.cantiere || p.cliente.indirizzo)}</span>` : ''}
    <span>dal ${ggmm(c.inizio)} al ${ggmm(c.fine)}${g ? ` · <b>giorno ${g} di ${c.giorni}</b>` : ` · ${c.giorni} giorni`}</span>
    ${a.chi ? `<span>${IC.persone || ''}Chi ci lavora: ${esc(a.chi)}</span>` : ''}
    ${a.note ? `<span class="ag-nota-c">${esc(a.note)}</span>` : ''}
  </button>`;
}
function notaHtml(n) {
  return `<div class="nota${n.fatto ? ' fatta' : ''}" data-nota="${esc(n.id)}">
    <button class="nota-chk" type="button" data-act="notaFatto" aria-pressed="${n.fatto ? 'true' : 'false'}" aria-label="${n.fatto ? 'Segna da fare' : 'Segna fatta'}">${n.fatto ? IC.check : ''}</button>
    <button class="nota-t" type="button" data-act="notaEdit"><b>${ggmm(n.data)}</b> ${esc(n.testo)}</button>
  </div>`;
}
function renderAgenda() {
  const oggi = today();
  const lun = S.settimana || lunediDi(oggi); const dom = piuGiorni(lun, 6);
  const w = agendaSettimana(S.preventivi, S.noteAgenda, lun, oggi);
  const pros = agendaSettimana(S.preventivi, [], piuGiorni(lun, 7), oggi);
  const indietro = S.noteAgenda.filter(n => !n.fatto && n.data && n.data < oggi).sort((a, b) => a.data.localeCompare(b.data));
  const prog = daProgrammare(S.preventivi);
  const avanti = cantieri(S.preventivi).filter(c => c.inizio > piuGiorni(lun, 13)).sort((a, b) => a.inizio.localeCompare(b.inizio)).slice(0, 10);
  const mese = (x, conMese) => `${+x.slice(8, 10)}${conMese ? ' ' + MESI[+x.slice(5, 7) - 1] : ''}`;
  const titolo = `Settimana dal ${mese(lun, lun.slice(5, 7) !== dom.slice(5, 7))} al ${mese(dom, true)}`;
  const vuoto = t => `<p class="help" style="margin:0;color:var(--stone)">${t}</p>`;
  main.innerHTML = `
    <div class="ed-top">
      <button class="btn ghost" type="button" data-act="back" aria-label="Torna ai preventivi">${IC.back}<span class="back-label">Preventivi</span></button>
      <div class="ttl"><span class="eyebrow">Agenda dei cantieri</span><h1>${titolo}</h1></div>
    </div>
    <div class="ag-nav"><button class="btn" type="button" data-act="agPrec" aria-label="Settimana prima">‹ Prima</button><button class="btn" type="button" data-act="agOggi">Oggi</button><button class="btn" type="button" data-act="agSucc" aria-label="Settimana dopo">Dopo ›</button></div>
    ${indietro.length ? `<section class="card ag-card ag-ind" id="ag-indietro"><h2>Da fare, rimaste indietro</h2>${indietro.map(notaHtml).join('')}</section>` : ''}
    <section class="card ag-card"><h2>Cantieri in corso</h2>${w.corso.length ? w.corso.map(c => cantiereHtml(c, oggi)).join('') : vuoto('Nessun cantiere in questa settimana.')}</section>
    ${w.inizi.length || w.fini.length ? `<section class="card ag-card"><h2>Inizi e fine lavori</h2>
      ${w.inizi.map(c => `<button class="ag-riga" type="button" data-open="${esc(c.p.id)}"><span class="ag-tag ini">Inizia</span><b>${ggmm(c.inizio)}</b> ${esc(c.p.cliente?.nome || '')} – ${esc(c.p.oggetto || '')}</button>`).join('')}
      ${w.fini.map(c => `<button class="ag-riga" type="button" data-open="${esc(c.p.id)}"><span class="ag-tag fin">Finisce</span><b>${ggmm(c.fine)}</b> ${esc(c.p.cliente?.nome || '')} – ${esc(c.p.oggetto || '')}${c.rata ? ` · <span class="ag-rata">${esc(c.rata.desc || 'Rata')} ${fmtEur(Number(c.rata.importo) || 0)} da incassare</span>` : ''}</button>`).join('')}
    </section>` : ''}
    <section class="card ag-card" id="ag-note"><h2>Note della settimana</h2>
      ${(() => { const l = w.note.filter(n => !indietro.includes(n)); return l.length ? l.map(notaHtml).join('') : vuoto('Consegne, sopralluoghi, appuntamenti: aggiungili qui.'); })()}
      <button class="btn" type="button" data-act="agNota" style="margin-top:10px">${IC.plus} Aggiungi nota</button>
    </section>
    ${pros.corso.length ? `<section class="card ag-card"><h2>Settimana dopo</h2>${pros.corso.map(c => `<button class="ag-riga" type="button" data-open="${esc(c.p.id)}"><b>${c.inizio > piuGiorni(lun, 6) ? 'inizia ' + ggmm(c.inizio) : 'continua'}</b> ${esc(c.p.cliente?.nome || '')} – ${esc(c.p.oggetto || '')}${c.fine <= piuGiorni(lun, 13) ? ' · finisce ' + ggmm(c.fine) : ''}</button>`).join('')}</section>` : ''}
    ${avanti.length ? `<section class="card ag-card" id="ag-avanti"><h2>Più avanti</h2>${avanti.map(c => `<button class="ag-riga" type="button" data-open="${esc(c.p.id)}"><b>${ggmm(c.inizio)}</b> ${esc(c.p.cliente?.nome || '')} – ${esc(c.p.oggetto || '')} · ${c.giorni} giorni</button>`).join('')}</section>` : ''}
    ${prog.length ? `<section class="card ag-card" id="ag-programma"><h2>Da programmare <small>lavori accettati senza data</small></h2>${prog.map(p => `<div class="ag-prog"><button class="ag-riga" type="button" data-open="${esc(p.id)}" data-agenda-data="1"><b>${esc(p.cliente?.nome || 'Cliente')}</b> – ${esc(p.oggetto || 'lavori')}<span class="vedi">Metti la data</span></button><button class="btn" type="button" data-act="agNoAgenda" data-id="${esc(p.id)}" title="Lavoro già fatto o da non mettere in agenda">Già fatto</button></div>`).join('')}</section>` : ''}`;
  enter();
}
function notaSheet(n) {
  const nuova = !n; n = n || { data: today(), testo: '' };
  openModal(`<form class="sheet" id="an" role="dialog" aria-modal="true" aria-labelledby="an-t" style="width:min(460px,100%)">
    <div class="sheet-h"><h2 id="an-t">${nuova ? 'Nuova nota' : 'Nota'}</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="sheet-b">
      <label class="field"><span>Giorno</span><input class="in" type="date" id="an-data" required value="${esc(n.data)}"></label>
      <label class="field"><span>Cosa</span><textarea class="in" id="an-testo" required placeholder="Es. consegna piastrelle da Ceramiche X; sopralluogo Neri ore 17">${esc(n.testo)}</textarea></label>
    </div>
    <div class="sheet-f">${nuova ? '' : '<button class="btn danger left" type="button" id="an-del">Elimina</button>'}<button class="btn" type="button" data-close="no">Annulla</button><button class="btn primary" type="submit">Salva</button></div>
  </form>`);
  $('#an').addEventListener('submit', e => {
    e.preventDefault();
    const data = $('#an-data').value, testo = $('#an-testo').value.trim();
    if (!data || !testo) { toast('Scrivi il giorno e cosa fare'); return; }
    write('noteAgenda', nuova ? uid() : n.id, { ...(nuova ? { creata: new Date().toISOString(), fatto: false } : n), data, testo, id: undefined });
    closeModal(true); if (S.view === 'agenda') renderAgenda(); toast('Nota salvata');
  });
  const del = $('#an-del');
  if (del) del.onclick = () => { write('noteAgenda', n.id, DEL); closeModal(true); if (S.view === 'agenda') renderAgenda(); toast('Nota eliminata'); };
}
async function onActAgenda(act, b) {
  if (act === 'back') { go('lista'); return true; }
  if (act === 'agPrec' || act === 'agSucc') { S.settimana = piuGiorni(S.settimana || lunediDi(today()), act === 'agPrec' ? -7 : 7); renderAgenda(); return true; }
  if (act === 'agOggi') { S.settimana = lunediDi(today()); renderAgenda(); return true; }
  if (act === 'agNota') { notaSheet(null); return true; }
  const nEl = b.closest('[data-nota]'); const n = nEl && S.noteAgenda.find(x => x.id === nEl.dataset.nota);
  if (act === 'notaEdit' && n) { notaSheet(n); return true; }
  if (act === 'agNoAgenda') {
    const p = S.preventivi.find(x => x.id === b.dataset.id); if (!p) return true;
    const { id, ...r } = p;
    write('preventivi', id, { ...r, agenda: { ...(p.agenda || {}), nessuna: true }, modificato: new Date().toISOString() });
    toast('Tolto da «Da programmare»: se serve, metti la data nel preventivo');
    return true;
  }
  if (act === 'notaFatto' && n) { const { id, ...r } = n; write('noteAgenda', id, { ...r, fatto: !n.fatto }); return true; }
  return false;
}

/* ---------- Cantiere in agenda ---------- */
const GIORNI_SETT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const giornoSett = isoD => GIORNI_SETT[new Date(isoD + 'T12:00:00').getDay()];
function agFineHtml(p) {
  const a = p.agenda || {};
  const fine = fineLavori(a.inizio, a.giorni);
  if (!fine) return 'Metti la data di inizio e i giorni lavorativi: la fine si calcola da sola (sabato, domenica e festivi esclusi).';
  const fuori = p.stato !== 'accettato' && !p.firma ? ' <span class="ag-fuori">Non compare in agenda finché il preventivo non è «Accettato».</span>' : '';
  const parte = lavorativo(a.inizio) ? '' : ` · si parte ${giornoSett(spostaLavorativi(a.inizio, 0))} ${fmtDate(spostaLavorativi(a.inizio, 0))}`;
  return `Fine prevista: <b>${giornoSett(fine)} ${fmtDate(fine)}</b> · ${a.giorni} ${Number(a.giorni) === 1 ? 'giorno lavorativo' : 'giorni lavorativi'}${parte}${fuori}`;
}
function aggiornaAgenda() {
  const p = S.current; if (!p) return;
  const el = $('#ag-fine'); if (el) el.innerHTML = agFineHtml(p);
  const a = p.agenda || {}; const fine = fineLavori(a.inizio, a.giorni);
  if (fine && (p.rate || []).length) {
    const prima = JSON.stringify(p.rate);
    p.rate = scadenzeDaCantiere(p.rate, a.inizio, fine);
    if (JSON.stringify(p.rate) !== prima) ridisegnaPagamenti();
  }
}
async function calendarioCantiere(p) {
  const a = p.agenda || {};
  if (!fineLavori(a.inizio, a.giorni)) { toast('Metti prima la data di inizio e i giorni lavorativi'); return; }
  const nome = `Cantiere ${(p.oggetto || p.cliente?.nome || 'lavori').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.ics`;
  const blob = new Blob([icsCantiere(p, S.azienda)], { type: 'text/calendar' });
  const file = new File([blob], nome, { type: 'text/calendar' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: nome }); return; } }
  catch (e) { if (e && e.name === 'AbortError') return; }
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = nome;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  toast('Apri il file scaricato per aggiungerlo al calendario');
}

/* ---------- Lavori extra (varianti) ---------- */
const mostraExtra = p => !p.esempio && (p.stato === 'accettato' || !!p.firma || (p.extra || []).length > 0);
function varianteHtml(x, i) {
  const dis = x.firma ? ' disabled' : '';
  return `<div class="x-var${x.firma ? ' firmata' : ''}" data-x="${i}">
    <div class="x-h"><b>Variante ${x.n}</b><span>${esc(fmtDate(x.data))}</span>${x.firma ? '' : `<button class="icon-btn del" type="button" data-act="xDel" aria-label="Elimina variante ${x.n}">${IC.trash}</button>`}</div>
    <label class="field"><span>Titolo</span><input class="in" data-xt="1" value="${esc(x.titolo || '')}" placeholder="Es. Spostamento termosifone"${dis}></label>
    ${(x.voci || []).map((v, j) => `<div class="x-voce" data-xj="${j}">
      <label class="field xd"><span>Descrizione</span><textarea class="in" rows="1" data-xv="desc" placeholder="Lavoro in più"${dis}>${esc(v.desc)}</textarea></label>
      <label class="field xu"><span>U.M.</span><select class="in" data-xv="um"${dis}>${opt(UM.map(u => [u, u]), v.um)}</select></label>
      <label class="field xq"><span>Quantità</span><input class="in r" data-xv="qta" inputmode="decimal" value="${esc(v.qta)}" placeholder="${v.um === 'a corpo' ? '1' : ''}"${dis}></label>
      <label class="field xp"><span>Prezzo €</span><input class="in r" data-xv="prezzo" inputmode="decimal" value="${esc(v.prezzo)}" placeholder="0,00"${dis}></label>
      ${x.firma ? '' : `<button class="icon-btn del xx" type="button" data-act="xvDel" aria-label="Togli voce">${IC.x}</button>`}
    </div>`).join('')}
    ${x.firma ? `<div class="note firma-ed" style="margin:10px 0 0">${IC.check}<span>Firmata da <b>${esc(x.firma.nome || 'il cliente')}</b> il ${esc(fmtDate(x.firma.data))}</span></div>` : `<button class="btn" type="button" data-act="xvAdd">${IC.plus} Aggiungi voce</button>`}
    <div class="x-f"><span class="x-tot">${xTotHtml(x)}</span><button class="btn" type="button" data-act="xPdf">${IC.doc} PDF e firma</button></div>
  </div>`;
}
function xTotHtml(x) { return `Totale variante <b>${fmtEur(totaleVariante(S.current, x))}</b> IVA compresa`; }
function extraTotHtml(p) {
  const n = (p.extra || []).length;
  return n ? `<span>Preventivo <b>${fmtEur(calc(p).totale)}</b></span><span>Lavori extra <b>${fmtEur(totaleExtra(p))}</b></span><span>Totale con i lavori extra <b>${fmtEur(round2(calc(p).totale + totaleExtra(p)))}</b></span>` : '<span>Nessuna variante: aggiungila quando il cliente chiede lavori in più.</span>';
}
function ridisegnaExtra() { const l = $('#extra-list'); if (l && S.current) { l.innerHTML = (S.current.extra || []).map(varianteHtml).join(''); $$('#extra-list textarea').forEach(autoGrow); } aggiornaExtra(); }
function aggiornaExtra() {
  const p = S.current; if (!p) return;
  $$('#extra [data-x]').forEach(el => { const x = (p.extra || [])[+el.dataset.x]; const t = $('.x-tot', el); if (x && t) t.innerHTML = xTotHtml(x); });
  const tot = $('#extra-tot'); if (tot) tot.innerHTML = extraTotHtml(p);
}

/* ---------- Costi reali del cantiere ---------- */
function spesaHtml(s, i) {
  return `<div class="spesa" data-spi="${i}">
    <label class="field sd"><span>Descrizione</span><input class="in" data-sp="desc" value="${esc(s.desc || '')}" placeholder="Es. Piastrelle, 3 giorni di 2 operai, noleggio"></label>
    <label class="field st"><span>Tipo</span><select class="in" data-sp="tipo">${opt(TIPI_SPESA, s.tipo || 'materiali')}</select></label>
    <label class="field sg"><span>Data</span><input class="in" type="date" data-sp="data" value="${esc(s.data || '')}"></label>
    <label class="field si"><span>Importo €</span><input class="in r" data-sp="importo" inputmode="decimal" value="${esc(s.importo === '' || s.importo == null ? '' : String(s.importo).replace('.', ','))}" placeholder="0,00"></label>
    <button class="icon-btn del sx" type="button" data-act="spDel" aria-label="Togli spesa">${IC.trash}</button>
  </div>`;
}
function speseSumHtml(p) {
  const c = consuntivo(p);
  if (!(p.spese || []).length) return `<span>Ricavo senza IVA <b>${fmtEur(c.ricavo)}</b></span><span>Segna qui materiali, manodopera e altre spese per vedere quanto ti resta davvero.</span>`;
  const t = TIPI_SPESA.filter(([k]) => c.perTipo[k]).map(([k, l]) => `${l.toLowerCase()} ${fmtEur(c.perTipo[k])}`).join(', ');
  return `<span>Ricavo senza IVA <b>${fmtEur(c.ricavo)}</b></span><span>Spese <b>${fmtEur(c.costi)}</b>${t ? ` (${t})` : ''}</span>`
    + `<span class="${c.margine < 0 ? 'neg' : 'pos'}">Margine reale <b>${fmtEur(c.margine)} · ${fmtNum(c.perc, 1)}%</b></span>`
    + (c.previsto ? `<span>Previsto dai costi delle voci <b>${fmtEur(c.previsto.margine)} · ${fmtNum(c.previsto.perc, 1)}%</b></span>` : '');
}
function aggiornaSpese() { const el = $('#sp-sum'); if (el && S.current) el.innerHTML = speseSumHtml(S.current); }
function ridisegnaSpese() { const l = $('#sp-list'); if (l && S.current) l.innerHTML = (S.current.spese || []).map(spesaHtml).join(''); aggiornaSpese(); }

/* ---------- Pagamenti ---------- */
const eur2 = n => (isFinite(n) ? fmtNum(n, 2) : '');
function pagamentiHtml(p) {
  const rate = p.rate || [];
  const st = statoPagamenti(p, today());
  const riga = (r, i) => `<div class="rata${r.pagata ? ' pagata' : ''}${!r.pagata && r.scadenza && r.scadenza < today() ? ' late' : ''}" data-rata="${i}">
    <label class="field rd"><span>Descrizione</span><input class="in" data-r="desc" value="${esc(r.desc)}" placeholder="Es. Acconto"></label>
    <label class="field rp"><span>%</span><input class="in r" data-r="perc" inputmode="decimal" value="${esc(r.perc === '' || r.perc == null ? '' : String(r.perc).replace('.', ','))}" placeholder="—"></label>
    <label class="field ri"><span>Importo €</span><input class="in r" data-r="importo" inputmode="decimal" value="${esc(eur2(Number(r.importo)))}"></label>
    <label class="field rs"><span>Scadenza</span><input class="in" type="date" data-r="scadenza" value="${esc(r.scadenza || '')}"></label>
    <div class="field rq"><span>Pagata il</span>${r.pagata
      ? `<div class="pgd"><input class="in" type="date" data-r="pagata" value="${esc(r.pagata)}"><button class="icon-btn" type="button" data-act="rNonPagata" aria-label="Segna come non pagata">${IC.x}</button></div>`
      : `<button class="btn" type="button" data-act="rPagata">${IC.check} Pagata oggi</button>`}</div>
    <button class="icon-btn del rx" type="button" data-act="rDel" aria-label="Togli rata">${IC.trash}</button>
  </div>`;
  return `<div class="pg-sum" id="pg-sum">${pgSum(st)}</div>
    <div class="rate">${rate.map(riga).join('')}</div>
    <div class="pg-act">
      <button class="btn" type="button" data-act="rStandard">Rate standard</button>
      <button class="btn" type="button" data-act="rAdd">${IC.plus} Aggiungi rata</button>
    </div>
    ${rate.length ? '' : `<p class="help" style="margin:8px 0 0;font-size:13px;color:var(--stone)">«Rate standard»: ${esc(S.azienda.rateStandard || RATE_BASE)} (si cambia in Impostazioni).</p>`}`;
}
function pgSum(st) {
  return `<span>Incassato <b>${fmtEur(st.incassato)}</b></span><span>Da incassare <b>${fmtEur(st.daIncassare)}</b></span>${st.prossima ? `<span>Prossima: <b>${esc(st.prossima.desc || 'rata')}</b> ${fmtEur(Number(st.prossima.importo) || 0)}${st.prossima.scadenza ? ' entro il ' + fmtDate(st.prossima.scadenza) : ''}${st.scadute ? ' <em class="scaduta">scaduta</em>' : ''}</span>` : ''}`;
}
function ridisegnaPagamenti() { const b = $('#pg-body'); if (b && S.current) b.innerHTML = pagamentiHtml(S.current); }
function aggiornaPagamenti() {
  const p = S.current; if (!p || !p.rate || !p.rate.length) { const s = $('#pg-sum'); if (s && p) s.innerHTML = pgSum(statoPagamenti(p, today())); return; }
  p.rate = ricalcolaRate(p.rate, calc(p).totale);
  $$('#pagamenti [data-rata]').forEach(el => {
    const r = p.rate[+el.dataset.rata]; const inp = $('[data-r="importo"]', el);
    if (r && inp && document.activeElement !== inp) inp.value = eur2(Number(r.importo));
  });
  const s = $('#pg-sum'); if (s) s.innerHTML = pgSum(statoPagamenti(p, today()));
}

/* ---------- Revisioni precedenti ---------- */
function apriRevisioni() {
  const p = S.current; if (!p) return;
  const lista = (p.revisioni || []).slice().reverse();
  openModal(`<div class="sheet" id="rv" role="dialog" aria-modal="true" aria-labelledby="rv-t">
    <div class="sheet-h"><h2 id="rv-t">Revisioni precedenti</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi">${IC.x}</button></div>
    <div class="sheet-b">
      <p class="help" style="margin:0;font-size:14px;color:var(--stone)">Ora stai lavorando su ${esc(numStr(p))}. Le versioni vecchie si possono rivedere in PDF o rimettere al posto di quella attuale.</p>
      ${lista.map(r => `<div class="rv-item">
        <div class="rv-i"><b>${esc(numStr({ ...p, rev: r.n }))}${r.n === 1 ? ' (prima versione)' : ''}${r.contenuto && r.contenuto.firma ? ' · firmata' : ''}</b><span>${esc(fmtDate(r.data))} · ${fmtEur(r.totale)}</span></div>
        <div class="rv-a"><button class="btn" type="button" data-act="rvVedi" data-n="${r.n}">${IC.doc} Vedi PDF</button><button class="btn" type="button" data-act="rvRipristina" data-n="${r.n}">Ripristina</button></div>
      </div>`).join('')}
    </div></div>`);
  $('#rv').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || !S.current) return;
    const n = Number(b.dataset.n);
    const r = (S.current.revisioni || []).find(x => x.n === n); if (!r) return;
    if (b.dataset.act === 'rvVedi') {
      closeModal(true);
      openPreview({ ...clone(S.current), ...clone(r.contenuto), rev: n, stato: 'archiviata', firma: r.contenuto.firma || undefined });
    }
    if (b.dataset.act === 'rvRipristina') {
      if (!(await confirmBox(`Ripristinare la ${n === 1 ? 'prima versione' : 'rev. ' + n}?`, 'La versione attuale resta salvata tra le revisioni precedenti.', 'Ripristina'))) return;
      const q = ripristinaRevisione(S.current, n, today()); if (!q) return;
      closeModal(true);
      S.current = q; saveCurrent(); renderEditor();
      toast('Ripristinata: ora è ' + numStr(q));
    }
  });
}

/* ---------- Anteprima PDF ---------- */
async function openPreview(versione, { variante } = {}) {
  const vi = Number.isInteger(variante) ? variante : null;
  if (vi !== null) versione = documentoVariante(S.current, vi);
  const p = versione || clone(S.current);
  try {
    const m = await import('./pdf.js');
    openLayer('preview', () => m.closePreview(true));
    const segnaInviato = () => {
      if (versione || !S.current || S.current.id !== p.id || S.current.stato !== 'bozza') return false;
      S.current.stato = 'inviato'; S.current.dataInvio = today(); saveCurrent();
      const sel = $('#f-stato'); if (sel) sel.value = 'inviato';
      return true;
    };
    await m.openPreview(p, S.azienda, {
      onClose: () => closeLayer('preview'),
      onSent: () => { segnaInviato(); toast('Preventivo segnato come inviato'); },
      onShared: () => { segnaInviato(); },
      onFirma: versione && vi === null ? null : async () => {
        const { apriFirma, chiudiFirma } = await import('./firma.js');
        openLayer('firma', () => chiudiFirma());
        const f = await apriFirma(vi === null ? { nome: (p.cliente && p.cliente.nome) || '' } : { nome: (p.cliente && p.cliente.nome) || '', titolo: 'Firma della variante', nota: 'Il cliente accetta i lavori extra di questa variante. Il preventivo principale non cambia.' });
        closeLayer('firma');
        if (!f || !S.current || S.current.id !== p.id) return null;
        if (vi !== null) {
          const x = (S.current.extra || [])[vi]; if (!x) return null;
          x.firma = f; saveCurrent(); ridisegnaExtra();
          toast(`Variante ${x.n} firmata`);
          return documentoVariante(S.current, vi);
        }
        S.current.firma = f; S.current.stato = 'accettato';
        saveCurrent();
        const sel = $('#f-stato'); if (sel) sel.value = 'accettato';
        const fe = $('#firma-ed'); if (fe) fe.outerHTML = firmaEditor(S.current);
        toast('Firmato: il preventivo è «Accettato»');
        return clone(S.current);
      },
      messaggio: vi !== null ? `Buongiorno${p.cliente && p.cliente.nome ? ' ' + p.cliente.nome : ''}, le invio la ${p.titoloDoc.charAt(0).toLowerCase() + p.titoloDoc.slice(1)} per i lavori extra. ${S.azienda.ragione || ''} – ${S.azienda.telefono || ''}`.trim() : messaggioInvio(S.azienda.messaggio || MESSAGGIO_BASE, p, S.azienda),
      telefono: (p.cliente && p.cliente.telefono) || '',
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
        <label class="field"><span>Costo tuo (€, facoltativo)</span><input class="in" id="lf-k" inputmode="decimal" placeholder="non va nel PDF" value="${esc(String(x.costo ?? '').replace('.', ','))}"></label>
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
    const kr = $('#lf-k').value.trim(); const k = num(kr);
    if (kr && !isFinite(k)) { toast('Controlla il costo'); return; }
    const dati = { ...(isNew ? {} : x), desc, um: $('#lf-u').value, prezzo: isFinite(pr) ? round2(pr) : 0, categoria: $('#lf-c').value.trim() || 'Varie' };
    delete dati.id;
    if (kr) dati.costo = round2(k); else delete dati.costo;
    write('listino', isNew ? uid() : x.id, dati);
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
        <div class="grid two"><label class="field"><span>IVA predefinita</span><select class="in" id="s-iva" data-set="ivaDefault" data-t="num">${opt(IVA, a.ivaDefault)}</select></label>
          <label class="field"><span>Ricordami di richiamare dopo (giorni)</span><input class="in" id="s-richiamo" type="number" inputmode="numeric" min="1" data-set="giorniRichiamo" data-t="num" value="${esc(a.giorniRichiamo ?? 10)}"></label></div>
      </section>
      <section class="card">
        <h2>Testi predefiniti</h2>
        <p class="help">Vengono copiati in ogni nuovo preventivo; nel singolo preventivo puoi sempre cambiarli.</p>
        <div class="grid two">
          ${t('tempi', 'Tempi di esecuzione', 'Es. Da concordare in base al calendario dei lavori')}
          ${t('pagamento', 'Modalità di pagamento', 'Es. 30% all\'accettazione, saldo a fine lavori')}
          <div style="grid-column:1/-1">${t('note', 'Note ed esclusioni', 'Es. Sono esclusi i lavori non indicati nel presente preventivo')}</div>
          <div style="grid-column:1/-1">${t('rateStandard', 'Rate standard (acconti e saldo)', RATE_BASE)}<p class="help" style="margin:6px 0 0">Percentuali separate da virgole: il pulsante «Rate standard» del preventivo le calcola sul totale IVA compresa.</p></div>
          <div style="grid-column:1/-1">${t('messaggio', 'Messaggio per WhatsApp', MESSAGGIO_BASE)}<p class="help" style="margin:6px 0 0">Si compila da solo: {nome} cliente, {numero} preventivo, {oggetto}, {totale}, {impresa}, {telefono}. Se lo lasci vuoto si usa quello di esempio.</p></div>
        </div>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="s-firma" data-set="firma"${a.firma ? ' checked' : ''}> Aggiungi in fondo al PDF gli spazi per le firme</label>
      </section>
      <section class="card" id="firma-impresa">
        <h2>Firma e timbro dell'impresa</h2>
        <p class="help">Compaiono nel PDF sotto «Per l'impresa» quando ci sono gli spazi per le firme (o quando il cliente firma).</p>
        ${a.firmaImpresa ? `<div class="fi-prev"><img id="fi-anteprima" src="${esc(a.firmaImpresa)}" alt="Firma e timbro dell'impresa"></div>` : ''}
        <div class="pg-act">
          <button class="btn" type="button" data-act="fiDisegna">${IC.firma || ''} Disegna la firma</button>
          <label class="btn" for="fi-file">${IC.camera} Foto del timbro firmato</label>
          ${a.firmaImpresa ? `<button class="btn danger" type="button" data-act="fiTogli">Togli</button>` : ''}
        </div>
        <input type="file" id="fi-file" accept="image/*" hidden>
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
  let foto = [];
  try { foto = await store.all('foto'); } catch (e) { toast('Foto non incluse: non riesco a leggerle adesso'); }
  const dati = { formato: 'nazifoski-dati', esportato: new Date().toISOString(), preventivi: S.preventivi.map(strip), listino: S.listino.map(strip), clienti: S.clienti.map(strip), misure: S.misure.map(strip), modelli: S.modelli.map(strip), noteAgenda: S.noteAgenda.map(strip), foto, azienda: az };
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
