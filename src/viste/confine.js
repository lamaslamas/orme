// Confine di un parco: dalla memoria del telefono, altrimenti scaricato da OSM e salvato.
import L from 'leaflet';
import { leggiConfine, salvaConfine } from '../db.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { anelliDaRelazione, queryConfine } from '../lib/confini.js';
import { COLORI } from './colori.js';

export async function ottieniConfine(parco) {
  const salvato = await leggiConfine(parco.id);
  if (salvato) return salvato;
  const json = await interrogaOverpass(queryConfine(parco.osm), { timeoutMs: 90000 });
  const anelli = anelliDaRelazione(json);
  if (!anelli.length) throw new Error('Confine del parco non trovato su OpenStreetMap.');
  return salvaConfine({ parco: parco.id, anelli });
}

export function disegnaConfine(confine) {
  return L.polygon(
    confine.anelli.map((a) => a.map(([lon, lat]) => [lat, lon])),
    { color: COLORI.confine, weight: 2.5, dashArray: '6 5', fillColor: COLORI.confineRiempimento, fillOpacity: 0.08, interactive: false },
  );
}
