// Service worker: l'app si apre anche senza rete e si aggiorna da sola.
// VERSION viene sostituita a ogni pubblicazione con il commit (scripts/prepara-sito.sh):
// i telefoni scaricano tutti i file nuovi insieme e mostrano «Nuova versione disponibile».
const VERSION = 'nazifoski-dev';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'firebase-config.js',
  'js/app.js', 'js/calc.js', 'js/store.js', 'js/auth.js', 'js/pwa.js', 'js/pdf.js', 'js/pdfimport.js', 'js/assets.js', 'js/listino-rimini.js', 'js/versione.js', 'js/misure.js', 'js/firma.js', 'js/foto.js',
  'vendor/pdfmake.min.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js',
  'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-500-normal.woff2', 'fonts/inter-latin-600-normal.woff2',
  'fonts/space-grotesk-latin-500-normal.woff2', 'fonts/space-grotesk-latin-700-normal.woff2', 'fonts/ibm-plex-mono-latin-500-normal.woff2',
  'img/logo.png', 'img/logo-chiaro.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/';
// Le librerie Firebase vanno in cache subito: su iPhone la prima apertura dall'icona è anche l'unica prima di andare in cantiere.
const FIREBASE = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => FIREBASE_CDN + '10.14.1/' + f);

self.addEventListener('install', e => {
  // cache: 'reload' evita di prendere copie vecchie dalla cache del browser
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    // Firebase: se la rete non risponde ora, si riprova al primo uso (non deve bloccare l'installazione).
    await Promise.all(FIREBASE.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

// Tutti i file dell'app vengono dalla stessa versione in cache: niente pagine nuove con codice vecchio.
async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const r = await fetch(req);
  if (r && r.ok) { const cache = await caches.open(VERSION); cache.put(req, r.clone()); }
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith((async () => (await caches.match('index.html', { ignoreSearch: true })) || fetch(req))());
    return;
  }
  if (url.origin === location.origin || url.href.startsWith(FIREBASE_CDN)) e.respondWith(cacheFirst(req));
  // Tutto il resto (Firestore, accesso Google) passa direttamente alla rete.
});
