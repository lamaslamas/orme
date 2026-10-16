// Profilo di una traccia a 100 punti equidistanti (km uguali tra un punto e l'altro): lo calcola il
// robot con TINITALY e lo salva nell'archivio (quote.profilo), così la scheda lo mostra subito, senza
// chiedere niente a nessun servizio. Qui solo i calcoli: campionare, rimettere le quote sulla traccia.
import { distanzaKm } from './geo.js';

export const PUNTI_PROFILO = 100;

// pezzi [[lon, lat]…]: n punti a distanza uguale lungo la traccia. I salti tra un pezzo e l'altro non
// contano (come nel profilo del disegno). → [{ km, lon, lat }]
export function campionaEquidistanti(pezzi, n = PUNTI_PROFILO) {
  const punti = [];
  let km = 0;
  for (const linea of pezzi ?? []) {
    linea.forEach((p, i) => {
      if (i) km += distanzaKm(linea[i - 1], p);
      punti.push({ km, lon: p[0], lat: p[1], inizio: i === 0 });
    });
  }
  if (punti.length < 2 || km <= 0 || n < 2) return [];
  const fuori = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const bersaglio = (k / (n - 1)) * km;
    while (j < punti.length - 1 && (punti[j].km < bersaglio || punti[j].inizio)) j++;
    const a = punti[j - 1];
    const b = punti[j];
    const t = b.inizio || b.km === a.km ? 1 : Math.min(1, Math.max(0, (bersaglio - a.km) / (b.km - a.km)));
    fuori.push({ km: bersaglio, lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t });
  }
  return fuori;
}

// quota(lon, lat) → metri o null. → elenco di quote intere (n) o null se ne manca più del 10%
export function profiloEquidistante(pezzi, quota, n = PUNTI_PROFILO) {
  const campioni = campionaEquidistanti(pezzi, n);
  if (!campioni.length) return null;
  const q = campioni.map((c) => quota(c.lon, c.lat));
  return elencoQuote(q);
}

// quote (anche null) → elenco intero, con i buchi riempiti dal vicino; null se manca più del 10%
export function elencoQuote(q) {
  const mancanti = q.filter((x) => !Number.isFinite(x)).length;
  if (!q.length || mancanti > q.length * 0.1) return null;
  let ultima = q.find((x) => Number.isFinite(x));
  return q.map((x) => {
    if (Number.isFinite(x)) ultima = x;
    return Math.round(ultima);
  });
}

// profilo salvato → serie per il disegno del profilo: [{ km, z, p: [lon, lat, z] }]. null se non combacia
export function serieDaProfilo(pezzi, z) {
  const campioni = campionaEquidistanti(pezzi, z?.length);
  if (!Array.isArray(z) || z.length < 2 || campioni.length !== z.length) return null;
  return campioni.map((c, i) => ({ km: c.km, z: z[i], p: [c.lon, c.lat, z[i]] }));
}
