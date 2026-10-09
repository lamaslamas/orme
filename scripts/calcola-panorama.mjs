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
import { percorsoSentiero } from '../src/lib/tracce.js';
import { puntiOgni, abbinaTerreno, vieDaRisposta, queryVieVicine, queryTrattiRelazioni } from '../src/lib/terreno.js';
import { faunaDalleOsservazioni, faunaDelParco, TAXA_FAUNA } from '../src/lib/faunaPercorso.js';
import { PARCHI } from '../src/datiParchi.js';
import { existsSync } from 'node:fs';

const FILE = 'public/dati/archivio.json';
const AGENTE = 'Orme/0.6 (archivio personale di sentieri; https://lamaslamas.github.io/orme/)';
const oggi = new Date().toISOString().slice(0, 10);
const tutti = process.argv.includes('--tutti');
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

// Foto di Wikimedia Commons scattata vicino al belvedere (entro 300 m), solo con licenza libera
const fotoInCache = new Map();
const LICENZA_LIBERA = /^(cc[ -]by|cc0|public domain|pd)/i;
async function fotoVicina({ lat, lon }) {
  const chiave = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (fotoInCache.has(chiave)) return fotoInCache.get(chiave);
  let foto = null;
  try {
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=geosearch&ggsnamespace=6&ggsradius=300&ggslimit=10' +
      `&ggscoord=${lat}|${lon}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=480`;
    const r = await (await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(30_000) })).json();
    const pagine = Object.values(r.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const pg of pagine) {
      const i = pg.imageinfo?.[0];
      const m = i?.extmetadata ?? {};
      const licenza = m.LicenseShortName?.value ?? '';
      if (!i?.thumburl || !LICENZA_LIBERA.test(licenza) || /\b(nc|nd)\b/i.test(licenza)) continue;
      if (!/\.(jpe?g|png|webp)$/i.test(pg.title)) continue;
      foto = {
        url: i.thumburl.split('?')[0],
        pagina: i.descriptionurl,
        autore: (m.Artist?.value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'autore su Commons',
        licenza,
      };
      break;
    }
  } catch (e) {
    console.warn(`  foto belvedere ${chiave}: ${e.message}`);
  }
  fotoInCache.set(chiave, foto);
  await attendi(200);
  return foto;
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
// ---------- fauna da iNaturalist (osservazioni verificate delle specie di Orme) ----------
// Una volta per parco: tutte le osservazioni nel riquadro (più un margine), poi il confronto
// con ogni percorso avviene qui. Si rispetta il limite di circa una richiesta al secondo.
const osservazioniPerParco = new Map();
async function osservazioniDelParco(idParco) {
  if (osservazioniPerParco.has(idParco)) return osservazioniPerParco.get(idParco);
  const [s, o, n, e] = parcoDa(idParco).bbox;
  const m = 0.15;
  const risultati = [];
  let dopo = 0;
  for (let pagina = 0; pagina < 60; pagina++) {
    const url =
      `https://api.inaturalist.org/v1/observations?taxon_id=${TAXA_FAUNA.join(',')}&quality_grade=research` +
      `&swlat=${s - m}&swlng=${o - m}&nelat=${n + m}&nelng=${e + m}&per_page=200&order_by=id&order=asc&id_above=${dopo}`;
    const r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`iNaturalist: risposta ${r.status}`);
    const json = await r.json();
    // si tengono solo i campi necessari (niente nomi degli osservatori)
    for (const x of json.results ?? []) {
      risultati.push({ taxon: { id: x.taxon?.id, ancestor_ids: x.taxon?.ancestor_ids }, location: x.location, obscured: x.obscured, user: { id: x.user?.id }, observed_on: x.observed_on, quality_grade: x.quality_grade });
    }
    if ((json.results ?? []).length < 200) break;
    dopo = json.results.at(-1).id;
    await attendi(1100);
  }
  console.log(`  iNaturalist ${idParco}: ${risultati.length} osservazioni verificate`);
  osservazioniPerParco.set(idParco, risultati);
  return risultati;
}

let faune = 0;
for (const p of archivio.percorsi) {
  const g = p.traccia?.geojson;
  if (!g?.coordinates?.length) continue;
  const geometria = improntaTraccia(g).split('-')[1];
  const f = p.faunaInat;
  // si ricalcola se cambia la traccia o una volta al mese
  if (!tutti && f?.impronta === geometria && f.calcolato && (new Date(oggi) - new Date(f.calcolato)) / 86_400_000 < 30) continue;
  try {
    const tutteLeOss = (await Promise.all((p.parchi ?? [p.parco]).map(osservazioniDelParco))).flat();
    p.faunaInat = { specie: faunaDalleOsservazioni(tutteLeOss, g), calcolato: oggi, impronta: geometria };
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
for (const parco of PARCHI) {
  const prima = faunaParchi.parchi[parco.id];
  if (!tutti && prima?.calcolato && (new Date(oggi) - new Date(prima.calcolato)) / 86_400_000 < 7) continue;
  try {
    const r = faunaDelParco(await osservazioniDelParco(parco.id), { anelli: confiniParchi[parco.id], bbox: parco.bbox });
    faunaParchi.parchi[parco.id] = { ...r, calcolato: oggi };
    parchiFauna++;
  } catch (e) {
    console.warn(`  fauna del parco ${parco.id}: ${e.message}`);
  }
}
if (parchiFauna) {
  writeFileSync(FILE_FAUNA, JSON.stringify({ fonte: 'iNaturalist (osservazioni verificate)', ...faunaParchi, aggiornato: new Date().toISOString() }));
  console.log(`Fauna dei parchi: ${parchiFauna} parchi aggiornati`);
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
    for (const b of r.belvedere) b.foto = await fotoVicina(b);
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


if (calcolati || terreni || faune) writeFileSync(FILE, JSON.stringify({ ...archivio, aggiornato: new Date().toISOString() }));
console.log(`\nFauna iNaturalist: ${faune} percorsi. Terreno: ${terreni} percorsi aggiornati. Indice panoramico: ${calcolati} calcolati, ${saltati} già aggiornati.`);

// eventuali richieste di rete rimaste appese non devono tenere aperto il processo
process.exit(0);
