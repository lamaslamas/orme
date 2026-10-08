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

function riquadro(geojson, margineGradi) {
  const punti = geojson.coordinates.flat();
  const lon = punti.map((p) => p[0]);
  const lat = punti.map((p) => p[1]);
  return [Math.min(...lon) - margineGradi, Math.min(...lat) - margineGradi, Math.max(...lon) + margineGradi, Math.max(...lat) + margineGradi];
}

const archivio = JSON.parse(readFileSync(FILE, 'utf8'));
let calcolati = 0;
let saltati = 0;
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
    await terreno.prepara(riquadro(g, 0.085)); // 6 km di orizzonte + margine
    await copertura.prepara(riquadro(g, 0.002));
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
if (calcolati) writeFileSync(FILE, JSON.stringify({ ...archivio, aggiornato: new Date().toISOString() }));
console.log(`\nIndice panoramico: ${calcolati} calcolati, ${saltati} già aggiornati.`);
