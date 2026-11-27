// Foto del sopralluogo: ridotte sul telefono prima di salvarle (nessun servizio esterno).

const MAX = 600 * 1024; // lunghezza massima del dataURL: sta comodo in un documento Firestore (limite 1 MB)

async function carica(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* si prova con <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Immagine non leggibile')); img.src = url; });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** JPEG con il lato lungo al massimo «lato» px; se pesa troppo abbassa la qualità, poi le dimensioni. */
export async function riduciFoto(file, lato = 1600, qualita = 0.8) {
  const img = await carica(file);
  const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
  if (!w0 || !h0) throw new Error('Immagine non leggibile');
  let max = lato;
  for (let giro = 0; giro < 4; giro++) {
    const k = Math.min(1, max / Math.max(w0, h0));
    const cv = document.createElement('canvas');
    cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    for (let q = qualita; q >= 0.45; q -= 0.1) {
      const url = cv.toDataURL('image/jpeg', q);
      if (url.length <= MAX) { if (img.close) img.close(); return url; }
    }
    max = Math.round(max * 0.75);
  }
  if (img.close) img.close();
  throw new Error('Foto troppo pesante');
}
