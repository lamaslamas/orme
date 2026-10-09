// Confine di un parco: dalla memoria del telefono, poi dal file dell'app (dati/confini.json),
// solo in ultimo da Overpass (spesso sovraccarico).
import L from 'leaflet';
import { leggiConfine, salvaConfine } from '../db.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { anelliDaRelazione, queryConfine } from '../lib/confini.js';
import { COLORI } from './colori.js';

export async function ottieniConfine(parco) {
  const salvato = await leggiConfine(parco.id);
  if (salvato) return salvato;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}dati/confini.json`);
    const anelli = r.ok ? (await r.json()).confini?.[parco.id] : null;
    if (anelli?.length) return salvaConfine({ parco: parco.id, anelli });
  } catch {
    // file non raggiungibile (offline): si prova con Overpass
  }
  const json = await interrogaOverpass(queryConfine(parco.osm), { timeoutMs: 90000 });
  const anelli = anelliDaRelazione(json);
  if (!anelli.length) throw new Error('Confine del parco non trovato su OpenStreetMap.');
  return salvaConfine({ parco: parco.id, anelli });
}

// Confine come nelle carte escursionistiche: fascia verde larga e trasparente con una linea sottile
// al centro, senza riempimento (così non si confonde con le tracce né copre la mappa).
// scelto: il parco selezionato, più marcato.
export function disegnaConfine(confine, { scelto = false } = {}) {
  const anelli = confine.anelli.map((a) => a.map(([lon, lat]) => [lat, lon]));
  return L.featureGroup([
    L.polygon(anelli, { color: COLORI.confineFascia, weight: scelto ? 12 : 8, opacity: scelto ? 0.3 : 0.2, fill: false, interactive: false, lineJoin: 'round' }),
    L.polygon(anelli, { color: COLORI.confine, weight: scelto ? 2 : 1.25, opacity: 0.9, fill: false, interactive: false }),
  ]);
}
