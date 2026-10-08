// Osservazioni iNaturalist lungo una traccia: fascia attorno al percorso e statistiche per specie.
import { distanzaDallaTracciaM } from './geo.js';

export const FASCE_M = [100, 250, 500];
export const RAGGIO_SENTIERI_M = 500;
export const MINIMO_OSSERVAZIONI = 5;
export const MINIMO_PERSONE = 3;
export const MASSIMO_PAGINE = 5; // 5 × 200 = 1000 osservazioni al massimo

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// Riquadro [sud, ovest, nord, est] della traccia, allargato del margine
export function riquadroTraccia(pezzi, margineM) {
  const punti = pezzi.flat();
  const lat = punti.map((p) => p[1]);
  const lon = punti.map((p) => p[0]);
  const dLat = margineM / 111195;
  const latMedia = (Math.min(...lat) + Math.max(...lat)) / 2;
  const dLon = margineM / (111195 * Math.cos((latMedia * Math.PI) / 180));
  return [Math.min(...lat) - dLat, Math.min(...lon) - dLon, Math.max(...lat) + dLat, Math.max(...lon) + dLon];
}

// Separa le osservazioni nella fascia da quelle con posizione sfumata (non confrontabili)
export function osservazioniNellaFascia(osservazioni, pezzi, raggioM) {
  const geo = { coordinates: pezzi };
  const dentro = [];
  let sfumate = 0;
  for (const o of osservazioni) {
    if (o.sfumata) {
      sfumate++;
      continue;
    }
    if (!Number.isFinite(o.lat)) continue;
    const d = distanzaDallaTracciaM([o.lon, o.lat], geo);
    if (d <= raggioM) dentro.push({ ...o, distanzaM: d });
  }
  return { dentro, sfumate };
}

// Per ogni specie: osservazioni, persone diverse, mesi più frequenti; solo quelle consistenti
export function specieConsistenti(osservazioni, { minimo = MINIMO_OSSERVAZIONI, persone = MINIMO_PERSONE } = {}) {
  const perSpecie = new Map();
  for (const o of osservazioni) {
    const chiave = o.nomeScientifico || o.specie;
    const s = perSpecie.get(chiave) ?? { specie: o.specie, nomeScientifico: o.nomeScientifico, n: 0, osservatori: new Set(), mesi: Array(12).fill(0) };
    s.n++;
    if (o.osservatore) s.osservatori.add(o.osservatore);
    if (o.data) s.mesi[Number(o.data.slice(5, 7)) - 1]++;
    perSpecie.set(chiave, s);
  }
  return [...perSpecie.values()]
    .map((s) => ({ specie: s.specie, nomeScientifico: s.nomeScientifico, osservazioni: s.n, persone: s.osservatori.size, mesiMigliori: mesiMigliori(s.mesi) }))
    .filter((s) => s.osservazioni >= minimo && s.persone >= persone)
    .sort((a, b) => b.osservazioni - a.osservazioni);
}

// I mesi con più osservazioni (fino a 3), es. "set–ott"
export function mesiMigliori(conteggi) {
  const totale = conteggi.reduce((a, b) => a + b, 0);
  if (!totale) return '';
  const scelti = conteggi
    .map((n, i) => ({ n, i }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((x) => x.i)
    .sort((a, b) => a - b);
  // mesi consecutivi uniti con il trattino
  const gruppi = [];
  for (const i of scelti) {
    const g = gruppi[gruppi.length - 1];
    if (g && i === g[g.length - 1] + 1) g.push(i);
    else gruppi.push([i]);
  }
  return gruppi.map((g) => (g.length > 1 ? `${MESI[g[0]]}–${MESI[g[g.length - 1]]}` : MESI[g[0]])).join(', ');
}
