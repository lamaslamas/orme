// Condividere un mio percorso: GPX, link senza server e immagine. Nel link e nel file vanno solo traccia, nome, note e
// verso: niente osservazioni, posizioni GPS mie o altri dati del telefono.
import { distanzaKm } from './geo.js';

export const MAX_LINK = 2000; // caratteri dell'indirizzo intero
export const TOLLERANZE_M = [5, 10, 20, 40, 80, 160, 320];
const SCALA = 1e5; // un grado = 100000 unità: circa 1 m
const MAX_PUNTI = 6000;

// ---------- codifica compatta della traccia: differenze, zigzag, byte a lunghezza variabile, base64url ----------
const zigzag = (n) => (n < 0 ? -2 * n - 1 : 2 * n);
const deZigzag = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function aBase64Url(byte) {
  let out = '';
  for (let i = 0; i < byte.length; i += 3) {
    const n = (byte[i] << 16) | ((byte[i + 1] ?? 0) << 8) | (byte[i + 2] ?? 0);
    out += BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63];
    if (i + 1 < byte.length) out += BASE64[(n >> 6) & 63];
    if (i + 2 < byte.length) out += BASE64[n & 63];
  }
  return out;
}
function daBase64Url(testo) {
  const byte = [];
  for (let i = 0; i < testo.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < testo.length ? BASE64.indexOf(testo[i + k]) : 0));
    if (v.some((x, k) => i + k < testo.length && x < 0)) throw new Error('codice non valido');
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    byte.push((n >> 16) & 255);
    if (i + 2 < testo.length) byte.push((n >> 8) & 255);
    if (i + 3 < testo.length) byte.push(n & 255);
  }
  return byte;
}

// una linea [[lon, lat]…] → testo
export function codificaLinea(linea) {
  const byte = [];
  const scrivi = (n) => {
    let v = zigzag(n);
    while (v >= 128) {
      byte.push((v % 128) | 128);
      v = Math.floor(v / 128);
    }
    byte.push(v);
  };
  let [pLat, pLon] = [0, 0];
  for (const [lon, lat] of linea) {
    const la = Math.round(lat * SCALA);
    const lo = Math.round(lon * SCALA);
    scrivi(la - pLat);
    scrivi(lo - pLon);
    [pLat, pLon] = [la, lo];
  }
  return aBase64Url(byte);
}
export function decodificaLinea(testo) {
  const byte = daBase64Url(testo);
  const numeri = [];
  for (let i = 0; i < byte.length; ) {
    let v = 0;
    let mol = 1;
    for (;;) {
      if (i >= byte.length) throw new Error('codice troncato');
      const b = byte[i++];
      v += (b & 127) * mol;
      if (b < 128) break;
      mol *= 128;
    }
    numeri.push(deZigzag(v));
  }
  if (numeri.length % 2) throw new Error('codice non valido');
  const linea = [];
  let [la, lo] = [0, 0];
  for (let i = 0; i < numeri.length; i += 2) {
    la += numeri[i];
    lo += numeri[i + 1];
    linea.push([lo / SCALA, la / SCALA]);
  }
  return linea;
}
export const codificaTraccia = (pezzi) => pezzi.map(codificaLinea).join('.');
export const decodificaTraccia = (testo) => (testo ? testo.split('.').map(decodificaLinea) : []);

// ---------- semplificazione (Douglas-Peucker, in metri) ----------
export function semplifica(linea, toleranzaM) {
  if (linea.length < 3) return linea.map(([lon, lat]) => [lon, lat]);
  const lat0 = linea[0][1];
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = linea.map(([lon, lat]) => [lon * kx, lat * 110_540]);
  const tieni = new Uint8Array(linea.length);
  tieni[0] = tieni[linea.length - 1] = 1;
  const pila = [[0, linea.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    let max = 0;
    let idx = -1;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2)) : 0;
      const d = Math.hypot(ax + (bx - ax) * t - px, ay + (by - ay) * t - py);
      if (d > max) (max = d), (idx = i);
    }
    if (max > toleranzaM && idx > 0) {
      tieni[idx] = 1;
      pila.push([a, idx], [idx, b]);
    }
  }
  return linea.filter((_, i) => tieni[i]).map(([lon, lat]) => [lon, lat]);
}

// ---------- il link ----------
const taglia = (t, n) => String(t ?? '').trim().slice(0, n);

// → { url, semplificata, toleranzaM, noteTagliate } oppure { url: null } se non c'è modo di stare nel limite
export function costruisciLink({ nome, note = '', verso = false, pezzi, base, max = MAX_LINK }) {
  const linee = pezzi.map((l) => l.map(([lon, lat]) => [lon, lat])).filter((l) => l.length > 1);
  const indirizzo = (traccia, nomeT, noteT) => `${base}#/condiviso?d=${traccia}&n=${encodeURIComponent(nomeT)}${noteT ? `&t=${encodeURIComponent(noteT)}` : ''}${verso ? '&r=1' : ''}`;
  let noteT = taglia(note, 500);
  for (const tol of TOLLERANZE_M) {
    const traccia = codificaTraccia(linee.map((l) => semplifica(l, tol)));
    let url = indirizzo(traccia, taglia(nome, 80), noteT);
    // le note si accorciano per ultime, solo se la traccia più semplice non basta
    if (url.length > max && tol === TOLLERANZE_M.at(-1)) {
      while (noteT && url.length > max) {
        noteT = noteT.slice(0, Math.max(0, noteT.length - 50));
        url = indirizzo(traccia, taglia(nome, 80), noteT);
      }
    }
    if (url.length <= max) return { url, semplificata: tol > TOLLERANZE_M[0], toleranzaM: tol, noteTagliate: noteT !== taglia(note, 500) };
  }
  return { url: null };
}

// i parametri dell'indirizzo → { nome, note, verso, pezzi } oppure null se non è un percorso valido
export function leggiLink(query) {
  try {
    const q = new URLSearchParams(query);
    const pezzi = decodificaTraccia(q.get('d') ?? '');
    const punti = pezzi.reduce((n, l) => n + l.length, 0);
    if (!pezzi.length || punti < 2 || punti > MAX_PUNTI) return null;
    if (!pezzi.every((l) => l.every(([lon, lat]) => Math.abs(lon) <= 180 && Math.abs(lat) <= 90))) return null;
    return { nome: taglia(q.get('n'), 80) || 'Percorso condiviso', note: taglia(q.get('t'), 500), verso: q.get('r') === '1', pezzi };
  } catch {
    return null;
  }
}

