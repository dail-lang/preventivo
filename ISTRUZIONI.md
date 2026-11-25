# Nazifoski Preventivi — istruzioni

> **Si può usare subito.** Finché il passo 1 (Firebase) non è fatto, l'app funziona in modalità
> **«solo su questo telefono»**: niente accesso, i dati restano sul dispositivo. Fai spesso
> *Impostazioni → Esporta copia di sicurezza*. Quando colleghi Firebase e accedi, l'app propone
> **«Trasferiscili online»** e porta tutto nell'archivio condiviso.

Da fare una volta sola, in tutto circa 15–20 minuti. Serve un computer (va bene anche il telefono, ma è più comodo
il computer) e l'account Google **impresaedilenazifoski@gmail.com**.

L'indirizzo dell'app sarà: **https://dail-lang.github.io/preventivo/**

---

## 1. Crea l'archivio dei dati (Firebase, gratis)

1. Vai su **https://console.firebase.google.com** e accedi con **impresaedilenazifoski@gmail.com**.
2. Tocca **Crea un progetto** (o «Aggiungi progetto»).
   - Nome: `nazifoski-preventivi` → Continua.
   - Google Analytics: **non serve**, disattivalo → **Crea progetto**.
3. **Archivio dei preventivi.** Nel menu a sinistra apri **Build** (o «Crea») → **Firestore Database** → **Crea database**.
   - Posizione: **eur3 (Europe)** → Avanti.
   - Scegli **Avvia in modalità di produzione** → **Crea**.
   - Quando è pronto, apri la scheda **Regole**, cancella tutto il testo, incolla il contenuto del file
     [`firestore.rules`](firestore.rules) e tocca **Pubblica**.
4. **Accesso.** Nel menu: **Build** → **Authentication** → **Inizia**.
   - Scheda **Metodo di accesso** → **Google** → attiva → come email di assistenza scegli la tua Gmail → **Salva**.
   - Sempre in **Metodo di accesso** → **Aggiungi nuovo provider** → **Email/password** → attiva la prima opzione → **Salva**.
   - Scheda **Impostazioni** → **Domini autorizzati** → **Aggiungi dominio** → scrivi `dail-lang.github.io` → **Aggiungi**.
5. **Collega l'app.** Tocca l'ingranaggio in alto a sinistra → **Impostazioni progetto**.
   In fondo, alla voce «Le tue app», tocca l'icona **`</>`** (Web).
   - Nickname: `Nazifoski` → (non serve «Firebase Hosting») → **Registra app**.
   - Compare un blocco di testo che contiene `const firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., ... }`.
     **Copialo e mandalo a Claude in chat.** Questi valori non sono segreti: la protezione dei dati sta nelle regole del passo 3.

## 2. Crea lo spazio dell'app su GitHub

1. Vai su **https://github.com/new** (con l'account `dail-lang`).
2. Nome del repository: `preventivo`. Visibilità: **Public**. **Non** aggiungere README né altri file → **Create repository**.
   - Pubblico vuol dire che chiunque può vedere il *codice* dell'app, non i dati: preventivi e clienti stanno su Firebase,
     protetti dalle regole.
3. Subito dopo, nel repository: **Settings** → **Pages** → «Build and deployment» → **Source: GitHub Actions**.
4. Di' a Claude che il repository è pronto: Claude lo aggiunge alla sessione, carica l'app e controlla che la
   pubblicazione sia andata a buon fine (se la prima non parte, la rilancia).
5. Dopo 1–2 minuti l'app è online su **https://dail-lang.github.io/preventivo/**.
   Ogni volta che Claude carica una modifica, l'app si ripubblica da sola e sui telefoni compare «Nuova versione disponibile».

## 3. Installa l'app sul telefono

**iPhone (Safari)**
1. Apri l'indirizzo dell'app con **Safari**.
2. Tocca il pulsante **Condividi** (il quadrato con la freccia in su), in basso.
3. Scorri e tocca **Aggiungi alla schermata Home** → **Aggiungi**.
4. Apri **Nazifoski** dall'icona e accedi. Sull'iPhone, se «Accedi con Google» non si apre, usa
   **Crea account** con la tua Gmail e una password (ti arriva un'email per confermare).

**Android (Chrome)**
1. Apri l'indirizzo dell'app con **Chrome**.
2. Tocca **Installa** nell'avviso in alto, oppure il menu **⋮** → **Installa app**.
3. Apri **Nazifoski** dall'icona e tocca **Accedi con Google**.

**Computer**: apri l'indirizzo con Chrome o Edge; puoi installarla anche lì dall'icona nella barra degli indirizzi.

L'accesso si fa una volta per dispositivo. L'app funziona anche senza rete: le modifiche partono appena torna internet.

## 4. Porta i dati della vecchia app

1. In **Impostazioni** → **Importa dati** → **Scegli il file…** → scegli `nazifoski-dati.json` (te lo manda Claude).
2. Vengono aggiunti solo i dati che mancano: si può ripetere senza creare doppioni.
3. Da quel giorno usa solo la nuova app.

## 5. Aggiungi i familiari

1. Tu (titolare) vai in **Impostazioni** → **Persone autorizzate**, scrivi l'email del familiare → **Aggiungi**.
2. Il familiare installa l'app e accede con quella email (Google, oppure «Crea account» con email e password).
3. Chi non è in elenco vede solo «Accesso in attesa» e nessun dato. Per togliere qualcuno tocca il cestino accanto alla sua email.

---

## Problemi comuni

| Cosa succede | Cosa fare |
|---|---|
| In alto c'è scritto «Dati solo su questo telefono» | Firebase non è ancora collegato (passo 1): i dati sono solo su quel dispositivo. |
| «Questo indirizzo non è ancora autorizzato in Firebase» | Passo 1.4: aggiungi `dail-lang.github.io` ai domini autorizzati. |
| «Accesso in attesa» | La tua email non è in Persone autorizzate (passo 5), oppure non l'hai confermata. |
| «Esiste già un account con questa email» | Hai già usato Google con quella email: accedi con Google, oppure tocca «Password dimenticata?» per impostare una password. |
| In alto c'è scritto «Offline» | Nessun problema: le modifiche restano sul telefono e partono appena torna la rete. |
| Compare «Nuova versione disponibile» | Tocca **Aggiorna**. |
