// Motore di filtraggio unico: gli stessi filtri aggiornano elenco, mappa e conteggi.
import { filtraSentieri, ordinaSentieri } from './filtri.js';
import { misureSentiero } from './riassunto.js';
import { passaQuotaDislivello, passaLunghezza, kmPercorsi } from './quotaDislivello.js';
import { valutaCompatibilita, visibileInModalita } from './compatibilita.js';
import { fattoreRitmo } from './ritmo.js';
import { inPezzi } from './lavoro.js';

// Intervalli dei filtri numerici
export const INTERVALLI = {
  durata: { titolo: 'Durata', unita: 'min', voci: [['0-120', 'Fino a 2 h'], ['120-240', '2–4 h'], ['240-360', '4–6 h'], ['360-', 'Oltre 6 h']] },
};

export function nelIntervallo(valore, intervallo) {
  if (!intervallo) return true;
  if (valore == null) return false; // valore non noto: escluso quando si filtra per quel valore
  const [da, a] = intervallo.split('-').map((x) => (x === '' ? null : Number(x)));
  return valore >= (da ?? -Infinity) && (a == null || valore < a);
}

// Prepara una volta sola misure e compatibilità di ogni percorso
// Il calcolo (circa 200 ms con 800 percorsi) si ricorda per gli stessi elenchi di sentieri e tracce e lo stesso ritmo:
// mappa e Suggerisci lo condividono, e riaprire Suggerisci non lo rifà.
const preparatoDi = (s, tracce) => {
  const traccia = tracce.get(s.id) ?? null;
  return { sentiero: s, traccia, misure: misureSentiero(s, traccia), compat: valutaCompatibilita(s, traccia) };
};
let memoria = null; // { sentieri, tracce, ritmo, valore }
const ricorda = (sentieri, tracce, valore) => (memoria = { sentieri, tracce, ritmo: fattoreRitmo(), valore });
const ricordato = (sentieri, tracce) => (memoria && memoria.sentieri === sentieri && memoria.tracce === tracce && memoria.ritmo === fattoreRitmo() ? memoria.valore : null);

export function preparaPercorsi(sentieri, tracce) {
  return ricordato(sentieri, tracce) ?? ricorda(sentieri, tracce, sentieri.map((s) => preparatoDi(s, tracce))).valore;
}
// Lo stesso a pezzi piccoli (non blocca lo schermo); il risultato resta in memoria per preparaPercorsi
export async function preparaPercorsiInPezzi(sentieri, tracce) {
  const gia = ricordato(sentieri, tracce);
  if (gia) return gia;
  const valore = await inPezzi(sentieri, (s) => preparatoDi(s, tracce));
  ricorda(sentieri, tracce, valore);
  return valore;
}

// filtri: quelli dei sentieri + distanza/durata + quota e dislivello; attivita: trekking | mtb
// modo: 'ar' (andata e ritorno) o 'andata': conta per il filtro «Lunghezza» (km da percorrere davvero)
export function filtraPercorsi(preparati, filtri, attivita = 'trekking', modo = 'ar') {
  const ammessi = new Set(filtraSentieri(preparati.map((p) => p.sentiero), filtri).map((s) => s.id));
  const risultato = preparati.filter(
    (p) =>
      ammessi.has(p.sentiero.id) &&
      passaLunghezza(filtri, kmPercorsi(p.misure, modo)) &&
      passaQuotaDislivello(filtri, { quotaMax: p.misure.quotaMax, salita: p.misure.salita }) &&
      nelIntervallo(p.misure.durataMin, filtri.durata) &&
      visibileInModalita(p.compat, attivita) &&
      // in bici di base: itinerari per bici e percorsi percorribili; i sentieri a piedi
      // "da verificare" solo se richiesto ("Anche i sentieri da verificare")
      (attivita === 'trekking' ||
        filtri.soloBici === 'tutti' ||
        p.sentiero.tipoPercorso === 'itinerario_mtb' ||
        ['percorribile', 'con_limitazioni'].includes(p.compat[attivita]?.stato)) &&
      // gli itinerari per bici compaiono solo in modalità MTB
      !(attivita === 'trekking' && p.sentiero.tipoPercorso === 'itinerario_mtb'),
  );
  const ordine = new Map(ordinaSentieri(risultato.map((p) => p.sentiero)).map((s, i) => [s.id, i]));
  return risultato.sort((a, b) => ordine.get(a.sentiero.id) - ordine.get(b.sentiero.id));
}
