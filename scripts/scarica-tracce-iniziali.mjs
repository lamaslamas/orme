// Scarica da OpenStreetMap le tracce dei sentieri iniziali e le salva in
// src/tracceIniziali.json (dati © OpenStreetMap contributors, ODbL).
// Uso: node scripts/scarica-tracce-iniziali.mjs
import { writeFileSync } from 'node:fs';
import { cercaSuOsm, combinaTraccia, interrogaOverpass, queryGeometrie, interpretaRisposta } from '../src/lib/overpass.js';
import { semplifica } from '../src/lib/confini.js';
import { percorsoSentiero, tagliaLinea, inizioPercorso } from '../src/lib/tracce.js';

// sentiero iniziale → codici da cercare (il sentiero intero)
const DA_CERCARE = {
  'f10-pianezza': ['F10'],
  'f2-val-fondillo': ['F2'],
  'f1-monte-amaro': ['F1'],
  'i1-k6-val-di-rose-jannanghera': ['I1', 'K6'],
  'l1-m1-n1-monte-meta': ['L1', 'M1', 'N1'],
  't2-u1-morrone-del-diavolo': ['T2', 'U1'],
  'b5-b4-monte-tranquillo': ['C5', 'B4'],
  'camosciara-scerto': ['G5', 'G6'],
};

const FONTE_CAMOSCIARA = 'https://www.ecotur.org/en/excursions/Camosciara_-_Waterfalls.xhtml';
const FONTE_CICERANA = 'https://www.ecotur.org/en/excursions/Discovering_the_bear_%28bearwatching%29.xhtml';

const arrotonda = (n) => Math.round(n * 1e6) / 1e6;
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// Overpass a volte è sovraccarico: identificazione dello script e qualche tentativo
async function fetchPaziente(url, opzioni) {
  for (let i = 0; i < 5; i++) {
    try {
      const risposta = await fetch(url, { ...opzioni, headers: { ...opzioni.headers, 'User-Agent': 'Orme/0.5 (app personale)' } });
      if (risposta.ok || ![429, 502, 503, 504].includes(risposta.status)) return risposta;
    } catch {
      // errore di rete: si riprova
    }
    await attendi(15000 * (i + 1));
  }
  return fetch(url, opzioni);
}
const opzioni = { parco: 'pnalm', timeoutMs: 120000, fetchFn: fetchPaziente };

function leggera(geojson) {
  return {
    ...geojson,
    coordinates: geojson.coordinates.map((l) => semplifica(l, 0.00002).map(([x, y]) => [arrotonda(x), arrotonda(y)])),
  };
}

const risultato = [];
for (const [sentieroId, codici] of Object.entries(DA_CERCARE)) {
  const gruppi = await cercaSuOsm(codici, opzioni);
  await attendi(3000);
  const scelti = [];
  const mancanti = [];
  for (const c of codici) {
    if (gruppi[c].length === 1) scelti.push(gruppi[c][0]);
    else if (gruppi[c].length === 0) mancanti.push(c);
    else throw new Error(`${c}: più risultati, serve una scelta a mano`);
  }
  if (!scelti.length) {
    console.log(sentieroId, '→ nessuna traccia; mancano', mancanti.join(', '));
    continue;
  }
  const traccia = combinaTraccia(scelti);
  traccia.geojson = leggera(traccia.geojson);
  traccia.dettagli = { ...traccia.dettagli, mancanti, iniziale: true, daVerificare: true };
  if (sentieroId === 'camosciara-scerto') {
    traccia.dettagli.fonte = FONTE_CAMOSCIARA;
    traccia.dettagli.notaParziale =
      'Manca la strada pedonale chiusa al traffico che porta ai piedi della Camosciara (non è un sentiero con codice su OSM).';
  }
  risultato.push({ sentieroId, ...traccia });
  console.log(sentieroId, '→', scelti.map((c) => c.codice).join('+'), mancanti.length ? `(mancano ${mancanti.join(', ')})` : '');
}

// Cicerana, ricostruita dalla descrizione Ecotur (Passo del Diavolo → Rifugio della Cicerana):
// T1 dall'inizio fino al bivio con T5, poi T5 fino al punto più vicino al rifugio.
const RIFUGIO_CICERANA = [13.7173, 41.8643];
const [t1, t5] = interpretaRisposta(await interrogaOverpass(queryGeometrie([9727048, 14512487]), opzioni)).sort(
  (a, b) => (a.codice === 'T1' ? -1 : 1) - (b.codice === 'T1' ? -1 : 1),
);
const lineaT1 = percorsoSentiero({ coordinates: t1.linee }).pezzi[0];
const percorsoT5 = percorsoSentiero({ coordinates: t5.linee });
const tratto1 = tagliaLinea(lineaT1, { fino: inizioPercorso(percorsoT5) });
const tratto2 = tagliaLinea(percorsoT5.pezzi[0], { fino: RIFUGIO_CICERANA });
risultato.push({
  sentieroId: 'cicerana',
  origine: 'osm',
  geojson: leggera({ type: 'MultiLineString', coordinates: [tratto1, tratto2] }),
  dettagli: {
    relazioniOsm: [t1.idOsm, t5.idOsm],
    codici: ['T1', 'T5'],
    mancanti: [],
    iniziale: true,
    daVerificare: true,
    ricostruita: true,
    fonte: FONTE_CICERANA,
  },
});
console.log('cicerana → ricostruita da T1 + T5');

writeFileSync('src/tracceIniziali.json', JSON.stringify(risultato));
console.log('salvate', risultato.length, 'tracce');
