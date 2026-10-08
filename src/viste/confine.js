// Confine di un parco: dalla memoria del telefono, altrimenti scaricato da OSM e salvato.
import L from 'leaflet';
import { leggiConfine, salvaConfine } from '../db.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { anelliDaRelazione, queryConfine } from '../lib/confini.js';

export async function ottieniConfine(parco) {
  const salvato = await leggiConfine(parco.id);
  if (salvato) return salvato;
  const json = await interrogaOverpass(queryConfine(parco.osm.relazione), { timeoutMs: 90000 });
  const anelli = anelliDaRelazione(json);
  if (!anelli.length) throw new Error('Confine del parco non trovato su OpenStreetMap.');
  return salvaConfine({ parco: parco.id, anelli });
}

export function disegnaConfine(confine) {
  return L.polygon(
    confine.anelli.map((a) => a.map(([lon, lat]) => [lat, lon])),
    { color: '#326752', weight: 2.5, dashArray: '6 5', fillColor: '#2f9e6b', fillOpacity: 0.06, interactive: false },
  );
}
