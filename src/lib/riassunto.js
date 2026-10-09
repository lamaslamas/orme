// Numeri chiave di un sentiero (km, dislivello, durata) per schede e pagine.
// Si usano i valori inseriti a mano; se mancano, si calcolano dalla traccia.
import { lunghezzaKm } from './geo.js';
import { dislivello } from './quote.js';
import { stimaDurataMin } from './durata.js';
import { percorsoSentiero } from './tracce.js';
import { improntaTraccia } from './panorama.js';

// Profilo delle quote calcolato dal robot, se è di questa traccia (un GPX mio lo rende superato)
export function quoteDellaTraccia(s, traccia) {
  if (!s?.quote || !traccia?.geojson) return null;
  return improntaTraccia(traccia.geojson).split('-')[1] === s.quote.impronta ? s.quote : null;
}

export function misureSentiero(s, traccia) {
  const percorso = traccia?.geojson ? percorsoSentiero(traccia.geojson) : null;
  const daTraccia = percorso?.pezzi.length
    ? { km: lunghezzaKm({ coordinates: percorso.pezzi }), disl: dislivello(percorso.pezzi) }
    : null;

  const km = Number.isFinite(s.lunghezzaKm) ? s.lunghezzaKm : daTraccia?.km ?? null;
  // quote: della traccia (GPX con quote) oppure dal profilo calcolato con il modello del terreno
  const profilo = quoteDellaTraccia(s, traccia);
  const dislTraccia = daTraccia?.disl ?? (profilo ? { salita: profilo.salita, discesa: profilo.discesa } : null);
  const salita = Number.isFinite(s.dislivelloM) ? s.dislivelloM : dislTraccia?.salita ?? null;
  const disl = dislTraccia ?? (salita != null ? { salita, discesa: 0 } : null);
  let durataMin = Number.isFinite(s.durataMin) ? s.durataMin : null;
  let durataStimata = false;
  if (durataMin == null && km != null) {
    durataMin = stimaDurataMin(km, disl);
    durataStimata = true;
  }
  return {
    km,
    kmCalcolati: !Number.isFinite(s.lunghezzaKm) && km != null,
    salita,
    discesa: dislTraccia?.discesa ?? null,
    durataMin,
    durataStimata,
  };
}
