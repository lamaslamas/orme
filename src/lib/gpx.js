// Legge un file GPX e restituisce un MultiLineString GeoJSON.
// Le coordinate sono [lon, lat] oppure [lon, lat, quota] se il GPX ha le quote.
// Usa le tracce (trk); se non ci sono, usa le rotte (rte).
export function leggiGpx(testo) {
  const doc = new DOMParser().parseFromString(testo, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Il file non è un GPX valido.');
  }
  if (doc.documentElement.localName !== 'gpx') {
    throw new Error('Il file non è un GPX.');
  }

  const punto = (el) => {
    const lat = Number(el.getAttribute('lat'));
    const lon = Number(el.getAttribute('lon'));
    if (!(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
    // la quota (ele) è facoltativa
    const eleEl = [...el.children].find((c) => c.localName === 'ele');
    const ele = eleEl ? Number(eleEl.textContent) : NaN;
    return Number.isFinite(ele) && eleEl.textContent.trim() !== ''
      ? [round(lon), round(lat), Math.round(ele * 10) / 10]
      : [round(lon), round(lat)];
  };
  // Cerca per nome locale, qualunque sia il namespace del GPX
  const figli = (radice, nome) => [...radice.getElementsByTagName('*')].filter((el) => el.localName === nome);
  const daElementi = (elementi) => [...elementi].map(punto).filter(Boolean);

  const linee = [];
  for (const segmento of figli(doc, 'trkseg')) {
    linee.push(daElementi(figli(segmento, 'trkpt')));
  }
  if (!linee.some((l) => l.length > 1)) {
    for (const rotta of figli(doc, 'rte')) {
      linee.push(daElementi(figli(rotta, 'rtept')));
    }
  }
  const valide = linee.filter((l) => l.length > 1);
  if (!valide.length) throw new Error('Nel file GPX non ci sono tracce o rotte.');

  const contenitore = figli(doc, 'trk')[0] ?? figli(doc, 'rte')[0] ?? figli(doc, 'metadata')[0];
  const nomeEl = contenitore && [...contenitore.children].find((el) => el.localName === 'name');
  const nome = nomeEl?.textContent?.trim() ?? '';
  return { geojson: { type: 'MultiLineString', coordinates: valide }, nome };
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}
