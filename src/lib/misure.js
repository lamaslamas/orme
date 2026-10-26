// Distanze lungo una linea e punto della linea più vicino a un punto.
// Le coordinate sono [lon, lat] oppure [lon, lat, quota].
import { distanzaKm } from './geo.js';

const R = 6371008.8;
const rad = (g) => (g * Math.PI) / 180;
const distanzaM = (a, b) => distanzaKm(a, b) * 1000;

// Distanze progressive lungo una linea (metri)
export function progressivi(linea) {
  const d = [0];
  for (let i = 1; i < linea.length; i++) d.push(d[i - 1] + distanzaM(linea[i - 1], linea[i]));
  return d;
}

// Punto della linea più vicino a "punto": segmento, posizione nel segmento,
// distanza dall'inizio della linea e distanza del punto dalla linea (metri)
export function puntoSullaLinea(linea, punto, prog = progressivi(linea)) {
  const [lon0, lat0] = punto;
  const kx = R * Math.cos(rad(lat0)) * (Math.PI / 180);
  const ky = R * (Math.PI / 180);
  const xy = (p) => [(p[0] - lon0) * kx, (p[1] - lat0) * ky];
  let migliore = null;
  for (let i = 0; i < linea.length - 1; i++) {
    const [ax, ay] = xy(linea[i]);
    const [bx, by] = xy(linea[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (!migliore || d < migliore.distanzaDallaLineaM) migliore = { indice: i, t, distanzaDallaLineaM: d };
  }
  if (!migliore) return null;
  const a = linea[migliore.indice];
  const b = linea[migliore.indice + 1];
  const p = [a[0] + (b[0] - a[0]) * migliore.t, a[1] + (b[1] - a[1]) * migliore.t];
  if (Number.isFinite(a[2]) && Number.isFinite(b[2])) p.push(a[2] + (b[2] - a[2]) * migliore.t);
  const segmento = prog[migliore.indice + 1] - prog[migliore.indice];
  return { ...migliore, punto: p, daInizioM: prog[migliore.indice] + segmento * migliore.t };
}
