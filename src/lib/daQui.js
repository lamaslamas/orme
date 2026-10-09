// "Percorsi da qui": i percorsi dell'archivio la cui traccia passa entro un raggio da un punto,
// dal più vicino. Tutto sul dispositivo, anche offline: le tracce sono già salvate.
import { distanzaDallaTracciaM, distanzaKm } from './geo.js';
import { percorsoSentiero } from './tracce.js';

export const RAGGI_DA_QUI = [100, 200, 500];
export const RAGGIO_DA_QUI = 200;

// riquadro di ogni traccia, calcolato una volta sola
const riquadri = new WeakMap();
function riquadro(geojson) {
  if (!riquadri.has(geojson)) {
    let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const linea of geojson.coordinates ?? []) {
      for (const [lon, lat] of linea) {
        o = Math.min(o, lon);
        e = Math.max(e, lon);
        s = Math.min(s, lat);
        n = Math.max(n, lat);
      }
    }
    riquadri.set(geojson, [o, s, e, n]);
  }
  return riquadri.get(geojson);
}

// percorsi: [{ sentiero, traccia }]; punto: [lon, lat]
// Restituisce [{ sentiero, traccia, distanzaM, estremo: 'inizio' | 'fine' | null }]
export function percorsiDaQui(percorsi, [lon, lat], raggioM = RAGGIO_DA_QUI) {
  const mLat = raggioM / 111_000;
  const mLon = mLat / Math.cos((lat * Math.PI) / 180);
  const risultati = [];
  for (const p of percorsi) {
    const g = p.traccia?.geojson;
    if (!g?.coordinates?.length) continue;
    const [o, s, e, n] = riquadro(g);
    if (lon < o - mLon || lon > e + mLon || lat < s - mLat || lat > n + mLat) continue;
    const distanzaM = distanzaDallaTracciaM([lon, lat], g);
    if (distanzaM > raggioM) continue;
    // "parte da qui": il punto è vicino all'inizio o alla fine del percorso
    const { pezzi } = percorsoSentiero(g);
    const inizio = pezzi[0]?.[0];
    const fine = pezzi.at(-1)?.at(-1);
    const vicino = (q) => q && distanzaKm(q, [lon, lat]) * 1000 <= raggioM;
    const estremo = vicino(inizio) ? 'inizio' : vicino(fine) ? 'fine' : null;
    risultati.push({ ...p, distanzaM: Math.round(distanzaM), estremo });
  }
  return risultati.sort((a, b) => a.distanzaM - b.distanzaM);
}
