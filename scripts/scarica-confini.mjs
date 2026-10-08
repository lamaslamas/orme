// Scarica i confini dei parchi da OpenStreetMap in public/dati/confini.json, così l'app
// non dipende da Overpass (spesso sovraccarico) per mostrarli. Si lancia a mano quando
// si aggiunge un parco: node scripts/scarica-confini.mjs
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { PARCHI } from '../src/datiParchi.js';
import { queryConfine, anelliDaRelazione } from '../src/lib/confini.js';
import { interrogaOverpass } from '../src/lib/overpass.js';

const FILE = 'public/dati/confini.json';
const AGENTE = 'Orme/0.6 (https://lamaslamas.github.io/orme/)';
const fetchFn = (url, o) => fetch(url, { ...o, headers: { ...o.headers, 'User-Agent': AGENTE } });
const confini = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).confini : {};
for (const p of PARCHI) {
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const anelli = anelliDaRelazione(await interrogaOverpass(queryConfine(p.osm), { fetchFn, timeoutMs: 120_000 }));
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
