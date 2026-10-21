// Numeri chiave di un sentiero (km, dislivello, durata) per schede e pagine.
// Dove la traccia è continua i numeri vengono dalla traccia; senza traccia, o con una traccia incompleta
// (salti oltre 500 m), si usano i valori della fonte.
import { lunghezzaKm } from './geo.js';
import { dislivello } from './quote.js';
import { stimaDurataMin } from './durata.js';
import { percorsoSentiero, tracciaDaNonUsare, invertiPercorso } from './tracce.js';
import { versoDi, invertiQuote } from './verso.js';
import { fattoreRitmo } from './ritmo.js';
import { improntaTraccia } from './panorama.js';

// Profilo delle quote calcolato dal robot, se è di questa traccia (un GPX mio lo rende superato)
// (con "Inverti senso" il profilo e salita/discesa nel verso scelto)
export function quoteDellaTraccia(s, traccia) {
  if (!s?.quote || !traccia?.geojson) return null;
  if (improntaTraccia(traccia.geojson).split('-')[1] !== s.quote.impronta) return null;
  return versoDi(s) ? invertiQuote(s.quote) : s.quote;
}

// "Traccia incompleta: mancano circa 7,9 km" (null se la traccia è continua)
export const testoIncompleta = (m) => (m?.incompleta ? `Traccia incompleta: mancano circa ${m.incompleta.mancanoKm.toFixed(1).replace('.', ',')} km` : null);

export function misureSentiero(s, traccia) {
  // una rete di sentieri (aree protette): solo i km di sentieri, niente durata né dislivello di un giro
  if (s.tipoPercorso === 'rete_sentieri') {
    const km = Number.isFinite(s.lunghezzaKm) ? s.lunghezzaKm : traccia?.geojson ? lunghezzaKm(traccia.geojson) : null;
    return { km, kmCalcolati: false, salita: null, discesa: null, durataMin: null, durataStimata: false };
  }
  // traccia incompleta (salti oltre 500 m): non si usa per i numeri, valgono quelli della fonte
  const incompleta = tracciaDaNonUsare(s, traccia);
  const grezzo = traccia?.geojson && !incompleta.incompleta ? percorsoSentiero(traccia.geojson) : null;
  const percorso = grezzo && versoDi(s) ? invertiPercorso(grezzo) : grezzo;
  const daTraccia = percorso?.pezzi.length
    ? { km: lunghezzaKm({ coordinates: percorso.pezzi }), disl: dislivello(percorso.pezzi) }
    : null;

  // dove la traccia è continua i numeri vengono da lì; il valore della fonte resta solo in `fonte`
  const km = daTraccia?.km ?? (Number.isFinite(s.lunghezzaKm) ? s.lunghezzaKm : null);
  // quote: della traccia (GPX con quote) oppure dal profilo calcolato con il modello del terreno
  const profilo = incompleta.incompleta ? null : quoteDellaTraccia(s, traccia);
  const dislTraccia = daTraccia?.disl ?? (profilo ? { salita: profilo.salita, discesa: profilo.discesa } : null);
  const salita = dislTraccia?.salita ?? (Number.isFinite(s.dislivelloM) ? s.dislivelloM : null);
  const disl = dislTraccia ?? (salita != null ? { salita, discesa: 0 } : null);
  // durata: dalla traccia si stima; senza traccia valgono la durata della fonte o la stima sui km
  // il tempo dichiarato dalla fonte si adatta al ritmo scelto (stessa maggiorazione dei tempi CAI)
  const dallaFonte = !daTraccia && Number.isFinite(s.durataMin);
  let durataMin = dallaFonte ? Math.round(s.durataMin * fattoreRitmo()) : null;
  let durataStimata = false;
  if (durataMin == null && km != null) {
    durataMin = stimaDurataMin(km, disl);
    durataStimata = true;
  }
  return {
    km,
    kmCalcolati: Boolean(daTraccia),
    salita,
    discesa: dislTraccia?.discesa ?? null,
    durataMin,
    durataStimata,
    durataDallaFonte: dallaFonte,
    durataAdattata: dallaFonte && fattoreRitmo() !== 1,
    incompleta: incompleta.incompleta ? incompleta : null,
    fonte: { km: s.lunghezzaKm ?? null, salita: s.dislivelloM ?? null, durataMin: s.durataMin ?? null },
  };
}
