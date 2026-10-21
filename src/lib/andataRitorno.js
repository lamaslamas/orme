// Andata, ritorno e totale A/R di un percorso non ad anello, con i tempi CAI calcolati nei due sensi
// (al ritorno salita e discesa si scambiano), e gli orari di una giornata: arrivo, rientro e ultima
// partenza per rientrare con la luce.
import { fattoreRitmo } from './ritmo.js';
import { stimaDurataMin } from './durata.js';
import { distanzaKm, lunghezzaKm } from './geo.js';
import { dislivello } from './quote.js';
import { durata as testoDurata } from './formato.js';

// Un anello: la relazione OSM dice roundtrip=yes, oppure partenza e arrivo distano meno di 1 km o meno del 5%
// della lunghezza (ma mai più di un quarto: un percorso corto a U non è un anello)
export const ANELLO_M = 1000;
export const ANELLO_QUOTA = 0.05;
export const ANELLO_QUOTA_MAX = 0.25;
const TOLLERANZA_ESTREMI_M = 30; // due estremi di tratti più vicini di così sono lo stesso punto
export const MARGINE_LUCE_MIN = 30; // si rientra almeno mezz'ora prima del tramonto
export const MODI = { andata: 'Solo andata', ar: 'Andata e ritorno' };

// Gli estremi di un percorso fatto di più tratti (le relazioni OSM hanno i tratti in ordine e verso a caso):
// quelli che non coincidono con l'estremo di un altro tratto. Zero = si chiude da solo; due = partenza e
// arrivo; altrimenti (tratti staccati) il primo e l'ultimo punto.
export function estremiLiberi(pezzi, tolleranzaM = TOLLERANZA_ESTREMI_M) {
  const estremi = pezzi.flatMap((l, i) => (l.length ? [{ i, p: l[0] }, { i, p: l.at(-1) }] : []));
  return estremi.filter((e, k) => !estremi.some((x, j) => j !== k && distanzaKm(e.p, x.p) * 1000 <= tolleranzaM)).map((e) => e.p);
}

// pezzi [[lon, lat, quota?], …]; roundtrip: la relazione OSM dice roundtrip=yes.
// → { anello, roundtripAperto }: roundtripAperto = OSM lo dà come anello ma la traccia non si chiude (partenza e
// arrivo a più di un quarto della lunghezza): allora è lineare, con la nota in piccolo nella scheda
export function statoAnello(pezzi, { roundtrip = false } = {}) {
  const linee = (pezzi ?? []).filter((l) => l?.length);
  if (!linee.length) return { anello: false, roundtripAperto: false };
  const liberi = estremiLiberi(linee);
  if (!liberi.length) return { anello: true, roundtripAperto: false }; // i tratti si chiudono tra loro: nessun estremo libero
  const [a, b] = liberi.length === 2 ? liberi : [linee[0][0], linee.at(-1).at(-1)];
  const lunghezza = lunghezzaKm({ type: 'MultiLineString', coordinates: linee });
  const d = distanzaKm(a, b);
  const sichiude = d < lunghezza * ANELLO_QUOTA_MAX;
  if (roundtrip) return { anello: sichiude, roundtripAperto: !sichiude };
  return { anello: sichiude && (d < ANELLO_M / 1000 || d < lunghezza * ANELLO_QUOTA), roundtripAperto: false };
}
export const eAnelloPezzi = (pezzi, opzioni) => statoAnello(pezzi, opzioni).anello;

// misure di un senso: km, salita, discesa e durata CAI (salita e discesa null se non ci sono le quote)
function senso(km, salita, discesa) {
  const conQuote = Number.isFinite(salita) && Number.isFinite(discesa);
  return { km, salita: conQuote ? salita : null, discesa: conQuote ? discesa : null, durataMin: stimaDurataMin(km, conQuote ? { salita, discesa } : null) };
}

// base: { km, salita, discesa } dell'andata. Restituisce { andata, ritorno, totale, anello }
// (ritorno e totale null per gli anelli)
export function misureAR(base, { anello = false } = {}) {
  const andata = senso(base.km, base.salita, base.discesa);
  if (anello || !Number.isFinite(base.km)) return { andata, ritorno: null, totale: null, anello };
  const ritorno = senso(base.km, base.discesa, base.salita);
  const somma = (k) => (andata[k] == null || ritorno[k] == null ? null : andata[k] + ritorno[k]);
  return {
    andata,
    ritorno,
    totale: { km: Math.round(andata.km * 2 * 10) / 10, salita: somma('salita'), discesa: somma('discesa'), durataMin: somma('durataMin') },
    anello,
  };
}

