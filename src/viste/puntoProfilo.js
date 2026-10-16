// Il punto del profilo sulla mappa piccola della scheda (come nel disegno): un cerchio arancione che
// segue il dito sul profilo. La mappa arriva dopo (si crea a fine pagina): mostra() aspetta collega().
import L from 'leaflet';

export function creaPuntoProfilo() {
  const segno = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 3, fillColor: '#ef9f27', fillOpacity: 1, interactive: false });
  let mappa = null;
  return {
    collega(m) {
      mappa = m;
    },
    // p: [lon, lat, quota]
    mostra(p) {
      if (!mappa) return;
      segno.setLatLng([p[1], p[0]]).addTo(mappa);
    },
  };
}
