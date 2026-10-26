// Calcola l'indice panoramico dei percorsi dell'archivio e lo salva in public/dati/archivio.json.
// Si ricalcola solo quando cambia la traccia o la versione del metodo.
// La esegue ogni giorno GitHub Actions dopo l'importazione; a mano:
//   node scripts/calcola-panorama.mjs           (solo i percorsi da aggiornare)
//   node scripts/calcola-panorama.mjs --tutti   (ricalcola tutto)
// Dati: quote "Terrain Tiles" (AWS Open Data), bosco ESA WorldCover 2021 (CC BY 4.0),
// belvedere, vette e laghi da OpenStreetMap (ODbL).
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { calcolaPanorama, improntaTraccia } from '../src/lib/panorama.js';
import { interrogaOverpass } from '../src/lib/overpass.js';
import { parcoDa } from '../src/datiParchi.js';
import { percorsoSentiero, tracciaDaNonUsare } from '../src/lib/tracce.js';
import { trattiFauna } from '../src/lib/trattoFauna.js';
import { puntiOgni, abbinaTerreno, vieDaRisposta, queryVieVicine, queryTrattiRelazioni } from '../src/lib/terreno.js';
import { faunaDalleOsservazioni, faunaDelParco } from '../src/lib/faunaPercorso.js';
import { urlOsservazioniGbif, interpretaGbif } from '../src/lib/gbif.js';
import { PARCHI } from '../src/datiParchi.js';
import { profiloQuote } from '../src/lib/profiloQuote.js';
import { creaLettoreTinitaly, profiloTinitaly } from '../src/lib/tinitaly.js';
import { profiloEquidistante } from '../src/lib/profiloCampionato.js';
import { mkdirSync } from 'node:fs';
import { lunghezzaKm } from '../src/lib/geo.js';
import { existsSync } from 'node:fs';

const FILE = 'public/dati/archivio.json';
const AGENTE = 'Orme/0.6 (archivio personale di sentieri; https://lamaslamas.github.io/orme/)';
const oggi = new Date().toISOString().slice(0, 10);
const tutti = process.argv.includes('--tutti');
const soloFauna = process.argv.includes('--solo-fauna'); // ricalcola subito la fauna di percorsi e parchi, poi esce
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- tile (Web Mercator) ----------
const tileDi = (lon, lat, z) => {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
};

function creaLettoreTile({ z, url, nome }) {
  const cache = new Map();
  async function scarica(tx, ty) {
    const chiave = `${tx}/${ty}`;
    if (cache.has(chiave)) return;
    for (let tentativo = 1; tentativo <= 3; tentativo++) {
      try {
        const r = await fetch(url(z, tx, ty), { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(30_000) });
        if (r.status === 404) return cache.set(chiave, null);
        if (!r.ok) throw new Error(`risposta ${r.status}`);
        cache.set(chiave, PNG.sync.read(Buffer.from(await r.arrayBuffer())));
        return;
      } catch (e) {
        if (tentativo === 3) {
          console.warn(`  ${nome} ${chiave}: ${e.message}`);
          cache.set(chiave, null);
        } else await attendi(2000 * tentativo);
      }
    }
  }
  return {
    // scarica in anticipo le tile del riquadro (così la lettura dei pixel è sincrona)
    async prepara([o, s, e, n]) {
      const a = tileDi(o, n, z);
      const b = tileDi(e, s, z);
      for (let tx = Math.floor(a.x); tx <= Math.floor(b.x); tx++) {
        for (let ty = Math.floor(a.y); ty <= Math.floor(b.y); ty++) await scarica(tx, ty);
      }
    },
    pixel(lon, lat) {
      const { x, y } = tileDi(lon, lat, z);
      const png = cache.get(`${Math.floor(x)}/${Math.floor(y)}`);
      if (!png) return null;
      const px = Math.min(png.width - 1, Math.floor((x % 1) * png.width));
      const py = Math.min(png.height - 1, Math.floor((y % 1) * png.height));
      const i = (py * png.width + px) * 4;
      return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
    },
  };
}

