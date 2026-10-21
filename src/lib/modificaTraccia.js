// "Modifica traccia": la traccia già caricata (sentiero dell'archivio, percorso mio, carrareccia) si apre nel disegno come
// «base»: una linea sola, nel suo verso, con le distanze progressive. I punti di controllo sulla base hanno una
// posizione `pos` (metri dall'inizio della base): il tratto tra due punti della base è un pezzo della linea originale,
// senza ricalcolare niente. Si può accorciare (spostare partenza e arrivo lungo la traccia), tagliare in un punto
// e prolungare (altri punti, agganciati ai sentieri da BRouter). Qui solo i calcoli, senza mappa né rete.
import { distanzaKm } from './geo.js';

export const MIN_BASE_M = 10; // partenza e arrivo sulla base non si avvicinano più di così

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

// i punti di partenza di un disegno sulla base: partenza e arrivo
export const puntiIniziali = (base) => [
  { p: [...base.linea[0]], libero: false, pos: 0 },
  { p: [...base.linea.at(-1)], libero: false, pos: base.totaleM },
];

// punti con pos: indici del primo e dell'ultimo sulla base (null se non ce n'è)
export function estremiBase(punti) {
  const sulla = punti.map((x, i) => (Number.isFinite(x.pos) ? i : -1)).filter((i) => i >= 0);
  return sulla.length ? { primo: sulla[0], ultimo: sulla.at(-1), quanti: sulla.length } : null;
}
// il segnaposto si vede solo se è fuori dalla base o è uno dei due estremi sulla base
export function segnapostoVisibile(punti, i) {
  if (!Number.isFinite(punti[i]?.pos)) return true;
  const e = estremiBase(punti);
  return i === e.primo || i === e.ultimo;
}

// Il punto i (un estremo sulla base) trascinato in p: si aggancia alla base, senza superare l'altro estremo
// (restando almeno MIN_BASE_M più in qua). → { p, pos }, o null se non è un estremo sulla base
export function spostaEstremoBase(punti, i, p, base) {
  const e = estremiBase(punti);
  if (!e || e.quanti < 2 || (i !== e.primo && i !== e.ultimo)) return null;
  const altro = punti[i === e.primo ? e.ultimo : e.primo].pos;
  const verso = punti[e.ultimo].pos >= punti[e.primo].pos ? 1 : -1; // il verso di marcia sulla base
  let v = verso * proietta(base, p).pos; // lungo il verso di marcia: l'arrivo sta dopo la partenza
  v = i === e.ultimo ? Math.max(v, verso * altro + MIN_BASE_M) : Math.min(v, verso * altro - MIN_BASE_M);
  const pos = Math.max(0, Math.min(base.totaleM, verso * v));
  return { pos, p: puntoAllaPos(base, pos) };
}

// ---------- tratti e taglio ----------

// il tratto (lista di { coordinate }) più vicino a p entro toleranzaM:
// { k (indice), punto: [lon, lat], dM, daInizioM (lungo il tratto) } o null
export function vicinoAllaLinea(tratti, p, toleranzaM) {
  const xy = piano(p[1]);
  const [px, py] = xy(p);
  let migliore = null;
  tratti.forEach((t, k) => {
    let acc = 0;
    const c = t.coordinate;
    for (let i = 0; i < c.length - 1; i++) {
      const [ax, ay] = xy(c[i]);
      const [bx, by] = xy(c[i + 1]);
      const vx = bx - ax;
      const vy = by - ay;
      const l2 = vx * vx + vy * vy;
      const f = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
      const d = Math.hypot(ax + vx * f - px, ay + vy * f - py);
      const lung = Math.sqrt(l2);
      if (d <= toleranzaM && (!migliore || d < migliore.dM)) migliore = { k, dM: d, punto: [c[i][0] + (c[i + 1][0] - c[i][0]) * f, c[i][1] + (c[i + 1][1] - c[i][1]) * f], daInizioM: acc + lung * f };
      acc += lung;
    }
  });
  return migliore;
}

// la posizione sulla base di un punto che sta sul tratto tra a e b, a daInizioM dall'inizio del tratto (null se il tratto non è della base)
export function posSulTratto(a, b, daInizioM) {
  if (!Number.isFinite(a?.pos) || !Number.isFinite(b?.pos)) return null;
  return a.pos + (b.pos >= a.pos ? 1 : -1) * daInizioM;
}

// Taglia nel punto c del tratto k (tra punti[k] e punti[k+1]) e tiene la parte 'prima' o 'dopo'.
// c: { p, pos? }. Il nuovo estremo arriva (o parte) nello stesso modo del tratto tagliato.
export function tagliaPunti(punti, k, c, tieni) {
  if (tieni === 'prima') return [...punti.slice(0, k + 1), { ...c, libero: Boolean(punti[k + 1]?.libero) }];
  return [{ ...c, libero: false }, ...punti.slice(k + 1)];
}

// Prolunga con un punto nuovo p: dopo l'arrivo oppure, con `inizio`, prima della partenza (il nuovo punto diventa la
// partenza e arriva alla vecchia nel modo scelto: sentieri o mano libera).
export function prolunga(punti, p, { inizio = false, libero = false } = {}) {
  if (inizio && punti.length) return [{ p, libero: false }, { ...punti[0], libero }, ...punti.slice(1)];
  return [...punti, { p, libero: punti.length > 0 && libero }];
}