// le misure da mostrare in alto secondo la scelta (gli anelli sono sempre "il giro")
export const misureScelte = (ar, modo) => (modo === 'ar' && ar.totale ? ar.totale : ar.andata);

// i pezzi del percorso intero: con A/R, dopo l'andata la stessa traccia al contrario
export function pezziScelti(pezzi, modo, anello = eAnelloPezzi(pezzi)) {
  if (modo !== 'ar' || anello) return pezzi;
  return [...pezzi, ...[...pezzi].reverse().map((p) => [...p].reverse())];
}

// Orari di una giornata (minuti dalla mezzanotte): arrivo al punto più lontano, rientro e ultima
// partenza per rientrare MARGINE_LUCE_MIN prima del tramonto. ritornoMin null = solo andata o anello
export function orariGiornata({ partenzaMin, andataMin, ritornoMin = null, tramontoMin = null }) {
  const arrivoMin = partenzaMin + andataMin;
  const fineMin = arrivoMin + (ritornoMin ?? 0);
  const ultimaPartenzaMin = tramontoMin == null ? null : tramontoMin - MARGINE_LUCE_MIN - andataMin - (ritornoMin ?? 0);
  return { arrivoMin, rientroMin: ritornoMin == null ? null : fineMin, fineMin, ultimaPartenzaMin, tardi: ultimaPartenzaMin != null && partenzaMin > ultimaPartenzaMin };
}

export const oraDaMinuti = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const minutiDaOra = (ora) => {
  const [h, m] = String(ora ?? '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

// "Indicato dalla fonte: 6,0 km · +450 m · 3 h": solo i dati della fonte diversi dal calcolo
export function notaFonte(fonte, calcolate) {
  const parti = [];
  const f = fattoreRitmo();
  const diverso = (a, b, assoluto, relativo) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > Math.max(assoluto, relativo * b);
  if (diverso(fonte.km, calcolate.km, 0.2, 0.1)) parti.push(`${fonte.km.toFixed(1).replace('.', ',')} km`);
  if (diverso(fonte.salita, calcolate.salita, 50, 0.15)) parti.push(`+${Math.round(fonte.salita)} m`);
  // il tempo della fonte si adatta al ritmo scelto (con soste o fotografico), come i tempi CAI
  const durataFonte = Number.isFinite(fonte.durataMin) ? Math.round(fonte.durataMin * f) : null;
  if (diverso(durataFonte, calcolate.durataMin, 15, 0.15)) parti.push(testoDurata(durataFonte));
  const adattato = f !== 1 && durataFonte != null && parti.some((p) => p === testoDurata(durataFonte));
  return parti.length ? `Indicato dalla fonte${adattato ? ', adattato al ritmo' : ''}: ${parti.join(' · ')}` : '';
}

// Con A/R una giornata può finire sul ritorno: per cercare i rifugi si usa il punto equivalente
// sull'andata (stessa traccia), cioè il km 2L − km
export const fineSullAndata = (fine, kmAndata) => (fine.km > kmAndata ? { ...fine, km: Math.max(0, 2 * kmAndata - fine.km) } : fine);

// Base dell'andata: km dalla traccia; salita e discesa dalle quote della traccia o, se non le ha, dal
// profilo calcolato con il modello del terreno (TINITALY). null senza traccia o senza quote: lì la
// scheda tiene i dati della fonte
export function baseAndata(pezzi, profilo = null) {
  if (!pezzi?.length) return null;
  const disl = dislivello(pezzi) ?? (Number.isFinite(profilo?.salita) && Number.isFinite(profilo?.discesa) ? { salita: profilo.salita, discesa: profilo.discesa } : null);
  if (!disl) return null;
  return { km: Math.round(lunghezzaKm({ type: 'MultiLineString', coordinates: pezzi }) * 10) / 10, salita: Math.round(disl.salita), discesa: Math.round(disl.discesa) };
}

// La traccia è molto più lunga o più corta (oltre il 40%) del percorso descritto dalla fonte: forse
// comprende altri tratti (es. tutto il sentiero F2 invece del tratto fino alla sorgente) o ne manca
export const DIFFERENZA_TRACCIA = 0.4;
export function tracciaDiversa(fonteKm, tracciaKm) {
  if (!Number.isFinite(fonteKm) || !Number.isFinite(tracciaKm) || fonteKm <= 0) return false;
  return Math.abs(tracciaKm - fonteKm) / fonteKm > DIFFERENZA_TRACCIA;
}
