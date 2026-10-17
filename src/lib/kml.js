// Legge un file KML: ogni Placemark con una linea (LineString, anche dentro MultiGeometry, o gx:Track)
// è un percorso. I punti isolati e i poligoni si ignorano. Coordinate [lon, lat] o [lon, lat, quota].
const arrotonda = (n) => Math.round(n * 1e6) / 1e6;

function punto(lon, lat, quota) {
  if (!(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
  return Number.isFinite(quota) && quota !== 0 ? [arrotonda(lon), arrotonda(lat), Math.round(quota * 10) / 10] : [arrotonda(lon), arrotonda(lat)];
}

// "lon,lat,alt lon,lat,alt …" (separati da spazi o a capo)
function daCoordinates(testo) {
  return String(testo ?? '')
    .trim()
    .split(/\s+/)
    .map((c) => {
      const [lon, lat, alt] = c.split(',').map(Number);
      return punto(lon, lat, alt);
    })
    .filter(Boolean);
}

// → [{ nome, geojson }]; errore se non è un KML
export function leggiKml(testo) {
  const doc = new DOMParser().parseFromString(testo, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Il file non è un KML valido.');
  if (doc.documentElement.localName !== 'kml') throw new Error('Il file non è un KML.');
  const figli = (radice, nome) => [...radice.getElementsByTagName('*')].filter((el) => el.localName === nome);
  const risultati = [];
  for (const pm of figli(doc, 'Placemark')) {
    const linee = [];
    for (const ls of figli(pm, 'LineString')) {
      const c = figli(ls, 'coordinates')[0];
      if (c) linee.push(daCoordinates(c.textContent));
    }
    // gx:Track: una riga "lon lat alt" per punto
    for (const tr of figli(pm, 'Track')) {
      linee.push(figli(tr, 'coord').map((c) => { const [lon, lat, alt] = c.textContent.trim().split(/\s+/).map(Number); return punto(lon, lat, alt); }).filter(Boolean));
    }
    const valide = linee.filter((l) => l.length > 1);
    if (!valide.length) continue;
    const nomeEl = [...pm.children].find((el) => el.localName === 'name');
    risultati.push({ nome: nomeEl?.textContent?.trim() ?? '', geojson: { type: 'MultiLineString', coordinates: valide } });
  }
  if (!risultati.length) throw new Error('Nel file KML non ci sono percorsi (solo punti o aree).');
  return risultati;
}
