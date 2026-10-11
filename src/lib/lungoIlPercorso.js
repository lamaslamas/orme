// Rifugi e acqua lungo un percorso di Pianifica (che può passare ovunque, non solo nei parchi).
// I punti scaricati dal robot coprono i parchi (dentro il confine) e la zona di "Intorno a me":
// se il percorso esce da queste zone servono i punti della sua zona, chiesti a OpenStreetMap.
import { puntoNelPoligono } from './confini.js';
import { distanzaKm } from './geo.js';

export const PASSO_COPERTURA_M = 500;
export const MARGINE_RIQUADRO_M = 1000;

// Punti della traccia ogni passoM (più il primo e l'ultimo di ogni pezzo)
export function campionaPezzi(pezzi, passoM = PASSO_COPERTURA_M) {
  const punti = [];
  for (const linea of pezzi ?? []) {
    let dopo = Infinity;
    for (let i = 0; i < linea.length; i++) {
      if (i > 0) dopo += distanzaKm(linea[i - 1], linea[i]) * 1000;
      if (dopo >= passoM || i === linea.length - 1) {
        punti.push(linea[i]);
        dopo = 0;
      }
    }
  }
  return punti;
}

// zone: [{ anelli }] (confine) o [{ bbox: [sud, ovest, nord, est] }]
const nellaZona = ([lon, lat], z) =>
  z.anelli?.length ? puntoNelPoligono([lon, lat], z.anelli) : z.bbox ? lat >= z.bbox[0] && lat <= z.bbox[2] && lon >= z.bbox[1] && lon <= z.bbox[3] : false;

// true se tutto il percorso è dentro le zone di cui si hanno già i punti
export function percorsoCoperto(pezzi, zone) {
  const punti = campionaPezzi(pezzi);
  return punti.length > 0 && punti.every((p) => zone.some((z) => nellaZona(p, z)));
}

// Riquadro [sud, ovest, nord, est] della traccia, allargato di margineM (per i punti poco fuori)
export function riquadroDeiPezzi(pezzi, margineM = MARGINE_RIQUADRO_M) {
  let [s, o, n, e] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const linea of pezzi ?? []) {
    for (const [lon, lat] of linea) {
      s = Math.min(s, lat);
      n = Math.max(n, lat);
      o = Math.min(o, lon);
      e = Math.max(e, lon);
    }
  }
  if (!Number.isFinite(s)) return null;
  const dLat = margineM / 111_000;
  const dLon = dLat / Math.cos((((s + n) / 2) * Math.PI) / 180);
  const r = (x) => Math.round(x * 1e4) / 1e4;
  return [r(s - dLat), r(o - dLon), r(n + dLat), r(e + dLon)];
}

// Distanza in metri tra due punti vicini (piano locale: basta per proiettare sulla traccia)
function proiezione([x, y], [ax, ay], [bx, by]) {
  const k = Math.cos((y * Math.PI) / 180);
  const dx = (bx - ax) * k;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, (((x - ax) * k) * dx + (y - ay) * dy) / l2)) : 0;
  const px = ax + (bx - ax) * t;
  const py = ay + (by - ay) * t;
  return { t, distanzaM: distanzaKm([x, y], [px, py]) * 1000 };
}

// Dove cade un punto lungo la traccia, nell'ordine di percorrenza: km dalla partenza del punto
// della traccia più vicino (i pezzi si sommano uno dopo l'altro)
export function kmLungoLaTraccia(punto, pezzi) {
  let migliore = { distanzaM: Infinity, km: null };
  let fatti = 0;
  for (const linea of pezzi ?? []) {
    for (let i = 1; i < linea.length; i++) {
      const tratto = distanzaKm(linea[i - 1], linea[i]);
      const p = proiezione(punto, linea[i - 1], linea[i]);
      if (p.distanzaM < migliore.distanzaM) migliore = { distanzaM: p.distanzaM, km: fatti + tratto * p.t };
      fatti += tratto;
    }
  }
  return migliore.km;
}

export function lunghezzaDeiPezzi(pezzi) {
  let km = 0;
  for (const linea of pezzi ?? []) for (let i = 1; i < linea.length; i++) km += distanzaKm(linea[i - 1], linea[i]);
  return km;
}

// Il tratto più lungo senza nessuno dei punti dati (km lungo la traccia), partenza e arrivo compresi
export function trattoPiuLungoSenza(kmPunti, totaleKm) {
  const tappe = [0, ...kmPunti.filter((k) => Number.isFinite(k)).sort((a, b) => a - b), totaleKm];
  let tratto = { da: 0, a: totaleKm, km: -1 };
  for (let i = 1; i < tappe.length; i++) {
    if (tappe[i] - tappe[i - 1] > tratto.km) tratto = { da: tappe[i - 1], a: tappe[i], km: tappe[i] - tappe[i - 1] };
  }
  return tratto;
}

// "12,4"
export const km1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
