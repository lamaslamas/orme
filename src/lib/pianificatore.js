// Il pianificatore (pagina MapLibre): i calcoli, senza mappa né rete. Il percorso è una lista di tappe (punti con un
// id, la posizione e un nome che si trova da solo); tra due tappe un tratto calcolato da BRouter (src/lib/brouter.js).
import { distanzaKm } from './geo.js';

const arr = (n) => Number(Number(n).toFixed(6));
let contatore = 0;

// una tappa: { id, p: [lon, lat], libero, nome }
export function nuovaTappa(p, extra = {}) {
  contatore += 1;
  return { id: `t${Date.now().toString(36)}${contatore.toString(36)}`, p: [arr(p[0]), arr(p[1])], libero: false, nome: null, ...extra };
}
// i punti salvati (anche solo { p, libero }) → tappe con id
export const tappeDaPunti = (punti) => (punti ?? []).map((x, i) => nuovaTappa(x.p ?? x, { libero: i === 0 ? false : Boolean(x.libero), nome: x.nome ?? null }));

// «A», 1, 2… e «B» per l'ultima (con almeno due tappe)
export const etichetta = (i, n) => (i === 0 ? 'A' : i === n - 1 ? 'B' : String(i));

// il nuovo punto dopo la tappa k (trascinando il tratto che parte da k)
export const inserisciDopo = (tappe, k, p) => [...tappe.slice(0, k + 1), nuovaTappa(p), ...tappe.slice(k + 1)];
export const sposta = (tappe, i, p) => tappe.map((t, j) => (j === i ? { ...t, p: [arr(p[0]), arr(p[1])], nome: null } : t));
export const togli = (tappe, i) => tappe.filter((_, j) => j !== i).map((t, j) => (j === 0 ? { ...t, libero: false } : t));
// una tappa su (-1) o giù (+1); la prima tappa del percorso non è mai «libera»
export function riordina(tappe, i, verso) {
  const j = i + verso;
  if (j < 0 || j >= tappe.length) return tappe;
  const r = [...tappe];
  [r[i], r[j]] = [r[j], r[i]];
  return r.map((t, k) => (k === 0 ? { ...t, libero: false } : t));
}
export const sostituisci = (tappe, i, p, nome = null) => tappe.map((t, j) => (j === i ? { ...t, p: [arr(p[0]), arr(p[1])], nome } : t));

// Annulla e Ripeti: la storia delle liste di tappe
export function creaStoria(iniziale = []) {
  let passati = [];
  let futuri = [];
  let ora = iniziale;
  return {
    ora: () => ora,
    vai(nuovo) {
      passati.push(ora);
      if (passati.length > 100) passati.shift();
      futuri = [];
      ora = nuovo;
      return ora;
    },
    annulla() {
      if (!passati.length) return ora;
      futuri.push(ora);
      ora = passati.pop();
      return ora;
    },
    ripeti() {
      if (!futuri.length) return ora;
      passati.push(ora);
      ora = futuri.pop();
      return ora;
    },
    puoAnnullare: () => passati.length > 0,
    puoRipetere: () => futuri.length > 0,
    azzera(nuovo = []) {
      passati = [];
      futuri = [];
      ora = nuovo;
    },
  };
}

// Quale tratto è più vicino a un punto: tratti = [[[lon, lat]…]…] → { indice, distanzaM } (indice -1 se non ce ne sono)
export function trattoPiuVicino(tratti, [lon, lat]) {
  const kx = Math.cos((lat * Math.PI) / 180);
  let migliore = { indice: -1, distanzaM: Infinity };
  tratti.forEach((linea, indice) => {
    for (let i = 1; i < linea.length; i++) {
      const [ax, ay] = [(linea[i - 1][0] - lon) * kx, linea[i - 1][1] - lat];
      const [bx, by] = [(linea[i][0] - lon) * kx, linea[i][1] - lat];
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy) * 111_195;
      if (d < migliore.distanzaM) migliore = { indice, distanzaM: d };
    }
  });
  return migliore;
}

// --- tipo di fondo, dai tag OSM che BRouter dà per ogni tratto ---
const ASFALTO = new Set(['asphalt', 'paved', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'sett', 'cobblestone', 'chipseal', 'bricks']);
const STERRATO = new Set(['gravel', 'fine_gravel', 'compacted', 'ground', 'dirt', 'earth', 'unpaved', 'pebblestone', 'grass', 'mud', 'sand']);
const SENTIERI = new Set(['path', 'footway', 'steps', 'bridleway', 'via_ferrata', 'pedestrian']);
const STRADE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'road', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);

// → 'sentiero' | 'sterrata' | 'asfalto' | 'altro'
export function classeFondo(tag = {}) {
  const s = tag.surface;
  const h = tag.highway;
  if (s && ASFALTO.has(s)) return 'asfalto';
  if (s && STERRATO.has(s)) return h && SENTIERI.has(h) ? 'sentiero' : 'sterrata';
  if (h && SENTIERI.has(h)) return 'sentiero';
  if (h === 'track') return 'sterrata';
  if (h && STRADE.has(h)) return 'asfalto';
  return 'altro';
}
// terreno: [{ daM, aM, tag }] → { parti: [{ daM, aM, classe }], percentuali: { sentiero, sterrata, asfalto, altro } (somma 100), totaleM }
export function fondoDaTerreno(terreno) {
  const parti = (terreno ?? []).map((x) => ({ daM: x.daM, aM: x.aM, classe: classeFondo(x.tag) }));
  const totaleM = parti.reduce((m, x) => m + (x.aM - x.daM), 0);
  const per = { sentiero: 0, sterrata: 0, asfalto: 0, altro: 0 };
  for (const x of parti) per[x.classe] += x.aM - x.daM;
  if (!totaleM) return { parti, percentuali: null, totaleM: 0 };
  const grezze = Object.entries(per).map(([k, v]) => [k, (v / totaleM) * 100]);
  const percentuali = Object.fromEntries(grezze.map(([k, v]) => [k, Math.floor(v)]));
  // i punti persi dall'arrotondamento vanno alle classi con più resto
  let resto = 100 - Object.values(percentuali).reduce((a, b) => a + b, 0);
  for (const [k] of [...grezze].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (resto <= 0) break;
    percentuali[k] += 1;
    resto -= 1;
  }
  return { parti, percentuali, totaleM };
}

// Due preferenze di BRouter per Trekking: «Preferisci sentieri» (parametro del profilo escursionistico alto) e «Misto»
// (il valore di base del profilo). Per MTB non c'è: il profilo è uno solo.
export const PREFERENZE_FONDO = { sentieri: { nome: 'Preferisci sentieri', valore: 1.5 }, misto: { nome: 'Misto', valore: null } };
export const preferenzaPer = (scelta, attivita) => (attivita === 'mtb' ? null : PREFERENZE_FONDO[scelta]?.valore ?? null);

// Chiave di un tratto calcolato (con le opzioni: cambiando attività o preferenza si ricalcola)
export const chiaveTratto = (a, b, libero, opzioni = '') => `${a.p[0]},${a.p[1]}>${b.p[0]},${b.p[1]}${libero ? ':libero' : ''}|${opzioni}`;

export const distanzaM = (a, b) => distanzaKm(a, b) * 1000;
