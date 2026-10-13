// Punti utili da OpenStreetMap: rifugi, bivacchi e ricoveri; sorgenti e fontanelle.
// Si salvano solo dati pubblici sui luoghi (niente telefoni o email dei gestori).
import { puntoNelPoligono } from './confini.js';
import { distanzaDallaTracciaM } from './geo.js';
import { dentroIlParco } from './overpass.js';

export const TIPI_PUNTO = {
  rifugio: { gruppo: 'rifugi', nome: 'Rifugio', plurale: 'rifugi' },
  bivacco: { gruppo: 'rifugi', nome: 'Bivacco', plurale: 'bivacchi' },
  ricovero: { gruppo: 'rifugi', nome: 'Ricovero', plurale: 'ricoveri' },
  fonte: { gruppo: 'acqua', nome: 'Sorgente', plurale: 'sorgenti' },
  fontanella: { gruppo: 'acqua', nome: 'Fontanella', plurale: 'fontanelle' },
};
export const GRUPPI_PUNTI = { rifugi: 'Rifugi e bivacchi', acqua: 'Acqua' };
// Una sola soglia in tutta l'app (schede, Pianifica, disegno, Su più giorni): rifugi e acqua "lungo
// il percorso" se entro 300 m dalla traccia. Con 200 m sui percorsi dell'archivio si perdono il 15%
// delle fonti e dei rifugi (sorgenti un po' sotto il sentiero, posizioni approssimate in OSM);
// 300 m sono una deviazione di pochi minuti.
export const RAGGIO_LUNGO_IL_PERCORSO_M = 300;

export function queryPuntiParco(parco) {
  const { prima, filtro } = dentroIlParco(parco);
  return `[out:json][timeout:120];
${prima}(
nwr["tourism"~"^(wilderness_hut|alpine_hut)$"]${filtro};
nwr["amenity"="shelter"]["shelter_type"~"^(basic_hut|lean_to)$"]${filtro};
node["natural"="spring"]${filtro};
nwr["amenity"="drinking_water"]${filtro};
);
out center tags;`;
}

export function tipoDelPunto(t = {}) {
  if (t.tourism === 'alpine_hut') return 'rifugio';
  if (t.tourism === 'wilderness_hut') return 'bivacco';
  if (t.amenity === 'shelter') return 'ricovero';
  if (t.natural === 'spring') return 'fonte';
  if (t.amenity === 'drinking_water') return 'fontanella';
  return null;
}

const si = (v) => v === 'yes';
const no = (v) => v === 'no';

