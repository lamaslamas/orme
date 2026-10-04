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
