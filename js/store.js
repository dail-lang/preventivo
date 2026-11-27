// Archivio dati: Firestore (reale) o in memoria (test e anteprima). Stessa interfaccia.
//   subscribe(coll, cb)        cb(lista di {id, ...dati}, {fromCache, pending})  -> unsubscribe
//   subscribeDoc(path, cb)     cb(dati | null)                                   -> unsubscribe
//   subscribeWhere(coll, campo, valore, cb)  come subscribe, solo i documenti con campo == valore
//   all(coll)                  Promise<lista> lettura una tantum (copie di sicurezza)
//   save(coll, id, dati)       scrittura completa (Promise; offline resta in coda e si sincronizza dopo)
//   remove(coll, id)
//   ids(coll)                  Promise<string[]> id esistenti
//   onSync(cb)                 cb({online, pending})
export const FIREBASE_VERSION = '10.14.1';
export const FB_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
export const COLLEZIONI = ['preventivi', 'listino', 'clienti', 'foto'];

export async function createStore(kind, opts = {}) {
  if (kind === 'locale') return localStore();
  return kind === 'firestore' ? firestoreStore(opts.app, opts.emulator) : memoryStore(opts.seed || {}, !!opts.deny, null, opts.lento);
}

// lento (solo prove): collezioni dove save resta «in coda» per sempre, come Firestore senza rete.
function memoryStore(seed, deny, persist, lento) {
  const denied = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
  const data = {};
  const subs = {};
  const docSubs = {};
  const whereSubs = new Set();
  const syncSubs = new Set();
  const coll = c => (data[c] || (data[c] = new Map()));
  for (const [c, rows] of Object.entries(seed)) for (const r of rows || []) { const { id, ...rest } = r; coll(c).set(id, rest); }
  const list = c => [...coll(c)].map(([id, d]) => ({ ...structuredClone(d), id }));
  const filtra = w => [...coll(w.c)].filter(([, d]) => d[w.campo] === w.valore).map(([id, d]) => ({ ...structuredClone(d), id }));
  const emit = c => {
    (subs[c] || new Set()).forEach(cb => cb(list(c), { fromCache: false, pending: false }));
    whereSubs.forEach(w => { if (w.c === c) w.cb(filtra(w), { fromCache: false, pending: false }); });
    for (const [path, set] of Object.entries(docSubs)) {
      const [pc, pid] = path.split('/');
      if (pc === c) { const d = coll(c).get(pid); set.forEach(cb => cb(d ? structuredClone(d) : null)); }
    }
  };
  return {
    kind: 'memory',
    subscribe(c, cb, onError) { if (deny) { onError && onError(denied); return () => {}; } (subs[c] || (subs[c] = new Set())).add(cb); cb(list(c), { fromCache: false, pending: false }); return () => subs[c].delete(cb); },
    subscribeDoc(path, cb, onError) {
      if (deny) { onError && onError(denied); return () => {}; }
      (docSubs[path] || (docSubs[path] = new Set())).add(cb);
      const [c, id] = path.split('/'); const d = coll(c).get(id);
      cb(d ? structuredClone(d) : null);
      return () => docSubs[path].delete(cb);
    },
    subscribeWhere(c, campo, valore, cb, onError) {
      if (deny) { onError && onError(denied); return () => {}; }
      const w = { c, campo, valore, cb }; whereSubs.add(w);
      cb(filtra(w), { fromCache: false, pending: false });
      return () => whereSubs.delete(w);
    },
    async all(c) { return list(c); },
    async idsWhere(c, campo, valore) { return [...coll(c)].filter(([, d]) => d[campo] === valore).map(([id]) => id); },
    async save(c, id, d) { const { id: _ignored, ...rest } = d; coll(c).set(id, structuredClone(rest)); emit(c); if (lento && lento.includes(c)) return new Promise(() => {}); if (persist) await persist.put(c, id, rest); },
    async remove(c, id) { coll(c).delete(id); emit(c); if (persist) await persist.del(c, id); },
    async ids(c) { return [...coll(c).keys()]; },
    onSync(cb) { syncSubs.add(cb); cb({ online: true, pending: false }); return () => syncSubs.delete(cb); },
    async clearLocal() {},
    exportAll() { return esporta(c => list(c)); },
    hasData() { return ['preventivi', 'listino', 'clienti'].some(c => coll(c).size > 0); },
    peek(c, id) { return coll(c).get(id); }
  };
}

