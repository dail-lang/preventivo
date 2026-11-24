// Accesso: Firebase Authentication (Google + email/password) o finto (test).
//   onUser(cb)   cb(null | {email, verified, isOwner, provider})
//   signInGoogle(), signInEmail(email, pw), signUpEmail(email, pw), resetPassword(email), resendVerification(), reload(), signOut()
// Errori: Error con .code in italiano leggibile tramite messaggioErrore(err).
import { FB_URL } from './store.js';

export const OWNER_EMAIL = 'impresaedilenazifoski@gmail.com';
const isOwner = email => (email || '').toLowerCase() === OWNER_EMAIL;

/** iPhone/iPad con l'app aperta dalla schermata Home: lì il popup di Google non è affidabile. */
export const isIosStandalone = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);

export async function createAuth(kind, opts = {}) {
  return kind === 'firebase' ? firebaseAuth(opts.app, opts.emulator) : fakeAuth(opts.user);
}

function fakeAuth(initial) {
  let user = initial ? { verified: true, provider: 'password', ...initial } : null;
  const subs = new Set();
  const set = u => { user = u ? { ...u, isOwner: isOwner(u.email) } : null; subs.forEach(cb => cb(user)); };
  if (user) user.isOwner = isOwner(user.email);
  return {
    kind: 'fake',
    onUser(cb) { subs.add(cb); cb(user); return () => subs.delete(cb); },
    async signInGoogle() { set({ email: OWNER_EMAIL, verified: true, provider: 'google' }); },
    async signInEmail(email) { set({ email, verified: true, provider: 'password' }); },
    async signUpEmail(email) { set({ email, verified: false, provider: 'password' }); },
    async resetPassword() {},
    async resendVerification() {},
    async reload() {},
    async signOut() { set(null); }
  };
}

async function firebaseAuth(app, emulator) {
  const a = await import(FB_URL + 'firebase-auth.js');
  const auth = a.getAuth(app);
  if (emulator) a.connectAuthEmulator(auth, `http://${emulator}:9099`, { disableWarnings: true });
  auth.languageCode = 'it';
  const map = u => (u ? { email: u.email, verified: u.emailVerified, isOwner: isOwner(u.email), provider: u.providerData[0]?.providerId === 'google.com' ? 'google' : 'password' } : null);
  return {
    kind: 'firebase',
    onUser(cb) { return a.onAuthStateChanged(auth, u => cb(map(u))); },
    async signInGoogle() {
      const provider = new a.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await a.signInWithPopup(auth, provider);
    },
    async signInEmail(email, pw) { await a.signInWithEmailAndPassword(auth, email.trim(), pw); },
    async signUpEmail(email, pw) {
      const cred = await a.createUserWithEmailAndPassword(auth, email.trim(), pw);
      await a.sendEmailVerification(cred.user);
    },
    async resetPassword(email) { await a.sendPasswordResetEmail(auth, email.trim()); },
    async resendVerification() { if (auth.currentUser) await a.sendEmailVerification(auth.currentUser); },
    async reload() {
      if (!auth.currentUser) return;
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true); // il token aggiornato porta email_verified alle regole
      return map(auth.currentUser);
    },
    async signOut() { await a.signOut(auth); }
  };
}

export function messaggioErrore(err) {
  const code = (err && err.code) || '';
  const m = {
    'auth/invalid-email': 'L\'indirizzo email non è valido.',
    'auth/missing-password': 'Scrivi la password.',
    'auth/weak-password': 'La password deve avere almeno 6 caratteri.',
    'auth/email-already-in-use': 'Esiste già un account con questa email. Accedi, oppure usa «Password dimenticata?» per impostarne una.',
    'auth/invalid-credential': 'Email o password non corretti.',
    'auth/wrong-password': 'Email o password non corretti.',
    'auth/user-not-found': 'Non esiste un account con questa email. Tocca «Crea account».',
    'auth/too-many-requests': 'Troppi tentativi. Aspetta qualche minuto e riprova.',
    'auth/network-request-failed': 'Serve la connessione a internet per accedere.',
    'auth/popup-closed-by-user': 'Accesso con Google annullato.',
    'auth/cancelled-popup-request': 'Accesso con Google annullato.',
    'auth/popup-blocked': 'Il telefono ha bloccato la finestra di Google. Accedi con email e password.',
    'auth/operation-not-supported-in-this-environment': 'Qui l\'accesso con Google non funziona. Accedi con email e password.',
    'auth/unauthorized-domain': 'Questo indirizzo non è ancora autorizzato in Firebase (vedi ISTRUZIONI, passo 1).'
  };
  return m[code] || 'Qualcosa non ha funzionato. Riprova.';
}
