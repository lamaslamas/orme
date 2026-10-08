// Scarica la distribuzione ufficiale (EEA, Direttiva Habitat Art. 17, 2013-2018) delle specie
// dei parchi in public/dati/distribuzione.json. Il rapporto cambia ogni sei anni: si lancia a mano.
//   node scripts/scarica-distribuzione.mjs
import { writeFileSync } from 'node:fs';
import { FONTE_ART17, CODICI_ART17, distribuzioneDaEsri } from '../src/lib/distribuzione.js';

const parametri = new URLSearchParams({
  where: `speciescode IN (${Object.values(CODICI_ART17).map((c) => `'${c}'`).join(',')}) AND country='IT'`,
  outFields: 'speciescode,region,maptype,conclusion_assessment_MS,conclusion_assessment_trend_MS',
  returnGeometry: 'true',
  outSR: '4326',
  maxAllowableOffset: '0.005', // circa 500 m: le celle sono di 10 km
  geometryPrecision: '4',
  f: 'json',
});
const risposta = await fetch(`${FONTE_ART17.servizio}/query?${parametri}`, {
  headers: { 'User-Agent': 'Orme/0.6 (https://lamaslamas.github.io/orme/)' },
  signal: AbortSignal.timeout(120_000),
});
if (!risposta.ok) throw new Error(`EEA: risposta ${risposta.status}`);
const json = await risposta.json();
if (json.error) throw new Error(`EEA: ${json.error.message}`);
const specie = distribuzioneDaEsri(json);
if (Object.keys(specie).length < 3) throw new Error('Dati EEA incompleti: file non aggiornato.');
const { servizio, ...fonte } = FONTE_ART17;
writeFileSync('public/dati/distribuzione.json', JSON.stringify({ fonte, scaricato: new Date().toISOString().slice(0, 10), specie }));
for (const [k, v] of Object.entries(specie)) console.log(k.padEnd(16), v.map((x) => `${x.regione}:${x.stato}`).join(' '));
