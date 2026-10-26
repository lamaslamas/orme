// Terreno lungo un percorso dai tag OSM: tipo di via, fondo, difficoltà (sac_scale), visibilità.
// Per i percorsi disegnati i tag arrivano da BRouter; per i GPX si cerca su Overpass
// la via più vicina a ogni punto (può sbagliare vicino agli incroci).
import { distanzaKm } from './geo.js';
import { puntoSullaLinea } from './misure.js';

export const PASSO_TERRENO_M = 25;
export const DISTANZA_MAX_M = 20;

// Il fondo di un tratto, in quattro classi: sentiero, sterrato, asfalto, sconosciuto (dai tag OSM highway e surface)
export const FONDI = {
  sentiero: { nome: 'Sentiero', colore: '#15803d' },
  sterrato: { nome: 'Sterrato', colore: '#ca8a04' },
  asfalto: { nome: 'Asfalto', colore: '#64748b' },
  sconosciuto: { nome: 'Sconosciuto', colore: '#d1d5db' },
};
const FONDO_ASFALTO = ['asphalt', 'paved', 'concrete', 'paving_stones', 'sett', 'cobblestone'];
const FONDO_STERRATO = ['compacted', 'fine_gravel', 'gravel', 'pebblestone', 'unpaved'];
const VIE_STRADA = ['residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'service', 'living_street', 'pedestrian', 'cycleway'];
const VIE_SENTIERO = ['path', 'footway', 'bridleway', 'steps'];
export function tipoFondo(tag = {}) {
  const { highway, surface } = tag;
  if (FONDO_ASFALTO.includes(surface)) return 'asfalto';
  if (VIE_STRADA.includes(highway)) return FONDO_STERRATO.includes(surface) || ['ground', 'dirt', 'earth', 'grass', 'mud', 'sand'].includes(surface) ? 'sterrato' : 'asfalto';
  if (highway === 'track') return 'sterrato';
  if (VIE_SENTIERO.includes(highway)) return FONDO_STERRATO.includes(surface) ? 'sterrato' : 'sentiero';
  return 'sconosciuto';
}

// Query Overpass delle vie vicine a punti campionati del percorso
export function queryVieVicine(punti, raggioM = DISTANZA_MAX_M) {
  const coord = punti.map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(',');
  return `[out:json][timeout:120];way["highway"](around:${raggioM},${coord});out tags geom;`;
}

export function vieDaRisposta(json) {
  return (json?.elements ?? [])
    .filter((e) => e.type === 'way' && Array.isArray(e.geometry))
    .map((e) => ({ id: e.id, tag: e.tags ?? {}, linea: e.geometry.map((p) => [p.lon, p.lat]) }));
}

// Punti ogni passo lungo i pezzi: [lon, lat, metri dall'inizio]
export function puntiOgni(pezzi, passoM = PASSO_TERRENO_M) {
  const punti = [];
  let base = 0;
  for (const linea of pezzi) {
    let prog = 0;
    let prossimo = 0;
    for (let i = 0; i < linea.length; i++) {
      const d = i ? distanzaKm(linea[i - 1], linea[i]) * 1000 : 0;
      const inizio = prog;
      prog += d;
      while (prossimo <= prog) {
        const t = d ? (prossimo - inizio) / d : 0;
        const a = linea[Math.max(0, i - 1)];
        const b = linea[i];
        punti.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, base + prossimo]);
        prossimo += passoM;
      }
    }
    base += prog;
  }
  return punti;
}

// Solo i tag che descrivono il terreno (nomi e altri dettagli non servono e pesano)
export const TAG_TERRENO = ['highway', 'surface', 'sac_scale', 'trail_visibility', 'tracktype', 'smoothness', 'mtb:scale', 'bicycle'];
export function tagTerreno(tag = {}) {
  return Object.fromEntries(TAG_TERRENO.filter((k) => tag[k] != null).map((k) => [k, tag[k]]));
}

// Query dei tratti (way) delle relazioni OSM della traccia, con tag e geometria
export function queryTrattiRelazioni(idRelazioni) {
  return `[out:json][timeout:120];rel(id:${idRelazioni.map(Number).join(',')});way(r);out tags geom;`;
}

// Per ogni punto la via più vicina entro la distanza massima; tratti uguali uniti
export function abbinaTerreno(punti, vie, distanzaMaxM = DISTANZA_MAX_M) {
  const tratti = [];
  for (let i = 0; i < punti.length - 1; i++) {
    let migliore = null;
    for (const via of vie) {
      if (via.linea.length < 2) continue;
      const s = puntoSullaLinea(via.linea, punti[i]);
      if (s.distanzaDallaLineaM <= distanzaMaxM && (!migliore || s.distanzaDallaLineaM < migliore.d)) migliore = { d: s.distanzaDallaLineaM, tag: via.tag };
    }
    const tag = tagTerreno(migliore?.tag);
    const precedente = tratti[tratti.length - 1];
    if (precedente && JSON.stringify(precedente.tag) === JSON.stringify(tag)) precedente.aM = punti[i + 1][2];
    else tratti.push({ daM: punti[i][2], aM: punti[i + 1][2], tag });
  }
  return tratti.map((t) => ({ ...t, daM: Math.round(t.daM), aM: Math.round(t.aM) }));
}

// Km e percentuale per tipo di fondo, nell'ordine sentiero, sterrato, asfalto, sconosciuto (solo quelli presenti)
export function riepilogoFondo(tratti) {
  const km = Object.fromEntries(Object.keys(FONDI).map((k) => [k, 0]));
  for (const t of tratti) km[tipoFondo(t.tag)] += (t.aM - t.daM) / 1000;
  const totale = Object.values(km).reduce((a, b) => a + b, 0) || 1;
  return Object.keys(FONDI)
    .filter((k) => km[k] > 0)
    .map((k) => ({ tipo: k, nome: FONDI[k].nome, km: km[k], percentuale: Math.round((km[k] / totale) * 100) }));
}
