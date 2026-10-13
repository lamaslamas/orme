// Mappa di base vettoriale (OpenFreeMap, dati OpenStreetMap: gratuita, senza chiavi).
// Due copie dello stesso stile: la base senza scritte sotto le tracce e le sole scritte
// (nomi di luoghi, vette, punti d'interesse) in un livello sopra le tracce.
// La libreria MapLibre si carica solo quando serve.
import L from 'leaflet';

// chiaro (liberty) o scuro (dark): sono due basi diverse della mappa, scelte nel pannello dei livelli
const STILI = { chiaro: 'https://tiles.openfreemap.org/styles/liberty', scuro: 'https://tiles.openfreemap.org/styles/dark' };
export const ATTR_VETTORIALE =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>, dati &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

// Lo stile mostra i nomi in inglese ("Italy", "Tuscany"): si usa name:it, altrimenti il nome locale
const NOME_ITALIANO = ['coalesce', ['get', 'name:it'], ['get', 'name']];
function inItaliano(l) {
  const testo = l.layout?.['text-field'];
  if (!JSON.stringify(testo ?? '').includes('name_en')) return l;
  return { ...l, layout: { ...l.layout, 'text-field': NOME_ITALIANO } };
}

const stiliInCorso = new Map();
function stili(variante = 'chiaro') {
  const url = STILI[variante] ?? STILI.chiaro;
  if (!stiliInCorso.has(url)) stiliInCorso.set(url, scaricaStile(url));
  return stiliInCorso.get(url);
}
function scaricaStile(url) {
  return fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`stile: risposta ${r.status}`))))
    .then((s) => ({
      base: { ...s, layers: s.layers.filter((l) => l.type !== 'symbol') },
      // solo le scritte, su fondo trasparente, con i nomi in italiano dove esistono
      etichette: { ...s, layers: s.layers.filter((l) => l.type === 'symbol').map(inItaliano) },
      // solo sentieri, mulattiere e carrarecce (anche non segnati), su fondo trasparente
      sentieri: { ...s, layers: [] },
    }))
    .catch((e) => {
      stiliInCorso.delete(url);
      throw e;
    });
}

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

// Restituisce { base, etichette } come livelli Leaflet, oppure lancia un errore (offline, niente WebGL)
export async function creaBaseVettoriale(variante = 'chiaro') {
  const { base, etichette } = await preparaLibreria(variante);
  return {
    base: L.maplibreGL({ style: base, attributionControl: { customAttribution: ATTR_VETTORIALE } }),
    etichette: L.maplibreGL({ style: etichette, pane: 'etichette', attributionControl: false, interactive: false }),
  };
}

// Tutti i sentieri di OpenStreetMap (path, footway, bridleway, gradini e carrarecce), anche quelli
// che non fanno parte di un percorso segnato: puntini marroni (le carrarecce a tratti) con un bordo
// (diversi dai tratteggi rossi dei percorsi segnati di Waymarked), così restano
// leggibili sopra la heatmap e su ogni mappa di base. I percorsi segnati sono sopra (Waymarked e
// le nostre tracce). scuro: colori per le basi scure (scura, satellitare).
export const COLORI_SENTIERI = { chiaro: { linea: '#8a5a2b', bordo: 'rgba(255,255,255,0.85)' }, scuro: { linea: '#f0c27a', bordo: 'rgba(11,16,18,0.85)' } };
export function stileSentieri(sorgenti, scuro = false) {
  const c = COLORI_SENTIERI[scuro ? 'scuro' : 'chiaro'];
  const filtro = (classi, sottoclassi = null) => [
    'all',
    ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
    ['match', ['get', 'class'], classi, true, false],
    ...(sottoclassi ? [['match', ['to-string', ['get', 'subclass']], sottoclassi, true, false]] : []),
  ];
  // zoom di MapLibre (uno meno di quello della mappa): 12 = 13 sulla mappa
  const larghezza = (k) => ['interpolate', ['linear'], ['zoom'], 12, 1.1 * k, 14, 1.8 * k, 16, 2.6 * k, 18, 3.6 * k];
  const coppia = (id, f, tratteggio) => [
    { id: `${id}-bordo`, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12, filter: f, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.bordo, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 14, 4, 16, 5.2, 18, 7] } },
    { id, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12, filter: f, layout: { 'line-join': 'round', 'line-cap': tratteggio[0] < 1 ? 'round' : 'butt' }, paint: { 'line-color': c.linea, 'line-width': larghezza(tratteggio[0] < 1 ? 1.3 : 1), 'line-dasharray': tratteggio } },
  ];
  return {
    version: 8,
    sources: { openmaptiles: sorgenti.openmaptiles },
    layers: [
      ...coppia('orme-carrarecce', filtro(['track']), [3, 2]),
      ...coppia('orme-sentieri', filtro(['path'], ['path', 'footway', 'bridleway', 'steps', '']), [0.1, 1.8]),
      // i nomi dei sentieri, invisibili: servono al tocco (il foglio si apre subito con il nome)
      { id: 'orme-nomi', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 12, filter: ['match', ['get', 'class'], ['path', 'track'], true, false], paint: { 'line-opacity': 0, 'line-width': 8 } },
    ],
  };
}

// Livello Leaflet con tutti i sentieri, per qualunque base (anche quelle a immagini)
export async function creaSentieriVettoriali(scuro = false) {
  const { base } = await preparaLibreria(scuro ? 'scuro' : 'chiaro');
  const livello = L.maplibreGL({ style: stileSentieri(base.sources, scuro), pane: 'sentieriVettoriali', attributionControl: false, interactive: false });
  // un problema dello stile o delle tile non deve passare in silenzio
  livello.on('add', () => livello.getMaplibreMap?.()?.on('error', (e) => console.warn('Sentieri vettoriali', e.error?.message ?? e)));
  if (import.meta.env.DEV) globalThis.__sentieriVettoriali = livello;
  return livello;
}
