# Nazifoski Preventivi

App installabile (PWA) per i preventivi dell'Impresa Edile Nazifoski: elenco con stati, editor con calcolo delle
misure, listino prezzi, rubrica clienti, PDF impaginato con anteprima e condivisione. Dati condivisi su Firebase
(Firestore + Authentication), utilizzabile anche senza rete.

**Per configurarla e installarla: [ISTRUZIONI.md](ISTRUZIONI.md).**

## Struttura

| File | Cosa contiene |
|---|---|
| `index.html` | Pagina e stili (colori e caratteri di nazifoski.it) |
| `js/app.js` | Interfaccia: accesso, elenco, editor, listino, clienti, impostazioni |
| `js/calc.js` | Calcoli e formati (funzioni pure) |
| `js/store.js` | Archivio: Firestore oppure in memoria (prove), importazione |
| `js/auth.js` | Accesso: Firebase Authentication oppure finto (prove) |
| `js/pdf.js` | PDF (pdfmake), anteprima (pdf.js), Condividi / Apri / Scarica |
| `js/pwa.js` | Service worker, invito e guida all'installazione, aggiornamenti |
| `js/assets.js` | Caratteri e logo per il PDF (base64) |
| `sw.js` | Cache per l'uso senza rete. `VERSION` viene legata al commit da `scripts/prepara-sito.sh` a ogni pubblicazione. |
| `firestore.rules` | Regole di sicurezza dei dati |
| `firebase-config.js` | Configurazione web del progetto Firebase |
| `vendor/` | pdfmake 0.2.10, pdf.js 3.11.174 |

Nessun passaggio di build: sono file statici. La pubblicazione su GitHub Pages è in `.github/workflows/pages.yml`.

## Prove

```bash
npm install                # solo per le prove
npm test                   # calcoli, archivio, importazione
npm run test:rules         # regole di sicurezza con l'emulatore Firestore (serve Java)
node tests/ui.spec.cjs     # interfaccia su telefono simulato (Playwright + Chromium)
node tests/pdf-check.cjs   # contenuto e impaginazione del PDF (serve poppler-utils)
node tests/pwa.spec.cjs    # manifest, icone, uso senza rete, aggiornamenti, invito all'installazione
npm run test:e2e           # prova completa con gli emulatori Auth + Firestore (accesso, sincronizzazione, offline, uscita)
```

`index.html?test=1` apre l'app con archivio in memoria e accesso finto (dati da `window.NZ_TEST_SEED`).

Caratteri: Inter, Space Grotesk, IBM Plex Mono (SIL Open Font License). pdfmake (MIT), pdf.js (Apache 2.0).
