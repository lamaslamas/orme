// Numeri chiave di un sentiero (km, dislivello, durata) per schede e pagine.
// Si usano i valori inseriti a mano; se mancano, si calcolano dalla traccia.
import { lunghezzaKm } from './geo.js';
import { dislivello } from './quote.js';
import { stimaDurataMin } from './durata.js';
import { percorsoSentiero } from './tracce.js';

export function misureSentiero(s, traccia) {
  const percorso = traccia?.geojson ? percorsoSentiero(traccia.geojson) : null;
  const daTraccia = percorso?.pezzi.length
    ? { km: lunghezzaKm({ coordinates: percorso.pezzi }), disl: dislivello(percorso.pezzi) }
    : null;

  const km = Number.isFinite(s.lunghezzaKm) ? s.lunghezzaKm : daTraccia?.km ?? null;
  const salita = Number.isFinite(s.dislivelloM) ? s.dislivelloM : daTraccia?.disl?.salita ?? null;
  const disl = daTraccia?.disl ?? (salita != null ? { salita, discesa: 0 } : null);
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
    discesa: daTraccia?.disl?.discesa ?? null,
    durataMin,
    durataStimata,
  };
}
