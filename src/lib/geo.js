const RAGGIO_TERRA_KM = 6371.0088;

function rad(gradi) {
  return (gradi * Math.PI) / 180;
}

// Distanza tra due punti [lon, lat] in km
export function distanzaKm([lon1, lat1], [lon2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAGGIO_TERRA_KM * Math.asin(Math.sqrt(a));
}

// Lunghezza totale di un MultiLineString GeoJSON in km
export function lunghezzaKm(geojson) {
  let totale = 0;
  for (const linea of geojson?.coordinates ?? []) {
    for (let i = 1; i < linea.length; i++) totale += distanzaKm(linea[i - 1], linea[i]);
  }
  return totale;
}

export function contaPunti(geojson) {
  return (geojson?.coordinates ?? []).reduce((n, linea) => n + linea.length, 0);
}

// Distanza minima (in metri) tra un punto [lon, lat] e un MultiLineString.
// Usa una proiezione piana locale: precisa a sufficienza per poche centinaia di km.
export function distanzaDallaTracciaM(punto, geojson) {
  const [lon0, lat0] = punto;
  const kx = RAGGIO_TERRA_KM * 1000 * Math.cos(rad(lat0)) * (Math.PI / 180);
  const ky = RAGGIO_TERRA_KM * 1000 * (Math.PI / 180);
  const xy = ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky];
  let minimo = Infinity;
  for (const linea of geojson?.coordinates ?? []) {
    for (let i = 0; i < linea.length; i++) {
      const [ax, ay] = xy(linea[i]);
      if (linea.length === 1 || i === linea.length - 1) {
        minimo = Math.min(minimo, Math.hypot(ax, ay));
        continue;
      }
      const [bx, by] = xy(linea[i + 1]);
      const dx = bx - ax;
      const dy = by - ay;
      const lung2 = dx * dx + dy * dy;
      const t = lung2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lung2)) : 0;
      minimo = Math.min(minimo, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return minimo;
}

// Direzione da a verso b in gradi (0 = nord, 90 = est)
export function direzioneGradi([lon1, lat1], [lon2, lat2]) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
