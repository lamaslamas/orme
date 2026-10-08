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

export function disegnaConfine(confine) {
  return L.polygon(
    confine.anelli.map((a) => a.map(([lon, lat]) => [lat, lon])),
    { color: COLORI.confine, weight: 2.5, dashArray: '6 5', fillColor: COLORI.confineRiempimento, fillOpacity: 0.08, interactive: false },
  );
}