const terreno = creaLettoreTile({ z: 12, nome: 'quote', url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png` });
const copertura = creaLettoreTile({
  z: 13,
  nome: 'bosco',
  url: (z, x, y) =>
    `https://wmts.terrascope.be/?service=WMTS&request=GetTile&version=1.0.0&layer=esa-worldcover-map-10m-2021-v2_map&style=default&tilematrixset=EPSG:3857&tilematrix=${z}&tilerow=${y}&tilecol=${x}&format=image/png&TIME=2021-01-01`,
});

// Terrarium: quota = R*256 + G + B/256 - 32768
const quota = (lon, lat) => {
  const p = terreno.pixel(lon, lat);
  return p ? p[0] * 256 + p[1] + p[2] / 256 - 32768 : null;
};
// WorldCover: "copertura arborea" è verde scuro (0, 100, 0); trasparente = nessun dato
const bosco = (lon, lat) => {
  const p = copertura.pixel(lon, lat);
  if (!p || p[3] === 0) return null;
  return p[0] === 0 && p[1] === 100 && p[2] === 0;
};

// ---------- luoghi OSM per parco ----------
const luoghiPerParco = new Map();
async function luoghiDelParco(idParco) {
  if (luoghiPerParco.has(idParco)) return luoghiPerParco.get(idParco);
  const [s, o, n, e] = parcoDa(idParco).bbox;
  const m = 0.08; // circa 6-8 km di margine: vette e laghi visibili anche fuori dal parco
  const b = `${s - m},${o - m},${n + m},${e + m}`;
  const query = `[out:json][timeout:120];
(node["tourism"="viewpoint"](${b});node["natural"="peak"](${b});nwr["natural"="water"]["water"~"lake|reservoir"](${b}););
out center tags;`;
  const fetchFn = (url, opz) => fetch(url, { ...opz, headers: { ...opz.headers, 'User-Agent': AGENTE } });
  const json = await interrogaOverpass(query, { fetchFn, timeoutMs: 150_000 });
  const luoghi = { belvedere: [], vette: [], laghi: [] };
  for (const el of json.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null) continue;
    const t = el.tags ?? {};
    const voce = { lon, lat, nome: t.name ?? '' };
    if (t.tourism === 'viewpoint') luoghi.belvedere.push(voce);
    else if (t.natural === 'peak') luoghi.vette.push({ ...voce, quota: Number(t.ele) || null });
    else if (t.natural === 'water' && t.name) luoghi.laghi.push(voce); // solo laghi con un nome
  }
  console.log(`  luoghi ${idParco}: ${luoghi.belvedere.length} belvedere, ${luoghi.vette.length} vette, ${luoghi.laghi.length} laghi`);
  luoghiPerParco.set(idParco, luoghi);
  return luoghi;
}

function riquadro(geojson, margineGradi) {
  const punti = geojson.coordinates.flat();
  const lon = punti.map((p) => p[0]);
  const lat = punti.map((p) => p[1]);
  return [Math.min(...lon) - margineGradi, Math.min(...lat) - margineGradi, Math.max(...lon) + margineGradi, Math.max(...lat) + margineGradi];
}

// ---------- terreno (tag OSM delle vie lungo la traccia) ----------
// Per le tracce prese da relazioni OSM si leggono i loro tratti; per le altre le vie vicine.
async function terrenoDellaTraccia(traccia) {
  const fetchFn = (url, opz) => fetch(url, { ...opz, headers: { ...opz.headers, 'User-Agent': AGENTE } });
  const { pezzi } = percorsoSentiero(traccia.geojson);
  const punti = puntiOgni(pezzi, 25);
  const relazioni = traccia.dettagli?.relazioniOsm ?? [];
  let query;
  if (relazioni.length) query = queryTrattiRelazioni(relazioni);
  else {
    const passo = Math.max(2, Math.ceil(punti.length / 1500));
    query = queryVieVicine(punti.filter((_, i) => i % passo === 0));
  }
  const vie = vieDaRisposta(await interrogaOverpass(query, { fetchFn, timeoutMs: 150_000 }));
  if (!vie.length) throw new Error('nessuna via trovata');
  return abbinaTerreno(punti, vie);
}

