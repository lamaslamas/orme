// "Scarica questo itinerario" (dal foglio di un sentiero segnato toccato sulla mappa): la relazione
// OSM intera diventa un percorso sul telefono, poi dislivello con TINITALY e fauna da GBIF, come i
// percorsi di "Cerca percorsi qui". Rifugi e acqua si calcolano nella scheda, come per tutti.
import { salvaSentiero, salvaTraccia, aggiornaCalcolati, leggiSentiero } from '../db.js';
import { CAMPI_PERSONALI } from '../lib/archivio.js';
import { interrogaOverpass } from '../lib/overpass.js';
import { queryItinerario, itinerarioDallaRisposta, zonaDellaTraccia } from '../lib/itinerario.js';
import { improntaTraccia } from '../lib/panorama.js';
import { profiloDaTerrain } from './quote.js';
import { osservazioniDellaZona, faunaDelPercorso } from './zona.js';

// idParco: il parco dove è stato toccato il tratto ("intorno" fuori dai parchi).
// avanzamento(testo): messaggi brevi. Restituisce l'id del percorso salvato (lancia se non riesce).
export async function scaricaItinerario(idRelazione, idParco, { avanzamento = () => {} } = {}) {
  avanzamento('Scarico l\'itinerario da OpenStreetMap…');
  const json = await interrogaOverpass(queryItinerario(idRelazione), { timeoutMs: 60_000 });
  const r = itinerarioDallaRisposta(json, idRelazione, idParco);
  if (!r) throw new Error('itinerario non trovato o troppo corto');
  // già sul telefono (es. il tratto nel parco dell'archivio): restano parco e dati miei, la traccia diventa intera
  const prima = await leggiSentiero(r.sentiero.id);
  const personali = prima ? Object.fromEntries([...CAMPI_PERSONALI, 'parco', 'parchi'].filter((k) => prima[k] != null).map((k) => [k, prima[k]])) : {};
  await salvaSentiero({ ...(prima ?? {}), ...r.sentiero, ...personali });
  await salvaTraccia(r.traccia);
  const g = r.traccia.geojson;
  // dislivello: TINITALY (10 m), come il disegno e le altre schede; se non risponde si riprova dalla scheda
  avanzamento('Calcolo il dislivello…');
  try {
    const quote = await profiloDaTerrain(g);
    if (quote) await aggiornaCalcolati(r.sentiero.id, { quote: { ...quote, impronta: improntaTraccia(g).split('-')[1], fonte: 'terrain' } });
  } catch (e) {
    console.warn('Dislivello non calcolato', e);
  }
  // fauna osservata intorno alla traccia
  avanzamento('Cerco la fauna osservata lungo il percorso…');
  const zona = zonaDellaTraccia(g);
  const osservazioni = zona ? await osservazioniDellaZona(zona.centro, zona.km) : null;
  if (osservazioni) await aggiornaCalcolati(r.sentiero.id, { faunaInat: faunaDelPercorso(osservazioni, g) });
  return r.sentiero.id;
}
