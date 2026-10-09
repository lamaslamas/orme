// "Da vedere" lungo ogni percorso: voci di Wikipedia entro 1 km e foto di Wikimedia Commons
// entro 300 m dalla traccia (solo licenze libere senza NC/ND), salvate nell'archivio (campo daVedere).
// Si ricalcola quando cambia la traccia o ogni 60 giorni. Al massimo 15 minuti per giro, salvando
// man mano: i percorsi rimasti si completano nei giorni successivi. A mano: node scripts/calcola-da-vedere.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { improntaTraccia } from '../src/lib/panorama.js';
import { lunghezzaKm } from '../src/lib/geo.js';
import {
  centriRicerca,
  urlLuoghiVicini,
  urlFotoVicine,
  urlInfoFoto,
  urlEstratti,
  sceltaLuoghi,
  candidateFoto,
  sceltaFoto,
  luogoConEstratto,
} from '../src/lib/daVedere.js';

const FILE = 'public/dati/archivio.json';
const AGENTE = 'Orme/0.6 (archivio personale di sentieri; https://lamaslamas.github.io/orme/)';
const RINNOVA_GIORNI = 60;
const FINE = Date.now() + (process.argv.includes('--senza-limite') ? 24 * 60 : 15) * 60_000;
const oggi = new Date().toISOString().slice(0, 10);
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(30_000) });
      if (r.status === 429) throw new Error('troppe richieste');
      if (!r.ok) throw new Error(`risposta ${r.status}`);
      await attendi(150); // con calma: Wikimedia è un servizio gratuito
      return await r.json();
    } catch (e) {
      if (tentativo === 3) throw e;
      await attendi(3000 * tentativo);
    }
  }
}

async function daVedere(g) {
  // poche ricerche larghe: una ogni 4 km con raggio 3 km copre tutta la fascia di 1 km dalla traccia
  const centri = centriRicerca(g, 4000);
  const risLuoghi = [];
  for (const c of centri) risLuoghi.push((await json(urlLuoghiVicini(c, 3000))).query?.geosearch ?? []);
  const scelti = sceltaLuoghi(risLuoghi, g);
  let luoghi = [];
  if (scelti.length) {
    const pagine = Object.values((await json(urlEstratti(scelti.map((l) => l.titolo)))).query?.pages ?? {});
    const perTitolo = new Map(pagine.map((p) => [p.title, p]));
    luoghi = scelti.map((l) => luogoConEstratto(l, perTitolo.get(l.titolo)));
  }
  const risFoto = [];
  for (const c of centri) risFoto.push((await json(urlFotoVicine(c, 3000))).query?.geosearch ?? []);
  const tratti = candidateFoto(risFoto, g, lunghezzaKm(g));
  const ids = tratti.flatMap((l) => l.slice(0, 3).map((f) => f.id)).slice(0, 50);
  let foto = [];
  if (ids.length) {
    const info = new Map(Object.values((await json(urlInfoFoto(ids))).query?.pages ?? {}).map((p) => [p.pageid, p]));
    foto = sceltaFoto(tratti, info);
  }
  return { luoghi, foto };
}

const archivio = JSON.parse(readFileSync(FILE, 'utf8'));
const salva = () => writeFileSync(FILE, JSON.stringify({ ...archivio, aggiornato: new Date().toISOString() }));
let fatti = 0;
for (const p of archivio.percorsi) {
  if (Date.now() > FINE) {
    console.log('Tempo finito per oggi: si riprende al prossimo giro');
    break;
  }
  const g = p.traccia?.geojson;
  if (!g?.coordinates?.length) continue;
  const geometria = improntaTraccia(g).split('-')[1];
  const d = p.daVedere;
  if (d?.impronta === geometria && (new Date(oggi) - new Date(d.calcolato)) / 86_400_000 < RINNOVA_GIORNI) continue;
  try {
    const r = await daVedere(g);
    p.daVedere = { ...r, calcolato: oggi, impronta: geometria };
    fatti++;
    console.log(`${r.luoghi.length} luoghi, ${r.foto.length} foto  ${p.nome}`);
    if (fatti % 10 === 0) salva();
  } catch (e) {
    console.warn(`  ${p.id}: ${e.message}`);
  }
}
if (fatti) salva();
console.log(`Da vedere: ${fatti} percorsi aggiornati`);
process.exit(0);
