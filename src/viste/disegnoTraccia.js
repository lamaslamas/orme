// Disegno di una traccia ben riconoscibile: bordo bianco, frecce del verso
// di percorrenza, etichette "Partenza" e "Arrivo".
import L from 'leaflet';
import { percorsoSentiero, estremiTraccia, frecceLungoPercorso } from '../lib/tracce.js';

const latlng = (p) => [p[1], p[0]];

export function etichetta(testo, classe) {
  return L.divIcon({
    className: `estremo ${classe}`,
    html: `<span>${testo}</span>`,
    iconSize: null,
    iconAnchor: [0, 0],
  });
}

export function marcatoreEstremo(punto, testo, classe) {
  return L.featureGroup([
    L.circleMarker(latlng(punto), { radius: 7, color: '#fff', weight: 3, fillColor: classe === 'arrivo' ? '#111827' : '#16a34a', fillOpacity: 1 }),
    L.marker(latlng(punto), { icon: etichetta(testo, classe), keyboard: false, interactive: false }),
  ]);
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
export function disegnaPercorso(geojson, { colore = '#c2410c', spessore = 5, tratteggio = null, frecce = true, estremi = true } = {}) {
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
    if (e?.anello) marcatoreEstremo(e.inizio, 'Partenza e arrivo', 'partenza').addTo(gruppo);
    else if (e) {
      marcatoreEstremo(e.fine, 'Arrivo', 'arrivo').addTo(gruppo);
      marcatoreEstremo(e.inizio, 'Partenza', 'partenza').addTo(gruppo);
    }
  }
  return gruppo;
}
