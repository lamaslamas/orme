// I punti di interesse del pianificatore: categorie accendibili, dati da OpenStreetMap, quelli entro 300 m dal percorso
// con il km, e il nome delle tappe (un POI entro 100 m). Solo calcoli, senza mappa né rete (la rete è in viste/poiPianificatore.js).
import { TIPI_PUNTO } from './puntiUtili.js';
import { posizioneSullaTraccia } from './lungoIlPercorso.js';
import { nuovaTappa } from './pianificatore.js';

export const RAGGIO_POI_M = 300; // «lungo il percorso»
export const RAGGIO_PARCHEGGIO_M = 500; // i parcheggi solo vicino a partenza e arrivo
export const RAGGIO_NOME_M = 100; // un POI così vicino dà il nome alla tappa

// I tipi in più rispetto ai punti che già scarichiamo (rifugi, acqua, strutture per dormire)
export const TIPI_NUOVI = {
  capanno: { nome: 'Capanno di osservazione' },
  torretta: { nome: 'Torretta di osservazione' },
  belvedere: { nome: 'Belvedere' },
  cima: { nome: 'Cima' },
  parcheggio: { nome: 'Parcheggio' },
};

// Le categorie che si accendono e si spengono. glifo: il disegno nell'icona (mai una lettera: le lettere sono delle tappe)
export const CATEGORIE_POI = [
  { chiave: 'acqua', nome: 'Acqua', colore: '#2f80c4', glifo: 'goccia', tipi: ['fonte', 'fontanella'] },
  { chiave: 'dormire', nome: 'Rifugi e posti per dormire', colore: '#a8552a', glifo: 'casa', tipi: ['rifugio', 'bivacco', 'ricovero', 'campeggio', 'agriturismo', 'bb', 'ostello', 'albergo', 'alloggio'] },
  { chiave: 'osservazione', nome: 'Capanni e torrette', colore: '#2a8a5a', glifo: 'capanno', tipi: ['capanno', 'torretta'] },
  { chiave: 'belvedere', nome: 'Belvedere', colore: '#d07a2e', glifo: 'occhio', tipi: ['belvedere'] },
  { chiave: 'cime', nome: 'Cime', colore: '#6d5bb5', glifo: 'cima', tipi: ['cima'] },
  { chiave: 'parcheggi', nome: 'Parcheggi', colore: '#4b5d68', glifo: 'sosta', tipi: ['parcheggio'] },
];
const PER_TIPO = new Map(CATEGORIE_POI.flatMap((c) => c.tipi.map((t) => [t, c])));
export const categoriaDelTipo = (tipo) => PER_TIPO.get(tipo) ?? null;
export const categoriaDelPoi = (p) => categoriaDelTipo(p?.tipo);
export const nomeDelTipo = (tipo) => TIPI_PUNTO[tipo]?.nome ?? TIPI_NUOVI[tipo]?.nome ?? 'Punto';

// «Fonte della Rocca» / «Fontanella» / «Monte Marrone · 1.642 m»
export function nomePoi(p) {
  const base = p?.nome || nomeDelTipo(p?.tipo);
  return p?.tipo === 'cima' && Number.isFinite(p.quota) ? `${base} · ${p.quota.toLocaleString('it-IT')} m` : base;
}
// il nome che dà alla tappa (la cima senza la quota: sta già a fianco, nell'elenco)
export const nomePerTappa = (p) => p?.nome || nomeDelTipo(p?.tipo);

// --- da OpenStreetMap ---
export function queryPoiNuovi([s, o, n, e]) {
  const b = `(${s.toFixed(4)},${o.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)})`;
  return `[out:json][timeout:60];
(
nwr["leisure"="bird_hide"]${b};
nwr["man_made"="tower"]["tower:type"="observation"]${b};
nwr["tourism"="viewpoint"]${b};
node["natural"="peak"]["name"]${b};
nwr["amenity"="parking"]["access"!~"^(private|customers)$"]${b};
);
out center tags;`;
}
export function tipoNuovo(t = {}) {
  if (t.leisure === 'bird_hide') return 'capanno';
  if (t.man_made === 'tower' && t['tower:type'] === 'observation') return 'torretta';
  if (t.tourism === 'viewpoint') return 'belvedere';
  if (t.natural === 'peak') return 'cima';
  if (t.amenity === 'parking') return 'parcheggio';
  return null;
}
export function poiDaElemento(el) {
  const t = el.tags ?? {};
  const tipo = tipoNuovo(t);
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!tipo || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = { id: `${el.type[0]}${el.id}`, tipo, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
  if (t.name) p.nome = String(t.name).slice(0, 80);
  const quota = Number.parseInt(t.ele, 10);
  if (Number.isFinite(quota)) p.quota = quota;
  return p;
}
export const poiDallaRisposta = (json) => [...new Map((json?.elements ?? []).map(poiDaElemento).filter(Boolean).map((p) => [p.id, p])).values()];

// celle da 0,1° (circa 8 × 11 km) che coprono un riquadro: si scarica e si ricorda una cella alla volta
export const LATO_CELLA = 0.1;
export const idCella = (lon, lat) => `${Math.floor(lat / LATO_CELLA)}_${Math.floor(lon / LATO_CELLA)}`;
export const riquadroCella = (id) => {
  const [r, c] = id.split('_').map(Number);
  return [r * LATO_CELLA, c * LATO_CELLA, (r + 1) * LATO_CELLA, (c + 1) * LATO_CELLA];
};
export function celleDelRiquadro([s, o, n, e]) {
  const ids = [];
  for (let r = Math.floor(s / LATO_CELLA); r <= Math.floor(n / LATO_CELLA); r++) for (let c = Math.floor(o / LATO_CELLA); c <= Math.floor(e / LATO_CELLA); c++) ids.push(`${r}_${c}`);
  return ids;
}
export const riquadroDelPercorso = (linea, margineGradi = 0.004) => {
  let [s, o, n, e] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of linea) [s, o, n, e] = [Math.min(s, lat), Math.min(o, lon), Math.max(n, lat), Math.max(e, lon)];
  return Number.isFinite(s) ? [s - margineGradi, o - margineGradi, n + margineGradi, e + margineGradi] : null;
};

