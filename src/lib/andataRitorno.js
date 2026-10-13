// Andata, ritorno e totale A/R di un percorso non ad anello, con i tempi CAI calcolati nei due sensi
// (al ritorno salita e discesa si scambiano), e gli orari di una giornata: arrivo, rientro e ultima
// partenza per rientrare con la luce.
import { stimaDurataMin } from './durata.js';
import { distanzaKm } from './geo.js';
import { durata as testoDurata } from './formato.js';

export const ANELLO_M = 300; // partenza e arrivo più vicini di così: è un anello
export const MARGINE_LUCE_MIN = 30; // si rientra almeno mezz'ora prima del tramonto
export const MODI = { andata: 'Solo andata', ar: 'Andata e ritorno' };

// pezzi [[lon, lat, quota?], …]: partenza e arrivo vicini?
export function eAnelloPezzi(pezzi) {
  const primo = pezzi?.[0]?.[0];
  const ultimo = pezzi?.at(-1)?.at(-1);
  if (!primo || !ultimo) return false;
  return distanzaKm(primo, ultimo) * 1000 <= ANELLO_M;
}

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
  const diverso = (a, b, assoluto, relativo) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > Math.max(assoluto, relativo * b);
  if (diverso(fonte.km, calcolate.km, 0.2, 0.1)) parti.push(`${fonte.km.toFixed(1).replace('.', ',')} km`);
  if (diverso(fonte.salita, calcolate.salita, 50, 0.15)) parti.push(`+${Math.round(fonte.salita)} m`);
  if (diverso(fonte.durataMin, calcolate.durataMin, 15, 0.15)) parti.push(testoDurata(fonte.durataMin));
  return parti.length ? `Indicato dalla fonte: ${parti.join(' · ')}` : '';
}
