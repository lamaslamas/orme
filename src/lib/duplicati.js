// Stessa traccia importata due volte: due percorsi sono "lo stesso" se hanno quasi la stessa lunghezza e
// i punti dell'uno stanno vicini all'altro (e viceversa), anche se il verso è opposto o il file è un altro.
import { distanzaDallaTracciaM, lunghezzaKm } from './geo.js';
import { campionaEquidistanti } from './profiloCampionato.js';

export const TOLLERANZA_M = 30; // un punto più vicino di così alla traccia dell'altro è "sulla traccia"
export const QUOTA_VICINA = 0.9; // quanti punti devono stare sull'altra traccia
export const DIFFERENZA_LUNGHEZZA = 0.15; // lunghezze che differiscono meno del 15%
const PASSO_M = 100;
const MAX_CAMPIONI = 300;

function riquadro(g) {
  let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const linea of g.coordinates) for (const [x, y] of linea) [o, s, e, n] = [Math.min(o, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
  return [o, s, e, n];
}
const sovrapposti = (a, b, margine = 0.001) => a[0] <= b[2] + margine && b[0] <= a[2] + margine && a[1] <= b[3] + margine && b[1] <= a[3] + margine;

// quota dei punti di "da" (uno ogni 100 m) che stanno entro la tolleranza dalla traccia "a"
function quotaVicina(da, a, km) {
  const n = Math.min(MAX_CAMPIONI, Math.max(2, Math.ceil((km * 1000) / PASSO_M) + 1));
  const punti = campionaEquidistanti(da.coordinates, n);
  if (!punti.length) return 0;
  return punti.filter((p) => distanzaDallaTracciaM([p.lon, p.lat], a) <= TOLLERANZA_M).length / punti.length;
}

// a, b: MultiLineString [[lon, lat]…]
export function stessaTraccia(a, b) {
  if (!a?.coordinates?.length || !b?.coordinates?.length) return false;
  if (!sovrapposti(riquadro(a), riquadro(b))) return false;
  const la = lunghezzaKm(a);
  const lb = lunghezzaKm(b);
  if (!la || !lb || Math.abs(la - lb) / Math.max(la, lb) > DIFFERENZA_LUNGHEZZA) return false;
  return quotaVicina(a, b, la) >= QUOTA_VICINA && quotaVicina(b, a, lb) >= QUOTA_VICINA;
}

// nuovi: [{ nome, geojson, … }]; esistenti: [{ nome, geojson }] (i percorsi già salvati).
// → i nuovi con duplicatoDi: nome del percorso uguale già salvato (o già nell'elenco), altrimenti null
export function segnaDuplicati(nuovi, esistenti) {
  const visti = [...esistenti.map((e) => ({ nome: e.nome || 'Percorso senza nome', geojson: e.geojson, dellImport: false }))];
  return nuovi.map((p) => {
    const uguale = visti.find((v) => stessaTraccia(p.geojson, v.geojson));
    if (!uguale) visti.push({ nome: p.nome, geojson: p.geojson, dellImport: true });
    return { ...p, duplicatoDi: uguale ? { nome: uguale.nome, dellImport: uguale.dellImport } : null };
  });
}
