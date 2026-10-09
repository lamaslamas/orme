// Scarica i confini dei parchi da OpenStreetMap in public/dati/confini.json, così l'app
// non dipende da Overpass (spesso sovraccarico) per mostrarli. Si lancia a mano quando
// si aggiunge un parco: node scripts/scarica-confini.mjs
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { PARCHI } from '../src/datiParchi.js';
import { queryConfine, anelliDaRelazione, urlApiOsm, rispostaDaApiOsm } from '../src/lib/confini.js';
import { interrogaOverpass } from '../src/lib/overpass.js';

const FILE = 'public/dati/confini.json';
const AGENTE = 'Orme/0.6 (https://lamaslamas.github.io/orme/)';
const fetchFn = (url, o) => fetch(url, { ...o, headers: { ...o.headers, 'User-Agent': AGENTE } });
const confini = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).confini : {};
// solo i parchi senza confine salvato (con --tutti si riscaricano tutti)
const tutti = process.argv.includes('--tutti');
for (const p of PARCHI) {
  if (!tutti && confini[p.id]?.length) continue;
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      // prima Overpass; se è sovraccarico, l'API principale di OSM (un solo oggetto, uso leggero)
      const json =
        tentativo < 3
          ? await interrogaOverpass(queryConfine(p.osm), { fetchFn, timeoutMs: 120_000 })
          : rispostaDaApiOsm(await (await fetchFn(urlApiOsm(p.osm), { headers: {} })).json());
      const anelli = anelliDaRelazione(json);
      if (!anelli.length) throw new Error('confine vuoto');
      confini[p.id] = anelli.map((a) => a.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]));
      console.log(`${p.id}: ${anelli.length} anelli, ${anelli.reduce((s, a) => s + a.length, 0)} punti`);
      break;
    } catch (e) {
      console.warn(`${p.id}: tentativo ${tentativo} fallito (${e.message})`);
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
}
writeFileSync(FILE, JSON.stringify({ fonte: '© OpenStreetMap (ODbL)', scaricato: new Date().toISOString().slice(0, 10), confini }));
