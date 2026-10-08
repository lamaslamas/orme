// Scarica da OpenStreetMap le tracce dei sentieri iniziali e le salva in
// src/tracceIniziali.json (dati © OpenStreetMap contributors, ODbL).
// Uso: node scripts/scarica-tracce-iniziali.mjs
import { writeFileSync } from 'node:fs';
import { cercaSuOsm, combinaTraccia } from '../src/lib/overpass.js';
import { semplifica } from '../src/lib/confini.js';

// sentiero iniziale → codici da cercare
const DA_CERCARE = {
  'f10-pianezza': ['F10'],
  'f2-val-fondillo': ['F2'],
  'f1-monte-amaro': ['F1'],
  'i1-k6-val-di-rose-jannanghera': ['I1', 'K6'],
  'l1-m1-n1-monte-meta': ['L1', 'M1', 'N1'],
  't2-u1-morrone-del-diavolo': ['T2', 'U1'],
  'b5-b4-monte-tranquillo': ['B5', 'B4'],
};

const arrotonda = (n) => Math.round(n * 1e6) / 1e6;
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// Overpass a volte è sovraccarico: identificazione dello script e qualche tentativo
async function fetchPaziente(url, opzioni) {
  for (let i = 0; i < 4; i++) {
    const risposta = await fetch(url, { ...opzioni, headers: { ...opzioni.headers, 'User-Agent': 'Orme/0.4 (app personale)' } });
    if (risposta.ok || ![429, 502, 503, 504].includes(risposta.status)) return risposta;
    await attendi(15000 * (i + 1));
  }
  return fetch(url, opzioni);
}
const risultato = [];
for (const [sentieroId, codici] of Object.entries(DA_CERCARE)) {
  const gruppi = await cercaSuOsm(codici, { parco: 'pnalm', timeoutMs: 120000, fetchFn: fetchPaziente });
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
  // ~2 m di tolleranza: forma invariata, file molto più leggero
  traccia.geojson.coordinates = traccia.geojson.coordinates.map((l) => semplifica(l, 0.00002).map(([x, y]) => [arrotonda(x), arrotonda(y)]));
  traccia.dettagli = { ...traccia.dettagli, mancanti, iniziale: true, daVerificare: true };
  risultato.push({ sentieroId, ...traccia });
  console.log(sentieroId, '→', scelti.map((c) => c.codice).join('+'), mancanti.length ? `(mancano ${mancanti.join(', ')})` : '');
}
writeFileSync('src/tracceIniziali.json', JSON.stringify(risultato));
console.log('salvate', risultato.length, 'tracce');
