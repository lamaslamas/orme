// Misure sulla mappa (non vengono mai salvate).
// Le coordinate sono [lon, lat] oppure [lon, lat, quota].
import { distanzaKm } from './geo.js';
import { dislivello } from './quote.js';

const R = 6371008.8;
const rad = (g) => (g * Math.PI) / 180;
const distanzaM = (a, b) => distanzaKm(a, b) * 1000;

// Distanze tra punti toccati in sequenza: parziali e totale (metri)
export function misuraLineaAria(punti) {
  const parziali = [];
  for (let i = 1; i < punti.length; i++) parziali.push(distanzaM(punti[i - 1], punti[i]));
  return { parziali, totaleM: parziali.reduce((a, b) => a + b, 0) };
}

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

// Tra le linee date, quella più vicina al punto
export function lineaPiuVicina(linee, punto) {
  let migliore = null;
  linee.forEach((linea, i) => {
    if (linea.length < 2) return;
    const s = puntoSullaLinea(linea, punto);
    if (s && (!migliore || s.distanzaDallaLineaM < migliore.aggancio.distanzaDallaLineaM)) {
      migliore = { indice: i, linea, aggancio: s };
    }
  });
  return migliore;
}

// Tratto di linea tra due punti agganciati: distanza percorrendo la linea
// e, se ci sono le quote, dislivello del tratto
export function trattoLungoLinea(linea, a, b) {
  const [primo, secondo] = a.daInizioM <= b.daInizioM ? [a, b] : [b, a];
  const tratto = [primo.punto, ...linea.slice(primo.indice + 1, secondo.indice + 1), secondo.punto];
  // se il secondo punto toccato è prima del primo, il tratto si percorre al contrario
  const alContrario = a.daInizioM > b.daInizioM;
  return {
    distanzaM: secondo.daInizioM - primo.daInizioM,
    dislivello: dislivello([alContrario ? [...tratto].reverse() : tratto]),
    linea: tratto,
    alContrario,
  };
}

export function testoDistanza(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace('.', ',')} km`;
}
