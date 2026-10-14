// Mappa di base vettoriale (OpenFreeMap, dati OpenStreetMap: gratuita, senza chiavi), in una sola
// mappa MapLibre con i sentieri e le scritte (stile in src/lib/stileMappa.js). Sulle basi a immagini
// (dettagliata, curve, satellite) i sentieri sono una mappa MapLibre a parte, l'unica.
// La libreria MapLibre si carica solo quando serve.
import L from 'leaflet';
import { registraMappaGl } from '../lib/misura.js';
import { stileSentieri, stileUnico, LIVELLI_SENTIERI, visibilita } from '../lib/stileMappa.js';

export { COLORI_SENTIERI, stileSentieri } from '../lib/stileMappa.js';

// chiaro (liberty) o scuro (dark): sono due basi diverse della mappa, scelte nel pannello dei livelli
const STILI = { chiaro: 'https://tiles.openfreemap.org/styles/liberty', scuro: 'https://tiles.openfreemap.org/styles/dark' };
export const ATTR_VETTORIALE =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>, dati &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';


const stiliInCorso = new Map();
function stili(variante = 'chiaro') {
  const url = STILI[variante] ?? STILI.chiaro;
  if (!stiliInCorso.has(url)) stiliInCorso.set(url, scaricaStile(url));
  return stiliInCorso.get(url);
}
function scaricaStile(url) {
  return fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`stile: risposta ${r.status}`))))
    .then((s) => ({ base: s }))
    .catch((e) => {
      stiliInCorso.delete(url);
      throw e;
    });
}

// Densità al massimo 2: sui telefoni con schermo a densità 3 o più MapLibre disegnerebbe più del
// doppio dei pixel a ogni fotogramma, con una differenza appena visibile
const DENSITA = () => Math.min(window.devicePixelRatio || 1, 2);

let libreriaInCorso = null;
// Scarica in anticipo libreria e stile (all'avvio, a riposo): la prima mappa compare già pronta
export function preparaLibreria(variante = 'chiaro') {
  libreriaInCorso ??= Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
    .then(() => import('@maplibre/maplibre-gl-leaflet'))
    .catch((e) => {
      libreriaInCorso = null;
      throw e;
    });
  return Promise.all([libreriaInCorso, stili(variante)]).then(([, s]) => s);
}

// La base vettoriale come un solo livello Leaflet: base, tutti i sentieri e scritte in un'unica mappa
// MapLibre (sentieri: accesi all'inizio o no; poi si cambia con mostraSentieri). Lancia un errore se
// non si può (offline, niente WebGL)
export async function creaBaseVettoriale(variante = 'chiaro', { sentieri = true } = {}) {
  const { base } = await preparaLibreria(variante);
  const livello = L.maplibreGL({ style: stileUnico(base, { scuro: variante === 'scuro', sentieri }), pixelRatio: DENSITA(), attributionControl: { customAttribution: ATTR_VETTORIALE } });
  livello.on('add', () => registraMappaGl('base', livello.getMaplibreMap?.()));
  return livello;
}

// Accende o spegne i sentieri dentro la mappa MapLibre (se lo stile li ha)
export function mostraSentieri(gl, acceso) {
  if (!gl) return;
  const applica = () => LIVELLI_SENTIERI.forEach((id) => gl.getLayer(id) && gl.setLayoutProperty(id, 'visibility', visibilita(acceso)));
  if (gl.isStyleLoaded?.()) applica();
  else gl.once('load', applica);
}

// Livello Leaflet con tutti i sentieri, per qualunque base (anche quelle a immagini)
export async function creaSentieriVettoriali(scuro = false) {
  const { base } = await preparaLibreria(scuro ? 'scuro' : 'chiaro');
  const livello = L.maplibreGL({ style: stileSentieri(base.sources, scuro), pane: 'sentieriVettoriali', pixelRatio: DENSITA(), attributionControl: false, interactive: false });
  // un problema dello stile o delle tile non deve passare in silenzio
  livello.on('add', () => livello.getMaplibreMap?.()?.on('error', (e) => console.warn('Sentieri vettoriali', e.error?.message ?? e)));
  livello.on('add', () => registraMappaGl('sentieri', livello.getMaplibreMap?.()));
  return livello;
}