// --- lungo il percorso ---
// poi: tutti i punti (anche rifugi e acqua già scaricati); linea: la traccia [[lon, lat]…]. → [{ ...poi, categoria, distanzaM, km }] dal km 0
export function poiLungoIlPercorso(poi, linea, { raggioM = RAGGIO_POI_M, parcheggioM = RAGGIO_PARCHEGGIO_M, categorie = null } = {}) {
  if (!linea?.length) return [];
  const box = riquadroDelPercorso(linea, 0.0035);
  const pezzi = [linea];
  const partenza = linea[0];
  const arrivo = linea.at(-1);
  const vicino = (p, a, m) => Math.hypot((p.lon - a[0]) * Math.cos((a[1] * Math.PI) / 180), p.lat - a[1]) * 111_195 <= m;
  const r = [];
  for (const p of poi) {
    const c = categoriaDelPoi(p);
    if (!c || (categorie && !categorie.has(c.chiave)) || p.chiuso || p.privato) continue;
    if (p.lat < box[0] || p.lat > box[2] || p.lon < box[1] || p.lon > box[3]) continue;
    // i parcheggi solo vicino alla partenza e all'arrivo
    if (c.chiave === 'parcheggi' && !(vicino(p, partenza, parcheggioM) || vicino(p, arrivo, parcheggioM))) continue;
    const pos = posizioneSullaTraccia([p.lon, p.lat], pezzi);
    if (pos.km == null || pos.distanzaM > (c.chiave === 'parcheggi' ? parcheggioM : raggioM)) continue;
    r.push({ ...p, categoria: c.chiave, distanzaM: Math.round(pos.distanzaM), km: Math.round(pos.km * 10) / 10 });
  }
  return r.sort((a, b) => a.km - b.km);
}
// il POI più vicino a un punto [lon, lat] entro `raggioM` (per dare il nome alla tappa); i parcheggi non danno il nome
export function poiVicinoA([lon, lat], poi, raggioM = RAGGIO_NOME_M) {
  let migliore = null;
  for (const p of poi) {
    const c = categoriaDelPoi(p);
    if (!c || c.chiave === 'parcheggi' || p.chiuso) continue;
    const d = Math.hypot((p.lon - lon) * Math.cos((lat * Math.PI) / 180), p.lat - lat) * 111_195;
    if (d <= raggioM && (!migliore || d < migliore.d)) migliore = { p, d };
  }
  return migliore?.p ?? null;
}

// «Passa di qui»: la tappa nuova va nel posto giusto, secondo il km del POI lungo il percorso
// kmTappe: i km di ogni tappa (kmDelleTappe); senza km la tappa va prima dell'arrivo
export function passaDiQui(tappe, kmTappe, kmPoi, poi) {
  const nuova = nuovaTappa([poi.lon, poi.lat], { nome: null, poi: nomePerTappa(poi) });
  let i = tappe.length - 1; // prima dell'arrivo
  if (Array.isArray(kmTappe) && Number.isFinite(kmPoi)) {
    const k = kmTappe.findIndex((x, j) => j > 0 && x > kmPoi);
    if (k > 0) i = k;
  }
  i = Math.max(1, Math.min(tappe.length, i));
  if (tappe.length < 2) i = tappe.length;
  return [...tappe.slice(0, i), nuova, ...tappe.slice(i)];
}

// --- categorie scelte (si ricordano sul telefono) ---
export const CHIAVE_CATEGORIE = 'orme.poiPianificatore';
export function leggiCategorie(memoria = globalThis.localStorage) {
  try {
    const v = JSON.parse(memoria?.getItem(CHIAVE_CATEGORIE) ?? 'null');
    if (Array.isArray(v)) return new Set(v.filter((k) => CATEGORIE_POI.some((c) => c.chiave === k)));
  } catch {
    // si riparte da tutte
  }
  return new Set(CATEGORIE_POI.map((c) => c.chiave));
}
export function salvaCategorie(categorie, memoria = globalThis.localStorage) {
  try {
    memoria?.setItem(CHIAVE_CATEGORIE, JSON.stringify([...categorie]));
  } catch {
    // vale per questa visita
  }
}
