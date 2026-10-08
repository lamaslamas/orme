// Disegno di una traccia ben riconoscibile: bordo bianco, frecce del verso
// di percorrenza, etichette "Partenza" e "Arrivo".
import L from 'leaflet';
import { percorsoSentiero, estremiTraccia, frecceLungoPercorso } from '../lib/tracce.js';
import { COLORI } from './colori.js';

const latlng = (p) => [p[1], p[0]];

// Pin a goccia: verde la partenza, nero l'arrivo; per un anello verde con il centro nero
const COLORI_PIN = { partenza: ['#16a34a', '#ffffff'], arrivo: ['#111827', '#ffffff'], anello: ['#16a34a', '#111827'] };

export function pin(tipo) {
  const [fondo, centro] = COLORI_PIN[tipo] ?? COLORI_PIN.partenza;
  return L.divIcon({
    className: 'pin-traccia',
    html: `<svg viewBox="0 0 24 32" width="26" height="34" aria-hidden="true"><path d="M12 1C5.9 1 1 5.8 1 11.8 1 20 12 31 12 31s11-11 11-19.2C23 5.8 18.1 1 12 1z" fill="${fondo}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="11.5" r="4.2" fill="${centro}"/></svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 33],
  });
}

const TITOLI_PIN = { partenza: 'Partenza', arrivo: 'Arrivo', anello: 'Partenza e arrivo' };

export function marcatoreEstremo(punto, tipo) {
  return L.marker(latlng(punto), { icon: pin(tipo), keyboard: false, interactive: false, alt: TITOLI_PIN[tipo], title: TITOLI_PIN[tipo] });
}

export function freccia(punto, direzione, colore) {
  return L.marker(latlng(punto), {
    icon: L.divIcon({
      className: 'freccia-verso',
      html: `<svg viewBox="0 0 22 22" width="22" height="22" style="transform:rotate(${direzione}deg)"><circle cx="11" cy="11" r="9.5" fill="${colore}" stroke="#fff" stroke-width="2"/><path d="M11 5.5 15.5 14 11 11.5 6.5 14z" fill="#fff"/></svg>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
    keyboard: false,
    interactive: false,
  });
}

// Restituisce un gruppo di livelli; opzioni: colore, spessore, tratteggio, frecce, estremi
export function disegnaPercorso(geojson, { colore = COLORI.traccia, spessore = 5, tratteggio = null, frecce = true, estremi = true } = {}) {
  const gruppo = L.featureGroup();
  const { pezzi } = percorsoSentiero(geojson);
  const linee = pezzi.map((l) => l.map(latlng));
  L.polyline(linee, { color: '#fff', weight: spessore + 4, opacity: 0.9, interactive: false }).addTo(gruppo);
  L.polyline(linee, { color: colore, weight: spessore, opacity: 0.95, dashArray: tratteggio, interactive: false }).addTo(gruppo);
  if (frecce) {
    for (const f of frecceLungoPercorso(pezzi, 8)) freccia(f.punto, f.direzione, colore).addTo(gruppo);
  }
  if (estremi) {
    const e = estremiTraccia(geojson);
    if (e?.anello) marcatoreEstremo(e.inizio, 'anello').addTo(gruppo);
    else if (e) {
      marcatoreEstremo(e.fine, 'arrivo').addTo(gruppo);
      marcatoreEstremo(e.inizio, 'partenza').addTo(gruppo);
    }
  }
  return gruppo;
}
