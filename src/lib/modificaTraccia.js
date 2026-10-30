// "Modifica traccia": la traccia già caricata (sentiero dell'archivio, percorso mio, carrareccia) si apre nel pianificatore come
// «base»: una linea sola, nel suo verso, con le distanze progressive. Le tappe sulla base hanno una posizione `pos` (metri
// dall'inizio della base): il tratto tra due tappe sulla base è un pezzo della linea originale, senza ricalcolare niente.
// Qui solo i calcoli, senza mappa né rete.
import { distanzaKm } from './geo.js';

const dM = (a, b) => distanzaKm(a, b) * 1000;

// pezzi [[lon, lat, z?]…] (in ordine) → { linea: [[lon, lat]…], cum: [m…], totaleM }
export function creaBase(pezzi) {
  const linea = [];
  for (const pezzo of pezzi ?? []) for (const [lon, lat] of pezzo ?? []) if (!linea.length || linea.at(-1)[0] !== lon || linea.at(-1)[1] !== lat) linea.push([lon, lat]);
  const cum = [0];
  for (let i = 1; i < linea.length; i++) cum.push(cum[i - 1] + dM(linea[i - 1], linea[i]));
  return { linea, cum, totaleM: cum.at(-1) ?? 0 };
}

// coordinate piane (metri) attorno a un punto, per proiettare
function piano(lat0) {
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  return ([lon, lat]) => [lon * kx, lat * 110_540];
}

// il punto della base più vicino a p: { pos (m dall'inizio), p: [lon, lat], dM }
export function proietta(base, p) {
  const xy = piano(p[1]);
  const [px, py] = xy(p);
  let migliore = null;
  for (let i = 0; i < base.linea.length - 1; i++) {
    const [ax, ay] = xy(base.linea[i]);
    const [bx, by] = xy(base.linea[i + 1]);
    const vx = bx - ax;
    const vy = by - ay;
    const l2 = vx * vx + vy * vy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
    const d = Math.hypot(ax + vx * t - px, ay + vy * t - py);
    if (!migliore || d < migliore.d) migliore = { d, i, t };
  }
  if (!migliore) return null;
  const a = base.linea[migliore.i];
  const b = base.linea[migliore.i + 1];
  const punto = [a[0] + (b[0] - a[0]) * migliore.t, a[1] + (b[1] - a[1]) * migliore.t];
  return { pos: base.cum[migliore.i] + (base.cum[migliore.i + 1] - base.cum[migliore.i]) * migliore.t, p: punto, dM: migliore.d };
}

// il punto alla posizione pos
export function puntoAllaPos(base, pos) {
  const x = Math.max(0, Math.min(base.totaleM, pos));
  let i = base.cum.findIndex((c) => c >= x);
  if (i <= 0) return [...base.linea[0]];
  const f = (x - base.cum[i - 1]) / (base.cum[i] - base.cum[i - 1] || 1);
  const [a, b] = [base.linea[i - 1], base.linea[i]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// il pezzo di base tra due posizioni (in qualsiasi ordine: da > a dà il pezzo percorso al contrario)
export function fetta(base, da, a) {
  const [lo, hi] = da <= a ? [da, a] : [a, da];
  const dentro = base.linea.filter((_, i) => base.cum[i] > lo && base.cum[i] < hi);
  const linea = [puntoAllaPos(base, lo), ...dentro, puntoAllaPos(base, hi)];
  return da <= a ? linea : linea.reverse();
}
