// Indicazioni per raggiungere la partenza con un'app esterna (Google Maps o altra).
// L'app di navigazione parte dalla posizione attuale del telefono.
import { estremiTraccia } from './tracce.js';

// Partenza: quella inserita a mano, altrimenti l'inizio della traccia
export function puntoDiPartenza(sentiero, traccia) {
  const p = sentiero?.partenza;
  if (Number.isFinite(p?.lat) && Number.isFinite(p?.lon)) return { lat: p.lat, lon: p.lon, fonte: 'manuale' };
  const e = traccia?.geojson ? estremiTraccia(traccia.geojson) : null;
  return e ? { lat: e.inizio[1], lon: e.inizio[0], fonte: 'traccia' } : null;
}

const coord = (n) => Number(n).toFixed(6);

// modo: 'auto' | 'piedi'
export function linkGoogleMaps(punto, modo = 'auto') {
  const viaggio = modo === 'piedi' ? 'walking' : 'driving';
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(punto.lat)},${coord(punto.lon)}&travelmode=${viaggio}`;
}

// Apre l'app di navigazione predefinita su Android
export function linkGeo(punto, etichetta = 'Partenza') {
  return `geo:${coord(punto.lat)},${coord(punto.lon)}?q=${coord(punto.lat)},${coord(punto.lon)}(${encodeURIComponent(etichetta)})`;
}
