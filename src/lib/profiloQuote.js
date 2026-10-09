// Profilo delle quote di una traccia, calcolato dal robot con il modello del terreno:
// quota di partenza, minima e massima (con il punto più alto) e dislivello.
// Serve a "Dove vado domani?" (temperatura in vetta, durata) anche per le tracce senza quote.
import { percorsoSentiero } from './tracce.js';
import { campionaPercorso } from './panorama.js';
import { dislivello } from './quote.js';

export const PASSO_PROFILO_M = 50;
const arrotonda = (x) => Math.round(x * 1e5) / 1e5;

// quota(lon, lat) → metri oppure null. Restituisce null se mancano troppe quote.
export function profiloQuote(geojson, quota, passoM = PASSO_PROFILO_M) {
  const { pezzi } = percorsoSentiero(geojson);
  const linee = [];
  let mancanti = 0;
  let totali = 0;
  for (const pezzo of pezzi) {
    const linea = [];
    for (const p of campionaPercorso({ type: 'MultiLineString', coordinates: [pezzo] }, passoM)) {
      totali++;
      const q = quota(p.lon, p.lat);
      if (Number.isFinite(q)) linea.push([p.lon, p.lat, q]);
      else mancanti++;
    }
    if (linea.length > 1) linee.push(linea);
  }
  if (!linee.length || mancanti > totali * 0.2) return null;
  const tutti = linee.flat();
  const alto = tutti.reduce((a, b) => (b[2] > a[2] ? b : a));
  const basso = tutti.reduce((a, b) => (b[2] < a[2] ? b : a));
  const partenza = tutti[0];
  const d = dislivello(linee);
  return {
    partenza: { lon: arrotonda(partenza[0]), lat: arrotonda(partenza[1]), quota: Math.round(partenza[2]) },
    alto: { lon: arrotonda(alto[0]), lat: arrotonda(alto[1]), quota: Math.round(alto[2]) },
    min: Math.round(basso[2]),
    max: Math.round(alto[2]),
    salita: d.salita,
    discesa: d.discesa,
  };
}
