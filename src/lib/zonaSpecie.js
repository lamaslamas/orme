// La zona di «Più segnalate qui» quando non c'è una mappa da inquadrare («Dove vado domani?»): quella di «Quanto lontano».
// Un parco scelto → il suo riquadro; un tempo (30 min, 1 h, 2 h) → l'area raggiungibile da me in quel tempo; nessuna scelta → 50 km.
// Il titolo la dice: «Più segnalate nel Parco dell'Appennino Lucano», «Più segnalate entro 1 h da te».
import { FATTORE_STRADE, DISTANZE } from './suggerimenti.js';

export const RAGGIO_MAX_ZONA_KM = 50; // oltre, le segnalazioni da scaricare sarebbero troppe
const PREPOSIZIONE_PARCO = (nome) => String(nome).replace(/^Parco Nazionale /, 'Parco ');

// minuti di auto → raggio in linea d'aria (km): il contrario di stimaAuto, che conta 5 minuti per partire
export const raggioDaMinuti = (minuti) => Math.max(5, Math.min(RAGGIO_MAX_ZONA_KM, Math.round((minuti - 5) / FATTORE_STRADE)));

// scelte: { distanza, parco }; parco: il parco della scelta (con nome e riquadro) o null; centro: [lon, lat] mio o della mappa
// → { tipo: 'parco' | 'tempo', riquadro | raggioKm + centro, etichetta, chiave } oppure null se manca il centro
export function zonaDaScelte({ distanza, parco = null }, { parcoScelto = null, centro = null, daMe = true } = {}) {
  if (distanza === 'parco' && parcoScelto?.bbox) {
    return { tipo: 'parco', riquadro: parcoScelto.bbox, etichetta: `nel ${PREPOSIZIONE_PARCO(parcoScelto.nome)}`, chiave: `parco:${parcoScelto.id ?? parco}` };
  }
  if (!centro) return null;
  const minuti = Number(distanza);
  const chi = daMe ? 'da te' : 'dalla zona che guardavi';
  const raggioKm = minuti > 0 ? raggioDaMinuti(minuti) : RAGGIO_MAX_ZONA_KM;
  const durata = minuti > 0 ? `entro ${DISTANZE[distanza] ?? `${minuti} min`}` : `entro ${RAGGIO_MAX_ZONA_KM} km`;
  return { tipo: 'tempo', centro, raggioKm, etichetta: `${durata} ${chi}`, chiave: `tempo:${centro.map((x) => x.toFixed(2))}|${raggioKm}` };
}
