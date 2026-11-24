// Prova le regole di sicurezza con l'emulatore Firestore: npm run test:rules
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let env;
const OWNER = 'impresaedilenazifoski@gmail.com';
let n = 0;
const ctx = (uid, email, verified = true) => env.authenticatedContext(`${uid}-${++n}`, { email, email_verified: verified }).firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-nazifoski', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.withSecurityRulesDisabled(async c => {
    const f = c.firestore();
    await setDoc(doc(f, 'accesso/persone'), { emails: ['moglie@example.com'] });
    await setDoc(doc(f, 'preventivi/p1'), { numero: 1 });
  });
});
after(async () => { await env.cleanup(); });

test('titolare legge e scrive tutto, anche con maiuscole nell\'email', async () => {
  const db = ctx('o', 'ImpresaEdileNazifoski@gmail.com');
  await assertSucceeds(getDoc(doc(db, 'preventivi/p1')));
  await assertSucceeds(setDoc(doc(db, 'listino/l1'), { desc: 'x' }));
  await assertSucceeds(setDoc(doc(db, 'accesso/persone'), { emails: ['moglie@example.com', 'figlio@example.com'] }));
});

test('familiare autorizzato legge e scrive i dati ma non l\'elenco persone', async () => {
  const db = ctx('m', 'moglie@example.com');
  await assertSucceeds(getDoc(doc(db, 'preventivi/p1')));
  await assertSucceeds(setDoc(doc(db, 'clienti/c1'), { nome: 'Rossi' }));
  await assertSucceeds(getDoc(doc(db, 'accesso/persone')));
  await assertFails(setDoc(doc(db, 'accesso/persone'), { emails: ['moglie@example.com', 'intruso@example.com'] }));
});

test('email autorizzata ma non verificata: niente', async () => {
  const db = ctx('m2', 'moglie@example.com', false);
  await assertFails(getDoc(doc(db, 'preventivi/p1')));
});

test('titolare con email non verificata: niente', async () => {
  const db = ctx('o2', OWNER, false);
  await assertFails(getDoc(doc(db, 'preventivi/p1')));
});

test('account Google non in elenco: niente, nemmeno l\'elenco persone', async () => {
  const db = ctx('x', 'sconosciuto@gmail.com');
  await assertFails(getDoc(doc(db, 'preventivi/p1')));
  await assertFails(getDoc(doc(db, 'accesso/persone')));
  await assertFails(setDoc(doc(db, 'preventivi/p2'), { numero: 2 }));
});

test('senza accesso: niente', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'preventivi/p1')));
});

test('collezioni non previste: chiuse anche al titolare', async () => {
  const db = ctx('o', OWNER);
  await assertFails(setDoc(doc(db, 'altro/x'), { a: 1 }));
});

test('elenco persone: solo il campo emails come lista', async () => {
  const db = ctx('o', OWNER);
  await assertFails(setDoc(doc(db, 'accesso/persone'), { emails: 'tutti' }));
  await assertFails(setDoc(doc(db, 'accesso/persone'), { emails: [], extra: true }));
});
