// Motore di filtraggio unico: gli stessi filtri aggiornano elenco, mappa e conteggi.
import { filtraSentieri, ordinaSentieri } from './filtri.js';
import { misureSentiero } from './riassunto.js';
import { valutaCompatibilita, visibileInModalita } from './compatibilita.js';

// Intervalli dei filtri numerici
export const INTERVALLI = {
  distanza: { titolo: 'Distanza', unita: 'km', voci: [['0-5', 'Fino a 5 km'], ['5-10', '5–10 km'], ['10-15', '10–15 km'], ['15-', 'Oltre 15 km']] },
  dislivello: { titolo: 'Dislivello', unita: 'm', voci: [['0-300', 'Fino a 300 m'], ['300-700', '300–700 m'], ['700-1200', '700–1200 m'], ['1200-', 'Oltre 1200 m']] },
  durata: { titolo: 'Durata', unita: 'min', voci: [['0-120', 'Fino a 2 h'], ['120-240', '2–4 h'], ['240-360', '4–6 h'], ['360-', 'Oltre 6 h']] },
};

export function nelIntervallo(valore, intervallo) {
  if (!intervallo) return true;
  if (valore == null) return false; // valore non noto: escluso quando si filtra per quel valore
  const [da, a] = intervallo.split('-').map((x) => (x === '' ? null : Number(x)));
  return valore >= (da ?? -Infinity) && (a == null || valore < a);
}

// Prepara una volta sola misure e compatibilità di ogni percorso
export function preparaPercorsi(sentieri, tracce) {
  return sentieri.map((s) => {
    const traccia = tracce.get(s.id) ?? null;
    return { sentiero: s, traccia, misure: misureSentiero(s, traccia), compat: valutaCompatibilita(s, traccia) };
  });
}

// filtri: quelli dei sentieri + distanza/dislivello/durata; attivita: trekking | mtb | emtb
export function filtraPercorsi(preparati, filtri, attivita = 'trekking') {
  const ammessi = new Set(filtraSentieri(preparati.map((p) => p.sentiero), filtri).map((s) => s.id));
  const risultato = preparati.filter(
    (p) =>
      ammessi.has(p.sentiero.id) &&
      nelIntervallo(p.misure.km, filtri.distanza) &&
      nelIntervallo(p.misure.salita, filtri.dislivello) &&
      nelIntervallo(p.misure.durataMin, filtri.durata) &&
      visibileInModalita(p.compat, attivita) &&
      // in bici di base: itinerari per bici e percorsi percorribili; i sentieri a piedi
      // "da verificare" solo se richiesto ("Anche i sentieri da verificare")
      (attivita === 'trekking' ||
        filtri.soloBici === 'tutti' ||
        p.sentiero.tipoPercorso === 'itinerario_mtb' ||
        ['percorribile', 'con_limitazioni'].includes(p.compat[attivita]?.stato)) &&
      // gli itinerari per bici compaiono solo nelle modalità MTB ed e-MTB
      !(attivita === 'trekking' && p.sentiero.tipoPercorso === 'itinerario_mtb'),
  );
  const ordine = new Map(ordinaSentieri(risultato.map((p) => p.sentiero)).map((s, i) => [s.id, i]));
  return risultato.sort((a, b) => ordine.get(a.sentiero.id) - ordine.get(b.sentiero.id));
}
