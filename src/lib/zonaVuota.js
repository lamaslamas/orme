// Zona inquadrata senza (o con pochi) percorsi: cosa dire e cosa proporre. Qui solo i calcoli.
import { distanzaDallaTracciaM } from './geo.js';

export const POCHI_PERCORSI = 5;
export const ZOOM_SENTIERI_NON_SEGNATI = 13;

// Il percorso più vicino al centro: voci [{ id, geojson }] → { id, metri } o null
export function piuVicino(centro, voci) {
  let migliore = null;
  for (const { id, geojson } of voci) {
    if (!geojson?.coordinates?.length) continue;
    const metri = distanzaDallaTracciaM(centro, geojson);
    if (!migliore || metri < migliore.metri) migliore = { id, metri };
  }
  return migliore;
}

// Cosa mostrare sotto (o al posto de) l'elenco della zona
// qui: percorsi nella zona; altre: percorsi con gli stessi filtri fuori dalla zona; filtri: ce ne sono di attivi
// → 'filtri' (zona vuota per colpa dei filtri), 'vuota' (nulla), 'pochi' (meno di 5), 'ok'
export function tipoZona({ qui, altre, filtri }) {
  if (!qui && filtri && altre > 0) return 'filtri';
  if (!qui) return 'vuota';
  return qui < POCHI_PERCORSI ? 'pochi' : 'ok';
}

export const testoNessunoQui = (altre) => `Nessun percorso qui con questi filtri · ${altre === 1 ? '1 in un\'altra zona' : `${altre} in altre zone`}`;

// "Zona già cercata il 12 ottobre": la zona salvata copre il centro e c'è la data dell'ultima ricerca
export function testoZonaCercata(zona, oggiMs = Date.now()) {
  if (!zona?.aggiornato) return '';
  const d = new Date(zona.aggiornato);
  if (Number.isNaN(d.getTime()) || d.getTime() > oggiMs + 86_400_000) return '';
  return `Zona già cercata il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`;
}