async function firestoreStore(app, emulator) {
  const fs = await import(FB_URL + 'firebase-firestore.js');
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
  });
  if (emulator) fs.connectFirestoreEmulator(db, emulator, 8080);
  const pendingBy = new Map();
  const syncSubs = new Set();
  const state = () => ({ online: navigator.onLine, pending: [...pendingBy.values()].some(Boolean) });
  const notify = () => { const s = state(); syncSubs.forEach(cb => cb(s)); };
  addEventListener('online', notify);
  addEventListener('offline', notify);
  return {
    kind: 'firestore',
    subscribe(c, cb, onError) {
      return fs.onSnapshot(fs.collection(db, c), { includeMetadataChanges: true }, snap => {
        pendingBy.set(c, snap.metadata.hasPendingWrites); notify();
        cb(snap.docs.map(d => ({ ...d.data(), id: d.id })), { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
      }, err => onError && onError(err));
    },
    subscribeDoc(path, cb, onError) {
      const [c, id] = path.split('/');
      return fs.onSnapshot(fs.doc(db, c, id), snap => cb(snap.exists() ? snap.data() : null), err => onError && onError(err));
    },
    subscribeWhere(c, campo, valore, cb, onError) {
      return fs.onSnapshot(fs.query(fs.collection(db, c), fs.where(campo, '==', valore)), { includeMetadataChanges: true }, snap => {
        cb(snap.docs.map(d => ({ ...d.data(), id: d.id })), { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
      }, err => onError && onError(err));
    },
    async all(c) { const s = await fs.getDocs(fs.collection(db, c)); return s.docs.map(d => ({ ...d.data(), id: d.id })); },
    /** Id dei documenti con campo == valore: chiede al server (o, senza rete, alla copia locale). */
    async idsWhere(c, campo, valore) { const s = await fs.getDocs(fs.query(fs.collection(db, c), fs.where(campo, '==', valore))); return s.docs.map(d => d.id); },
    save(c, id, d) { const { id: _ignored, ...rest } = d; return fs.setDoc(fs.doc(db, c, id), rest); },
    remove(c, id) { return fs.deleteDoc(fs.doc(db, c, id)); },
    async ids(c) { const s = await fs.getDocs(fs.collection(db, c)); return s.docs.map(d => d.id); },
    onSync(cb) { syncSubs.add(cb); cb(state()); return () => syncSubs.delete(cb); },
    /** Cancella la copia dei dati salvata nel browser (dopo «Esci»). Poi la pagina va ricaricata. */
    async clearLocal() { await fs.terminate(db); await fs.clearIndexedDbPersistence(db); }
  };
}

/** Dati nel dispositivo (IndexedDB): usata finché Firebase non è configurato. */
const IDB_NAME = 'nazifoski-locale';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'path' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (db, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction('docs', mode); const out = fn(t.objectStore('docs'));
  t.oncomplete = () => res(out && 'result' in out ? out.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
});
export async function localStore() {
  const db = await idb();
  const rows = await tx(db, 'readonly', s => s.getAll());
  const seed = {};
  for (const r of rows || []) (seed[r.coll] = seed[r.coll] || []).push({ ...r.data, id: r.id });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  const st = memoryStore(seed, false, {
    put: (c, id, d) => tx(db, 'readwrite', s => s.put({ path: c + '/' + id, coll: c, id, data: structuredClone(d) })),
    del: (c, id) => tx(db, 'readwrite', s => s.delete(c + '/' + id))
  });
  st.kind = 'locale';
  return st;
}
/** C'è un archivio «solo su questo telefono» con dati? (senza crearlo se non esiste) */
export async function localeHasData() {
  try {
    if (indexedDB.databases) { const list = await indexedDB.databases(); if (!list.some(d => d.name === IDB_NAME)) return false; }
    const st = await localStore(); return st.hasData() ? st : false;
  } catch (e) { return false; }
}

function esporta(list) {
  const az = list('impostazioni').find(x => x.id === 'azienda');
  const strip = r => { const { id, ...rest } = r; return { id, ...rest }; };
  return {
    formato: 'nazifoski-dati', esportato: new Date().toISOString(),
    preventivi: list('preventivi').map(strip), listino: list('listino').map(strip), clienti: list('clienti').map(strip), foto: list('foto').map(strip),
    ...(az ? { azienda: (({ id, ...rest }) => rest)(az) } : {})
  };
}

/** Importa un file di dati esportato dall'app su claude.ai: crea solo i documenti che mancano. */
export async function importa(store, dati) {
  const valid = dati && typeof dati === 'object' && (COLLEZIONI.some(c => Array.isArray(dati[c])) || (dati.azienda && typeof dati.azienda === 'object'));
  if (!valid) throw new Error('Questo non è un file di dati di Nazifoski.');
  let creati = 0, saltati = 0;
  for (const c of COLLEZIONI) {
    const rows = Array.isArray(dati[c]) ? dati[c] : [];
    if (!rows.length) continue;
    const esistenti = new Set(await store.ids(c));
    for (const r of rows) {
      if (!r || !r.id) continue;
      if (esistenti.has(r.id)) { saltati++; continue; }
      const { id, ...rest } = r;
      store.save(c, id, rest);
      creati++;
    }
  }
  if (dati.azienda) {
    const esiste = (await store.ids('impostazioni')).includes('azienda');
    if (esiste) saltati++; else { store.save('impostazioni', 'azienda', dati.azienda); creati++; }
  }
  return { creati, saltati };
}
