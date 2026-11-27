// Firma del cliente con il dito: riquadro a tutto schermo, restituisce {png, nome, data} oppure null.
import { today } from './calc.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let chiudi = null;

/** Chiude la firma senza salvare (es. tasto Indietro). */
export function chiudiFirma() { if (chiudi) chiudi(null); }

/** Esporta solo la parte firmata, larga al massimo 600 px, come PNG (di solito 10–40 KB, mai oltre 120 KB). */
function esporta(cv, box) {
  const pad = 12;
  const x = Math.max(0, box.x0 - pad), y = Math.max(0, box.y0 - pad);
  const w = Math.min(cv.width, box.x1 + pad) - x, h = Math.min(cv.height, box.y1 + pad) - y;
  for (const max of [600, 420, 300]) {
    const k = Math.min(1, max / w);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(h * k));
    out.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, out.width, out.height);
    const png = out.toDataURL('image/png');
    if (png.length * 0.75 <= 120 * 1024) return png;
  }
  return null;
}

export function apriFirma({ nome = '', titolo = 'Firma del cliente', nota = 'Confermando, il preventivo diventa «Accettato» e la firma compare nel PDF.', chiediNome = true } = {}) {
  if (chiudi) chiudi(null);
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'firma-ov'; ov.id = 'firma';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'fi-t');
    ov.innerHTML = `<div class="fi-h"><h2 id="fi-t">${esc(titolo)}</h2><button class="btn ghost" type="button" id="fi-no">Annulla</button></div>
      <div class="fi-b">
        <div class="fi-padw"><canvas id="fi-pad" aria-label="Riquadro per la firma"></canvas><span class="fi-hint">Firma qui con il dito</span><span class="fi-line"></span></div>
        ${chiediNome ? `<label class="field"><span>Nome di chi firma</span><input class="in" id="fi-nome" autocomplete="off" autocapitalize="words" value="${esc(nome)}"></label>` : ''}
        <p class="fi-note">${esc(nota)}</p>
      </div>
      <div class="fi-f"><button class="btn" type="button" id="fi-clear">Cancella</button><button class="btn primary" type="button" id="fi-ok" disabled>Conferma</button></div>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('#fi-pad'), ctx = cv.getContext('2d');
    const ok = ov.querySelector('#fi-ok'), hint = ov.querySelector('.fi-hint');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let box = null, giu = false, last = null;
    // Tastiera, rotazione: il riquadro cambia misura ma il tratto già fatto si conserva (copiato e ridisegnato).
    const dimensiona = () => {
      const r = cv.getBoundingClientRect();
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (!w || !h || (w === cv.width && h === cv.height)) return;
      let copia = null;
      if (box && cv.width && cv.height) { copia = document.createElement('canvas'); copia.width = cv.width; copia.height = cv.height; copia.getContext('2d').drawImage(cv, 0, 0); }
      cv.width = w; cv.height = h;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.6 * dpr; ctx.strokeStyle = '#14213d';
      if (copia) ctx.drawImage(copia, 0, 0);
    };
    const pt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr }; };
    const allarga = q => { box = box ? { x0: Math.min(box.x0, q.x), y0: Math.min(box.y0, q.y), x1: Math.max(box.x1, q.x), y1: Math.max(box.y1, q.y) } : { x0: q.x, y0: q.y, x1: q.x, y1: q.y }; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); giu = true; last = pt(e); allarga(last); try { cv.setPointerCapture(e.pointerId); } catch (_) {} hint.hidden = true; });
    cv.addEventListener('pointermove', e => {
      if (!giu) return;
      const q = pt(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      last = q; allarga(q);
      if (box.x1 - box.x0 + box.y1 - box.y0 > 20 * dpr) ok.disabled = false;
    });
    const su = () => { giu = false; last = null; };
    cv.addEventListener('pointerup', su); cv.addEventListener('pointercancel', su);
    const finisci = val => { chiudi = null; window.removeEventListener('resize', dimensiona); ov.remove(); resolve(val); };
    chiudi = finisci;
    ov.querySelector('#fi-no').onclick = () => finisci(null);
    ov.querySelector('#fi-clear').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); box = null; ok.disabled = true; hint.hidden = false; };
    ok.onclick = () => {
      if (!box) return;
      const png = esporta(cv, box);
      if (!png) return;
      const n = ov.querySelector('#fi-nome');
      finisci({ png, nome: n ? n.value.trim() : '', data: today() });
    };
    requestAnimationFrame(dimensiona);
    window.addEventListener('resize', dimensiona);
  });
}
