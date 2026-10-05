// Giro combinato: più sentieri in fila, ciascuno eventualmente al contrario.
// Le misure non vengono salvate: si ricalcolano sempre dalle tracce attuali.
import { unisciTappe } from './tracce.js';
import { lunghezzaKm } from './geo.js';
import { dislivello } from './quote.js';
import { stimaDurataMin } from './durata.js';
import { codici as codiciSentiero } from './formato.js';

export function completaGiro(g) {
  return {
    nome: '',
    tappe: [],
    notePersonali: '',
    stato: 'da_fare',
    dataPercorso: null,
    ...g,
    tappe: (g.tappe ?? [])
      .filter((t) => t && typeof t.sentieroId === 'string')
      .map((t) => ({ sentieroId: t.sentieroId, alContrario: Boolean(t.alContrario) })),
  };
}

export function controllaGiro(g) {
  if (!(g.nome ?? '').trim()) throw new Error('Il nome del giro è obbligatorio.');
  if ((g.tappe ?? []).length < 2) throw new Error('Un giro deve avere almeno due sentieri.');
}

export function etichettaSentiero(s) {
  if (!s) return 'sentiero mancante';
  return s.codici?.length ? `${codiciSentiero(s)} ${s.nome}` : s.nome;
}

// sentieri e tracce: Map id -> oggetto
export function calcolaGiro(giro, sentieri, tracce) {
  const tappe = giro.tappe.map((t) => {
    const sentiero = sentieri.get(t.sentieroId) ?? null;
    const traccia = tracce.get(t.sentieroId) ?? null;
    return {
      ...t,
      sentiero,
      etichetta: etichettaSentiero(sentiero),
      mancante: !sentiero,
      senzaTraccia: Boolean(sentiero) && !traccia?.geojson?.coordinates?.length,
      geojson: traccia?.geojson ?? null,
    };
  });

  const { pezzi, salti } = unisciTappe(tappe);
  const linee = pezzi.map((p) => p.linea);
  const geojson = { type: 'MultiLineString', coordinates: linee };
  const km = lunghezzaKm(geojson);
  const disl = dislivello(linee);
  const tappeSenzaQuote = disl
    ? []
    : tappe.filter((t, i) => pezzi.some((p) => p.tappa === i && !p.linea.every((x) => Number.isFinite(x[2])))).map((t) => t.etichetta);

  return {
    tappe,
    pezzi,
    geojson,
    lunghezzaKm: km,
    dislivello: disl,
    tappeSenzaQuote: [...new Set(tappeSenzaQuote)],
    durataMin: pezzi.length ? stimaDurataMin(km, disl) : null,
    salti,
    problemi: tappe.filter((t) => t.mancante || t.senzaTraccia),
  };
}

// Per la scheda di un sentiero: i giri che lo contengono
export function giriConSentiero(giri, sentieroId) {
  return giri.filter((g) => g.tappe.some((t) => t.sentieroId === sentieroId));
}
