// Notte sì o no: dato il tempo a disposizione (es. sabato 14:00 → domenica 18:00) si mettono a confronto due
// piani, con i fatti e senza punteggio: tutto in giornata, oppure una notte in un rifugio o bivacco vicino al
// punto che interessa (di solito il tratto con più fauna) per esserci all'alba. Solo calcoli sul telefono.
import { minutiAlKm, ANTICIPO_ALBA_MIN } from './fotografia.js';

const arrotonda5 = (m) => Math.floor(m / 5) * 5;

// Minuti di [da, a] in cui è buio (fuori dal crepuscolo civile). Il tempo è in minuti dalla mezzanotte del
// giorno 0; giorni[i] = { albaCivile, tramontoCivile } del giorno i (in minuti da quella mezzanotte locale).
export function minutiAlBuio(da, a, giorni) {
  const notti = [[-Infinity, giorni[0]?.albaCivile ?? -Infinity]];
  giorni.forEach((g, i) => {
    if (g.tramontoCivile == null) return;
    const prossima = giorni[i + 1]?.albaCivile;
    notti.push([g.tramontoCivile + 1440 * i, prossima == null ? Infinity : prossima + 1440 * (i + 1)]);
  });
  return Math.round(notti.reduce((tot, [x, y]) => tot + Math.max(0, Math.min(a, y) - Math.max(da, x)), 0));
}

// "di giorno", "al crepuscolo" o "di notte" a quell'ora (minuti dalla mezzanotte del giorno 0)
export function luceAlle(min, giorni) {
  const giorno = Math.max(0, Math.min(giorni.length - 1, Math.floor(min / 1440)));
  const g = giorni[giorno];
  const m = min - giorno * 1440;
  if (g.alba == null || g.tramonto == null) return 'di giorno';
  if (m >= g.alba && m <= g.tramonto) return 'di giorno';
  if (m >= (g.albaCivile ?? g.alba) && m <= (g.tramontoCivile ?? g.tramonto)) return 'al crepuscolo';
  return 'di notte';
}

// kmTarget: dove si vuole essere; serieAndata/serieRitorno: profiloTempi; giorni: luci dei giorni, a partire da
// quello della partenza (almeno due); inizioMin/fineMin: partenza e ora massima di rientro (minuti dalla
// mezzanotte del giorno 0); rifugio: { nome, tipo, km, ... } o null; acquaA / acquaB: punti acqua (conteggi)
export function confrontoGiornoNotte({ kmTarget, kmTotale, anello = false, serieAndata, serieRitorno = null, inizioMin, fineMin, giorni, rifugio = null, acquaA = 0, acquaB = 0 }) {
  const totale = serieAndata.min.at(-1);
  const tA = minutiAlKm(serieAndata, kmTarget);
  // dal punto all'arrivo: anello = il resto del giro; altrimenti il ritorno sulla stessa traccia
  const tRit = anello ? totale - tA : serieRitorno ? serieRitorno.min.at(-1) - minutiAlKm(serieRitorno, kmTotale - kmTarget) : tA;
  const disponibileMin = fineMin - inizioMin;

  // --- piano A: tutto in giornata
  const arrivoA = inizioMin + tA;
  const fineA = arrivoA + tRit;
  const buioA = minutiAlBuio(inizioMin, fineA, giorni);
  const a = {
    km: anello ? kmTotale : 2 * kmTarget,
    camminoMin: Math.round(tA + tRit),
    arrivoMin: Math.round(arrivoA),
    luceArrivo: luceAlle(arrivoA, giorni),
    fineMin: Math.round(fineA),
    buioMin: buioA,
    nelTempo: fineA <= fineMin,
    acqua: acquaA,
  };

  // --- piano B: una notte in un rifugio o bivacco vicino
  let b = null;
  if (rifugio) {
    const kmR = rifugio.km;
    const tRif = minutiAlKm(serieAndata, kmR);
    const arrivoRif = inizioMin + tRif;
    const dalRifugio = anello
      ? (tA - tRif + totale) % totale
      : kmTarget >= kmR
        ? tA - tRif
        : minutiAlKm(serieRitorno ?? serieAndata, kmTotale - kmTarget) - minutiAlKm(serieRitorno ?? serieAndata, kmTotale - kmR);
    const alba2 = giorni[1]?.alba;
    const arrivoTratto = alba2 == null ? null : 1440 + alba2 - ANTICIPO_ALBA_MIN;
    const partenzaRif = arrivoTratto == null ? null : arrotonda5(arrivoTratto - dalRifugio);
    const oroFine = giorni[1]?.oroMattinaFine == null ? arrivoTratto : 1440 + giorni[1].oroMattinaFine;
    const riparti = arrivoTratto == null ? null : Math.max(arrivoTratto, oroFine);
    const fineB = riparti == null ? null : riparti + tRit;
    b = {
      rifugio,
      giorno1: { km: kmR, camminoMin: Math.round(tRif), arrivoMin: Math.round(arrivoRif), luceArrivo: luceAlle(arrivoRif, giorni), buioMin: minutiAlBuio(inizioMin, arrivoRif, giorni) },
      giorno2: {
        km: anello ? Math.max(0, kmTotale - kmR) : Math.abs(kmR - kmTarget) + kmTarget,
        partenzaMin: partenzaRif,
        arrivoTrattoMin: arrivoTratto == null ? null : Math.round(arrivoTratto),
        fineMin: fineB == null ? null : Math.round(fineB),
        buioMin: partenzaRif == null ? 0 : minutiAlBuio(partenzaRif, arrivoTratto, giorni),
      },
      riposoMin: partenzaRif == null ? null : Math.round(partenzaRif - arrivoRif),
      nelTempo: fineB != null && fineB <= fineMin,
      acqua: acquaB,
    };
    b.buioMin = b.giorno1.buioMin + b.giorno2.buioMin;
  }
  return { disponibileMin, a, b };
}