const archivio = JSON.parse(readFileSync(FILE, 'utf8'));
let calcolati = 0;
let saltati = 0;
// ---------- profilo delle quote (partenza, punto più alto, dislivello) ----------
// Per le schede, "Dove vado domani?" e i tempi: TINITALY 10 m (INGV), lo stesso modello del disegno
// e di Pianifica, così i tempi coincidono. Al più MAX_QUOTE percorsi per notte (il servizio è
// pubblico); le celle restano su disco tra una notte e l'altra (cache del workflow). Dove TINITALY non
// copre (estero, mare) il vecchio modello Terrarium, e si riprova TINITALY dopo 30 giorni.
const MAX_QUOTE = Number(process.argv[process.argv.indexOf('--max-quote') + 1]) || 150;
const CACHE_DEM = '.cache/tinitaly';
mkdirSync(CACHE_DEM, { recursive: true });
const fileCella = (k) => `${CACHE_DEM}/${k.replace(':', '_')}.json`;
const tinitaly = creaLettoreTinitaly({
  fetchFn: (url) => fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(60_000) }),
  parallele: 2,
  // griglia compatta su disco: quote in decimetri (interi), null dove manca
  leggiCella: async (k) => {
    if (!existsSync(fileCella(k))) return null;
    const g = JSON.parse(readFileSync(fileCella(k), 'utf8'));
    return { ...g, valori: g.dm.map((v) => (v === null ? null : v / 10)) };
  },
  salvaCella: async (k, g) => writeFileSync(fileCella(k), JSON.stringify({ ncol: g.ncol, nrig: g.nrig, ovest: g.ovest, sud: g.sud, passo: g.passo, dm: g.valori.map((v) => (v == null ? null : Math.round(v * 10))) })),
});
const oggiData = new Date().toISOString().slice(0, 10);
const giorniDa = (d) => (d ? (new Date(oggiData) - new Date(d)) / 86_400_000 : Infinity);
let profili = 0;
let daTinitaly = 0;
for (const p of soloFauna ? [] : archivio.percorsi) {
  const g = p.traccia?.geojson;
  if (!g?.coordinates?.length) continue;
  const geometria = improntaTraccia(g).split('-')[1];
  // aggiornato: stessa traccia, fonte buona e profilo a 100 punti (quote.profilo) per la scheda
  const aggiornato = p.quote?.impronta === geometria && Array.isArray(p.quote.profilo) && (p.quote.fonte === 'tinitaly' || (p.quote.fonte === 'terrarium' && giorniDa(p.quote.tinitalyNo) < 30));
  if (!tutti && aggiornato) continue;
  if (daTinitaly >= MAX_QUOTE) continue; // gli altri la notte dopo
  try {
    daTinitaly++;
    let r = await profiloTinitaly(g, tinitaly).catch((e) => {
      console.warn(`  TINITALY ${p.id}: ${e.message}`);
      return null;
    });
    let fonte = 'tinitaly';
    if (!r) {
      await terreno.prepara(riquadro(g, 0.005));
      r = profiloQuote(g, quota);
      if (r) r = { ...r, profilo: profiloEquidistante(percorsoSentiero(g).pezzi, quota) };
      fonte = 'terrarium';
    }
    if (!r) continue;
    p.quote = { ...r, impronta: geometria, fonte, ...(fonte === 'terrarium' ? { tinitalyNo: oggiData } : {}) };
    profili++;
  } catch (e) {
    console.warn(`  quote ${p.id}: ${e.message}`);
  }
}
console.log(`Profilo delle quote: ${profili} percorsi (TINITALY; al più ${MAX_QUOTE} per notte)`);
if (process.argv.includes('--solo-quote')) {
  if (profili) writeFileSync(FILE, JSON.stringify({ ...archivio, aggiornato: new Date().toISOString() }));
  process.exit(0);
}

