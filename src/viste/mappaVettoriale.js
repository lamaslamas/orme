// Mappa di base vettoriale (OpenFreeMap, dati OpenStreetMap: gratuita, senza chiavi).
// Due copie dello stesso stile: la base senza scritte sotto le tracce e le sole scritte
// (nomi di luoghi, vette, punti d'interesse) in un livello sopra le tracce.
// La libreria MapLibre si carica solo quando serve.
import L from 'leaflet';

const STILE = 'https://tiles.openfreemap.org/styles/liberty';
export const ATTR_VETTORIALE =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>, dati &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

let stiliInCorso = null;
function stili() {
  stiliInCorso ??= fetch(STILE)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`stile: risposta ${r.status}`))))
    .then((s) => ({
      base: { ...s, layers: s.layers.filter((l) => l.type !== 'symbol') },
      // solo le scritte, su fondo trasparente
      etichette: { ...s, layers: s.layers.filter((l) => l.type === 'symbol') },
    }))
    .catch((e) => {
      stiliInCorso = null;
      throw e;
    });
  return stiliInCorso;
}

// Restituisce { base, etichette } come livelli Leaflet, oppure lancia un errore (offline, niente WebGL)
export async function creaBaseVettoriale() {
  await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
  await import('@maplibre/maplibre-gl-leaflet');
  const { base, etichette } = await stili();
  return {
    base: L.maplibreGL({ style: base, attributionControl: { customAttribution: ATTR_VETTORIALE } }),
    etichette: L.maplibreGL({ style: etichette, pane: 'etichette', attributionControl: false, interactive: false }),
  };
}