export function puntoDaElemento(el) {
  const t = el.tags ?? {};
  const tipo = tipoDelPunto(t);
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!tipo || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const quota = Number.parseInt(t.ele, 10);
  const p = { id: `${el.type[0]}${el.id}`, tipo, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
  if (t.name) p.nome = t.name;
  if (Number.isFinite(quota)) p.quota = quota;
  // acqua: potabile sì / no / non indicato; stagionale se può seccarsi
  if (TIPI_PUNTO[tipo].gruppo === 'acqua') {
    if (si(t.drinking_water) || tipo === 'fontanella') p.potabile = !no(t.drinking_water);
    else if (no(t.drinking_water)) p.potabile = false;
    if (si(t.intermittent) || si(t.seasonal)) p.stagionale = true;
  }
  if (no(t.access) || t.access === 'private') p.privato = true;
  if (/closed|chius/i.test(`${t.note ?? ''} ${t.description ?? ''}`) || t['disused:tourism'] || si(t.disused)) p.chiuso = true;
  if (si(t.fireplace)) p.camino = true;
  return p;
}

// Elementi della risposta → punti; con il confine si scartano quelli fuori dal parco
export function puntiDallaRisposta(json, anelli = null) {
  const visti = new Set();
  const punti = [];
  for (const el of json?.elements ?? []) {
    const p = puntoDaElemento(el);
    if (!p || visti.has(p.id)) continue;
    if (anelli?.length && !puntoNelPoligono([p.lon, p.lat], anelli)) continue;
    visti.add(p.id);
    punti.push(p);
  }
  return punti.sort((a, b) => a.id.localeCompare(b.id));
}

// Punti entro il raggio dalla traccia, dal più vicino
export function puntiLungoIlPercorso(punti, geojson, raggioM = RAGGIO_LUNGO_IL_PERCORSO_M) {
  if (!geojson?.coordinates?.length) return [];
  // prima un riquadro attorno alla traccia (veloce), poi la distanza vera solo per i punti dentro
  let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const linea of geojson.coordinates) {
    for (const [lon, lat] of linea) {
      o = Math.min(o, lon);
      e = Math.max(e, lon);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  }
  const mLat = raggioM / 111_000;
  const mLon = mLat / Math.cos(((s + n) / 2) * (Math.PI / 180));
  return punti
    .filter((p) => p.lat >= s - mLat && p.lat <= n + mLat && p.lon >= o - mLon && p.lon <= e + mLon)
    .map((p) => ({ ...p, distanzaM: Math.round(distanzaDallaTracciaM([p.lon, p.lat], geojson)) }))
    .filter((p) => p.distanzaM <= raggioM)
    .sort((a, b) => a.distanzaM - b.distanzaM);
}

// Punti dentro un riquadro [sud, ovest, nord, est]
export function puntiNelRiquadro(punti, [s, o, n, e]) {
  return punti.filter((p) => p.lat >= s && p.lat <= n && p.lon >= o && p.lon <= e);
}

// Dove passare la notte: rifugi, bivacchi e ricoveri non chiusi né privati
export const perLaNotte = (p) => TIPI_PUNTO[p.tipo]?.gruppo === 'rifugi' && !p.chiuso && !p.privato;
// Acqua: sorgenti e fontanelle non segnate come non potabili
export const conAcqua = (p) => TIPI_PUNTO[p.tipo]?.gruppo === 'acqua' && p.potabile !== false;

// "1 bivacco, 2 sorgenti"
export function riassuntoPunti(punti) {
  const conta = new Map();
  for (const p of punti) conta.set(p.tipo, (conta.get(p.tipo) ?? 0) + 1);
  return Object.keys(TIPI_PUNTO)
    .filter((k) => conta.get(k))
    .map((k) => `${conta.get(k)} ${conta.get(k) === 1 ? TIPI_PUNTO[k].nome.toLowerCase() : TIPI_PUNTO[k].plurale}`)
    .join(', ');
}

// Note brevi per il riquadro sulla mappa
export function noteDelPunto(p) {
  const note = [];
  if (p.quota) note.push(`${p.quota} m`);
  if (p.potabile === true) note.push('acqua potabile (secondo OSM)');
  if (p.potabile === false) note.push('acqua non potabile');
  if (TIPI_PUNTO[p.tipo]?.gruppo === 'acqua' && p.potabile === undefined) note.push('potabilità non indicata');
  if (p.stagionale) note.push('può seccarsi in estate');
  if (p.camino) note.push('con camino');
  if (p.chiuso) note.push('segnalato come chiuso');
  if (p.privato) note.push('accesso privato');
  return note;
}

// Acqua in tre categorie (più "potabile" quando OSM lo dice):
// potabile · potabilità non indicata · da trattare (segnata non potabile) · stagionale (può seccarsi)
export const CATEGORIE_ACQUA = {
  potabile: { nome: 'potabile', plurale: 'potabili' },
  non_indicata: { nome: 'potabilità non indicata', plurale: 'potabilità non indicata' },
  da_trattare: { nome: 'da trattare', plurale: 'da trattare' },
  stagionale: { nome: 'stagionale, può seccarsi', plurale: 'stagionali, possono seccarsi' },
};
export function categoriaAcqua(p) {
  if (TIPI_PUNTO[p?.tipo]?.gruppo !== 'acqua') return null;
  if (p.potabile === false) return 'da_trattare';
  if (p.stagionale) return 'stagionale';
  return p.potabile === true ? 'potabile' : 'non_indicata';
}
// Fonti su cui contare per il tratto senza acqua: potabili e con potabilità non indicata
export const acquaSuCuiContare = (p) => ['potabile', 'non_indicata'].includes(categoriaAcqua(p));

// --- Punti fuori dai parchi: a quadrati (celle) di 0,1° (circa 8×11 km), scaricati quando servono ---
export const PASSO_CELLA = 0.1;
export const ZOOM_CELLE = 13;
export const GIORNI_CELLA = 30; // poi si riscarica
const arrotonda = (x) => Math.round(x * 1000) / 1000;
// Celle che toccano il riquadro [sud, ovest, nord, est]: { chiave, bbox }. Al massimo max (vista
// troppo ampia: nessuna, si aspetta di avvicinarsi)
export function celleNelRiquadro([s, o, n, e], { passo = PASSO_CELLA, max = 12 } = {}) {
  const celle = [];
  for (let la = Math.floor(s / passo); la * passo < n; la++) {
    for (let lo = Math.floor(o / passo); lo * passo < e; lo++) {
      celle.push({ chiave: `${la}:${lo}`, bbox: [arrotonda(la * passo), arrotonda(lo * passo), arrotonda((la + 1) * passo), arrotonda((lo + 1) * passo)] });
      if (celle.length > max) return [];
    }
  }
  return celle;
}
export const cellaScaduta = (salvata, oggi = new Date()) => !salvata?.scaricato || (oggi - new Date(salvata.scaricato)) / 86_400_000 >= GIORNI_CELLA;