// ---------- fauna da GBIF (tutte le fonti: iNaturalist, eBird, Observation.org, atlanti…) ----------
// Una volta per parco: tutte le osservazioni delle specie di Orme nel riquadro (più un margine),
// poi il confronto con ogni percorso avviene qui. Con calma: GBIF è un servizio gratuito.
const osservazioniPerParco = new Map();
async function osservazioniDelParco(idParco) {
  if (osservazioniPerParco.has(idParco)) return osservazioniPerParco.get(idParco);
  const [s, o, n, e] = parcoDa(idParco).bbox;
  const m = 0.15;
  const risultati = [];
  for (let pagina = 0; pagina < 100; pagina++) {
    const url = urlOsservazioniGbif([s - m, o - m, n + m, e + m], { specie: 'tutte' }, { limite: 300, scarto: pagina * 300 });
    const r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`GBIF: risposta ${r.status}`);
    const json = await r.json();
    // solo i campi necessari: niente nomi degli osservatori (un codice anonimo per contarli)
    for (const x of interpretaGbif(json)) risultati.push({ animale: x.animale, nomeScientifico: x.nomeScientifico, ordine: x.ordine, lat: x.lat, lon: x.lon, sfumata: x.sfumata, osservatore: x.osservatore, data: x.data });
    if (json.endOfRecords || !json.results?.length) break;
    await attendi(400);
  }
  // anche gli altri rapaci (poiana, gheppio…): servono solo al tratto con più fauna, non alle liste di specie
  for (let pagina = 0; pagina < 100; pagina++) {
    const url = urlOsservazioniGbif([s - m, o - m, n + m, e + m], { specie: 'notevoli', gruppi: ['rapaci'] }, { limite: 300, scarto: pagina * 300 });
    const r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`GBIF rapaci: risposta ${r.status}`);
    const json = await r.json();
    for (const x of interpretaGbif(json)) if (!x.animale) risultati.push({ animale: null, nomeScientifico: x.nomeScientifico, ordine: x.ordine, lat: x.lat, lon: x.lon, sfumata: x.sfumata, osservatore: x.osservatore, data: x.data });
    if (json.endOfRecords || !json.results?.length) break;
    await attendi(400);
  }
  console.log(`  GBIF ${idParco}: ${risultati.length} osservazioni`);
  osservazioniPerParco.set(idParco, risultati);
  return risultati;
}

// versione 2: le specie hanno anche l'anno dell'ultima osservazione
const VERSIONE_FAUNA = 5; // 3: anche il tratto più ricco (faunaInat.tratti); 5: nessuna esclusione di specie (restano fuori solo le posizioni sfumate)
let faune = 0;
for (const p of archivio.percorsi) {
  const g = p.traccia?.geojson;
  if (!g?.coordinates?.length) continue;
  const geometria = improntaTraccia(g).split('-')[1];
  const f = p.faunaInat;
  // si ricalcola se cambia la traccia o una volta al mese
  // anche se mancano i conteggi mese per mese (dati calcolati prima del filtro "nel periodo attuale")
  const senzaMesi = (f?.specie ?? []).some((x) => !Array.isArray(x.perMese)) || (f && f.versione !== VERSIONE_FAUNA);
  if (!tutti && !soloFauna && !senzaMesi && f?.impronta === geometria && f.calcolato && (new Date(oggi) - new Date(f.calcolato)) / 86_400_000 < 30) continue;
  try {
    const tutteLeOss = (await Promise.all((p.parchi ?? [p.parco]).map(osservazioniDelParco))).flat();
    // con i km della traccia: il livello "Ricco di fauna" pesa le osservazioni sulla lunghezza
    p.faunaInat = { specie: faunaDalleOsservazioni(tutteLeOss, g), calcolato: oggi, versione: VERSIONE_FAUNA, impronta: geometria, km: Math.round(lunghezzaKm(g) * 10) / 10 };
    // tratto più ricco: solo per tracce continue (con salti oltre 500 m i km lungo la traccia non valgono)
    if (!tracciaDaNonUsare(p, p.traccia).incompleta && p.tipoPercorso !== 'rete_sentieri') p.faunaInat.tratti = trattiFauna(tutteLeOss, percorsoSentiero(g).pezzi);
    faune++;
  } catch (e) {
    console.warn(`  fauna ${p.id}: ${e.message}`);
  }
}

