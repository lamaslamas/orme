// Confine nazionale dell'Italia da OpenStreetMap (relazione 365331, con le acque territoriali e con
// San Marino e Vaticano come buchi) in scripts/dati/confine-italia.json: serve al robot dei punti
// per scartare quello che cade fuori dall'Italia. Si lancia a mano, raramente:
//   node scripts/scarica-confine-italia.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { interrogaOverpass } from '../src/lib/overpass.js';
import { anelliDaRelazione } from '../src/lib/confini.js';

const FILE = 'scripts/dati/confine-italia.json';
const AGENTE = 'Orme/0.6 (https://lamaslamas.github.io/orme/)';
const fetchFn = (url, o) => fetch(url, { ...o, headers: { ...o.headers, 'User-Agent': AGENTE } });

const json = await interrogaOverpass('[out:json][timeout:240];rel(365331);out geom;', { fetchFn, timeoutMs: 300_000 });
// tolleranza 0,0001° (circa 10 m): i punti a ridosso del confine restano dalla parte giusta
const anelli = anelliDaRelazione(json, 0.0001, ['outer', '', 'inner']);
if (anelli.length < 2 || anelli.some((a) => String(a[0]) !== String(a.at(-1)))) throw new Error('confine incompleto, riprova');
const arrotonda = (x) => Math.round(x * 1e5) / 1e5;
mkdirSync('scripts/dati', { recursive: true });
writeFileSync(FILE, JSON.stringify({ fonte: '© OpenStreetMap (ODbL)', scaricato: new Date().toISOString().slice(0, 10), anelli: anelli.map((a) => a.map(([lon, lat]) => [arrotonda(lon), arrotonda(lat)])) }));
console.log(`${anelli.length} anelli, ${anelli.reduce((s, a) => s + a.length, 0)} vertici`);
process.exit(0);
