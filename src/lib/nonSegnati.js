// Sentieri non segnati: sentieri, mulattiere e carrarecce disegnati su OpenStreetMap che non fanno
// parte di nessun percorso segnato (CAI, MTB, ciclabile). Si chiedono solo per la zona inquadrata,
// quando lo si chiede ("Cerca sentieri qui"): sono tantissimi e cambiano da zona a zona.
import { lunghezzaKm } from './geo.js';

// da questo zoom in su (qualche km di lato): oltre, la richiesta sarebbe troppo grande
export const ZOOM_NON_SEGNATI = 13;

const TIPI = { path: 'Sentiero', footway: 'Sentiero', bridleway: 'Mulattiera', track: 'Carrareccia' };

// riquadro: [sud, ovest, nord, est]
export function queryNonSegnati([s, o, n, e]) {
  const r = [s, o, n, e].map((x) => x.toFixed(5)).join(',');
  return `[out:json][timeout:40];
(
  way["highway"~"^(path|bridleway|track)$"]["access"!~"^(private|no)$"](${r});
  way["highway"="footway"]["footway"!~"^(sidewalk|crossing)$"]["access"!~"^(private|no)$"](${r});
)->.tutte;
rel(bw.tutte)["route"~"^(hiking|foot|walking|mtb|bicycle)$"]->.percorsi;
way(r.percorsi)->.segnate;
(.tutte; - .segnate;);
out tags geom;`;
}

// Risposta → [{ id, tipo, nome, km, linea: [[lon, lat]…], difficolta }]
export function sentieriNonSegnati(json) {
  const risultato = [];
  for (const el of json?.elements ?? []) {
    if (el.type !== 'way' || !Array.isArray(el.geometry)) continue;
    const linea = el.geometry.filter((p) => p && Number.isFinite(p.lat)).map((p) => [Math.round(p.lon * 1e5) / 1e5, Math.round(p.lat * 1e5) / 1e5]);
    if (linea.length < 2) continue;
    const t = el.tags ?? {};
    risultato.push({
      id: el.id,
      tipo: TIPI[t.highway] ?? 'Sentiero',
      nome: t.name ?? null,
      km: Math.round(lunghezzaKm({ coordinates: [linea] }) * 100) / 100,
      linea,
      // scala SAC di OSM (T1–T6): la difficoltà indicata da chi l'ha mappato, se c'è
      difficolta: t.sac_scale ?? null,
    });
  }
  return risultato;
}

const SAC = {
  hiking: 'facile',
  mountain_hiking: 'escursionistico',
  demanding_mountain_hiking: 'impegnativo',
  alpine_hiking: 'alpinistico',
  demanding_alpine_hiking: 'alpinistico impegnativo',
  difficult_alpine_hiking: 'alpinistico difficile',
};
export const testoDifficoltaSac = (sac) => SAC[sac] ?? null;