// Riepilogo della fauna di ogni parco (stesso metodo per tutti), una volta a settimana
const FILE_FAUNA = 'public/dati/fauna-parchi.json';
const faunaParchi = existsSync(FILE_FAUNA) ? JSON.parse(readFileSync(FILE_FAUNA, 'utf8')) : { parchi: {} };
const confiniParchi = existsSync('public/dati/confini.json') ? JSON.parse(readFileSync('public/dati/confini.json', 'utf8')).confini : {};
let parchiFauna = 0;
const soloParchi = process.argv.slice(2).filter((a) => !a.startsWith('--')); // es. gravine: solo la fauna di quei parchi
for (const parco of PARCHI.filter((p) => !soloParchi.length || soloParchi.includes(p.id))) {
  const prima = faunaParchi.parchi[parco.id];
  if (!tutti && !soloFauna && prima?.versione === VERSIONE_FAUNA && prima?.calcolato && (new Date(oggi) - new Date(prima.calcolato)) / 86_400_000 < 7) continue;
  try {
    const r = faunaDelParco(await osservazioniDelParco(parco.id), { anelli: confiniParchi[parco.id], bbox: parco.bbox });
    faunaParchi.parchi[parco.id] = { ...r, calcolato: oggi, versione: VERSIONE_FAUNA };
    parchiFauna++;
  } catch (e) {
    console.warn(`  fauna del parco ${parco.id}: ${e.message}`);
  }
}
if (parchiFauna) {
  writeFileSync(FILE_FAUNA, JSON.stringify({ fonte: 'GBIF (iNaturalist, eBird, Observation.org e altre fonti)', ...faunaParchi, aggiornato: new Date().toISOString() }));
  console.log(`Fauna dei parchi: ${parchiFauna} parchi aggiornati`);
}
if (soloFauna) {
  if (faune) writeFileSync(FILE, JSON.stringify({ ...archivio, aggiornato: new Date().toISOString() }));
  console.log(`Fauna: ${faune} percorsi, ${parchiFauna} parchi`);
  process.exit(0);
}

for (const p of archivio.percorsi) {
  const g = p.traccia?.geojson;
  if (!g?.coordinates?.length) continue;
  const imp = improntaTraccia(g);
  if (!tutti && p.panorama?.impronta === imp) {
    saltati++;
    continue;
  }
  try {
    const luoghi = await luoghiDelParco(p.parco);
    await terreno.prepara(riquadro(g, 0.11)); // 8 km di visuale + margine
    await copertura.prepara(riquadro(g, 0.015)); // la chioma conta entro 1 km
    const d = p.traccia.dettagli ?? {};
    const r = calcolaPanorama(g, { quota, bosco, luoghi, parziale: Boolean(d.notaParziale || d.mancanti?.length), oggi });
    if (!r) {
      console.warn(`  ${p.id}: non calcolabile (quote mancanti)`);
      continue;
    }
    p.panorama = { ...r, impronta: imp };
    calcolati++;
    console.log(`${String(r.punteggio).padStart(3)}  ${r.affidabilita.padEnd(5)}  ${p.nome}`);
  } catch (e) {
    console.warn(`  ${p.id}: ${e.message}`);
  }
}
let terreni = 0;
// Overpass è lento e spesso sovraccarico: al terreno si dedicano al massimo 20 minuti per giro,
// salvando man mano; i percorsi rimasti si completano nei giorni successivi
const FINE_TERRENO = Date.now() + 20 * 60_000;
const salvaArchivio = () => writeFileSync(FILE, JSON.stringify({ ...archivio, aggiornato: new Date().toISOString() }));
for (const p of archivio.percorsi) {
  if (Date.now() > FINE_TERRENO) {
    console.log('  terreno: tempo finito per oggi, si riprende al prossimo giro');
    break;
  }
  const g = p.traccia?.geojson;
  if (!g?.coordinates?.length) continue;
  // impronta della sola geometria: il terreno non dipende dalla taratura dell'indice
  const geometria = improntaTraccia(g).split('-')[1];
  if (!tutti && p.traccia.dettagli?.terrenoImpronta === geometria) continue;
  try {
    const terreno = await terrenoDellaTraccia(p.traccia);
    p.traccia.dettagli = { ...(p.traccia.dettagli ?? {}), terreno, terrenoImpronta: geometria };
    terreni++;
    if (terreni % 10 === 0) salvaArchivio();
    console.log(`terreno  ${p.nome}: ${terreno.length} tratti`);
    await attendi(1500); // con calma: Overpass è un servizio gratuito
  } catch (e) {
    console.warn(`  terreno ${p.id}: ${e.message}`);
  }
}


if (calcolati || terreni || faune || profili) writeFileSync(FILE, JSON.stringify({ ...archivio, aggiornato: new Date().toISOString() }));
console.log(`\nFauna iNaturalist: ${faune} percorsi. Terreno: ${terreni} percorsi aggiornati. Indice panoramico: ${calcolati} calcolati, ${saltati} già aggiornati.`);

// eventuali richieste di rete rimaste appese non devono tenere aperto il processo
process.exit(0);
