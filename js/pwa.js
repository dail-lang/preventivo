// App installabile: registrazione del service worker, avviso di aggiornamento, invito e guida all'installazione.
const KEY = 'nz-install-no';
const ua = navigator.userAgent;
const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /android/i.test(ua);
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const dismissed = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
let deferred = null;

addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; refresh(); });
addEventListener('appinstalled', () => { deferred = null; refresh(); });

function refresh() { const b = document.getElementById('install'); if (b && !banner()) b.remove(); }

function banner() {
  if (standalone() || dismissed()) return '';
  if (!deferred && !isIos && !isAndroid) return '';
  const action = deferred ? '<button class="btn primary" type="button" id="install-yes">Installa</button>' : '<button class="btn primary" type="button" data-act="help">Come fare</button>';
  return `<div class="install" id="install" role="region" aria-label="Installa l'app">
    <img src="icons/icon-192.png" alt="" width="40" height="40">
    <div><b>Installa Nazifoski sul telefono</b>Si apre dall'icona, a tutto schermo, anche senza rete.</div>
    ${action}<button class="icon-btn" type="button" data-act="installNo" aria-label="Non ora"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </div>`;
}

function bind(root) {
  const box = root.querySelector('#install'); if (!box) return;
  const yes = box.querySelector('#install-yes');
  if (yes) yes.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; box.remove(); };
  const no = box.querySelector('[data-act="installNo"]');
  if (no) no.onclick = () => { try { localStorage.setItem(KEY, '1'); } catch (e) {} box.remove(); };
}

const SHARE_IOS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Condividi"><path d="M12 3v13M7 8l5-5 5 5M5 13v7h14v-7"/></svg>';
function help(openModal) {
  const ios = `<h3 style="font-size:16px">iPhone (Safari)</h3>
    <ol class="steps"><li>Apri questa pagina con <b>Safari</b>.</li><li>Tocca il pulsante Condividi ${SHARE_IOS} in basso.</li><li>Scorri e tocca <b>Aggiungi alla schermata Home</b>, poi <b>Aggiungi</b>.</li><li>Apri Nazifoski dall'icona sulla schermata Home e accedi.</li></ol>`;
  const android = `<h3 style="font-size:16px">Android (Chrome)</h3>
    <ol class="steps"><li>Apri questa pagina con <b>Chrome</b>.</li><li>Tocca il menu <b>⋮</b> in alto a destra.</li><li>Tocca <b>Installa app</b> (o <b>Aggiungi a schermata Home</b>).</li><li>Apri Nazifoski dall'icona e accedi.</li></ol>`;
  openModal(`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="h-t">
    <div class="sheet-h"><h2 id="h-t">Installa l'app sul telefono</h2><button class="icon-btn" type="button" data-close="no" aria-label="Chiudi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="sheet-b">${isAndroid ? android + ios : ios + android}
      <p style="margin:0;color:var(--ink-soft);font-size:14px">L'accesso si fa una volta sola per telefono. I dati restano sincronizzati con gli altri dispositivi.</p></div>
    <div class="sheet-f"><button class="btn primary" type="button" data-close="ok">Ho capito</button></div>
  </div>`);
}

// Aggiornamenti: quando c'è una nuova versione, un avviso con «Aggiorna».
function updateBar(reg) {
  if (document.getElementById('nz-update')) return;
  const bar = document.createElement('div');
  bar.id = 'nz-update'; bar.className = 'toast'; bar.setAttribute('role', 'status');
  bar.style.display = 'flex'; bar.style.gap = '12px'; bar.style.alignItems = 'center';
  bar.innerHTML = '<span>Nuova versione disponibile</span><button class="btn" type="button" style="min-height:36px;padding:6px 12px">Aggiorna</button>';
  bar.querySelector('button').onclick = () => { if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); };
  document.body.appendChild(bar);
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && window.__nzHadController) { reloading = true; location.reload(); } });
  window.__nzHadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) updateBar(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) updateBar(reg); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(err => console.warn('Service worker non registrato', err));
}

window.NZ_PWA = { banner, bind, help };
