// Terreno lungo un percorso dai tag OSM: tipo di via, fondo, difficoltà (sac_scale), visibilità.
// Per i percorsi disegnati i tag arrivano da BRouter; per i GPX si cerca su Overpass
// la via più vicina a ogni punto (può sbagliare vicino agli incroci).
import { distanzaKm } from './geo.js';
import { puntoSullaLinea } from './misure.js';

export const PASSO_TERRENO_M = 25;
export const DISTANZA_MAX_M = 20;

export const ATTRIBUTI = {
  highway: {
    nome: 'Tipo di via',
    categoria: (v) =>
      ({ path: 'Sentiero', footway: 'Sentiero', bridleway: 'Mulattiera', steps: 'Gradini', track: 'Carrareccia', cycleway: 'Ciclabile' })[v] ??
      (['residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'service', 'living_street', 'pedestrian'].includes(v) ? 'Strada' : null),
    ordine: ['Sentiero', 'Mulattiera', 'Gradini', 'Carrareccia', 'Ciclabile', 'Strada'],
  },
  surface: {
    nome: 'Fondo',
    categoria: (v) => {
      if (!v) return null;
      if (['asphalt', 'paved', 'concrete', 'paving_stones', 'sett', 'cobblestone'].includes(v)) return 'Asfalto o lastricato';
      if (['compacted', 'fine_gravel', 'gravel', 'pebblestone', 'unpaved'].includes(v)) return 'Sterrato o ghiaia';
      if (['ground', 'dirt', 'earth', 'grass', 'mud', 'sand', 'wood', 'woodchips'].includes(v)) return 'Terra o prato';
      if (['rock', 'stone', 'scree', 'bare_rock'].includes(v)) return 'Roccia o pietraia';
      return 'Altro';
    },
    ordine: ['Asfalto o lastricato', 'Sterrato o ghiaia', 'Terra o prato', 'Roccia o pietraia', 'Altro'],
  },
  sac_scale: {
    nome: 'Difficoltà (scala SAC)',
    categoria: (v) =>
      ({
        hiking: 'T1 escursione facile',
        mountain_hiking: 'T2 escursione di montagna',
        demanding_mountain_hiking: 'T3 montagna impegnativa',
        alpine_hiking: 'T4 alpinistica',
        demanding_alpine_hiking: 'T5 alpinistica impegnativa',
        difficult_alpine_hiking: 'T6 alpinistica difficile',
      })[v] ?? null,
    ordine: ['T1 escursione facile', 'T2 escursione di montagna', 'T3 montagna impegnativa', 'T4 alpinistica', 'T5 alpinistica impegnativa', 'T6 alpinistica difficile'],
  },
  trail_visibility: {
    nome: 'Visibilità della traccia',
    categoria: (v) => ({ excellent: 'Ottima', good: 'Buona', intermediate: 'Discreta', bad: 'Scarsa', horrible: 'Pessima', no: 'Assente' })[v] ?? null,
    ordine: ['Ottima', 'Buona', 'Discreta', 'Scarsa', 'Pessima', 'Assente'],
  },
};

export const NON_INDICATO = 'Non indicato';

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

// Km per categoria di un attributo, con "Non indicato" dove manca il tag
export function riepilogoTerreno(tratti, attributo) {
  const def = ATTRIBUTI[attributo];
  const km = new Map();
  for (const t of tratti) {
    const c = def.categoria(t.tag?.[attributo]) ?? NON_INDICATO;
    km.set(c, (km.get(c) ?? 0) + (t.aM - t.daM) / 1000);
  }
  const ordine = [...def.ordine, NON_INDICATO];
  return [...km].sort((a, b) => ordine.indexOf(a[0]) - ordine.indexOf(b[0])).map(([categoria, k]) => ({ categoria, km: k }));
}
