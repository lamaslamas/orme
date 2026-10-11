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
