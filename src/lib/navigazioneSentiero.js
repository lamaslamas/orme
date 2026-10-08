// "Naviga" lungo il sentiero: dove sono sul percorso, quanto ho fatto, quanto manca.
// Funziona anche su andata e ritorno o anelli: la posizione si cerca prima vicino
// all'ultimo punto noto, così al ritorno non si "salta" all'andata.
// I salti in linea d'aria tra pezzi non collegati della traccia non contano nella distanza.
import { percorsoSentiero } from './tracce.js';
import { progressivi, puntoSullaLinea } from './misure.js';
import { dislivello } from './quote.js';
import { stimaDurataMin } from './durata.js';

// oltre questa distanza dalla traccia si è "fuori traccia" (il GPS sbaglia di qualche metro)
export const SOGLIA_FUORI_M = 50;
// finestra di ricerca attorno all'ultima posizione nota (indietro e avanti)
const INDIETRO_M = 300;
const AVANTI_M = 2000;
// se nella finestra la traccia è più lontana di così, si cerca su tutto il percorso
const SOGLIA_RIAGGANCIO_M = 80;

export function preparaNavigazione(geojson) {
  const { pezzi } = percorsoSentiero(geojson);
  let inizio = 0;
  const parti = [];
  for (const linea of pezzi) {
    if (linea.length < 2) continue;
    const prog = progressivi(linea).map((d) => d + inizio);
    parti.push({ linea, prog });
    inizio = prog.at(-1);
  }
  return parti.length ? { parti, totaleM: inizio } : null;
}

// Aggancio sul pezzo "parte", solo tra i metri daM e aM del percorso.
// Si parte dal primo vertice dentro la finestra: un tratto già percorso (es. l'andata) non entra.
function aggancioNellaParte({ linea, prog }, punto, daM, aM) {
  if (prog.at(-1) < daM || prog[0] > aM) return null;
  const primo = prog.findIndex((d) => d >= daM);
  const i0 = Math.min(linea.length - 2, primo < 0 ? linea.length - 2 : primo);
  let i1 = prog.findIndex((d) => d > aM);
  if (i1 < 0) i1 = linea.length - 1;
  if (i1 - i0 < 1) return null;
  const a = puntoSullaLinea(linea.slice(i0, i1 + 1), punto, prog.slice(i0, i1 + 1));
  return a ? { ...a, linea, indice: a.indice + i0 } : null;
}

function aggancio(nav, punto, daM, aM) {
  let migliore = null;
  nav.parti.forEach((parte, n) => {
    const a = aggancioNellaParte(parte, punto, daM, aM);
    if (a && (!migliore || a.distanzaDallaLineaM < migliore.distanzaDallaLineaM)) migliore = { ...a, n };
  });
  return migliore;
}

// punto: [lon, lat]; precedenteM: metri percorsi all'aggiornamento precedente (o null)
export function posizioneSulPercorso(nav, punto, precedenteM = null) {
  let a = null;
  if (precedenteM != null) a = aggancio(nav, punto, precedenteM - INDIETRO_M, precedenteM + AVANTI_M);
  if (!a || a.distanzaDallaLineaM > SOGLIA_RIAGGANCIO_M) {
    const globale = aggancio(nav, punto, -Infinity, Infinity);
    if (!a || globale.distanzaDallaLineaM < a.distanzaDallaLineaM) a = globale;
  }
  const fattiM = a.daInizioM;
  const mancantiM = Math.max(0, nav.totaleM - fattiM);
  // il resto del percorso: questo pezzo dal punto in poi, più i pezzi successivi
  const successivi = nav.parti.slice(a.n + 1).map((p) => p.linea);
  const disl = dislivello([[a.punto, ...a.linea.slice(a.indice + 1)], ...successivi]);
  return {
    fattiM,
    mancantiM,
    distanzaDallaTracciaM: a.distanzaDallaLineaM,
    fuori: a.distanzaDallaLineaM > SOGLIA_FUORI_M,
    salitaRimanenteM: disl?.salita ?? null,
    durataRimanenteMin: mancantiM > 0 ? stimaDurataMin(mancantiM / 1000, disl) : 0,
    percento: nav.totaleM ? Math.round((100 * fattiM) / nav.totaleM) : 0,
    arrivato: mancantiM < 30,
  };
}
