// Percorso della sezione Pianifica: caricato da GPX o disegnato seguendo i sentieri.
export function completaPercorso(p) {
  return {
    nome: '',
    note: '',
    origine: 'gpx',
    puntiControllo: [],
    geojson: { type: 'MultiLineString', coordinates: [] },
    terreno: [],
    fonteTerreno: null,
    ...p,
  };
}

export function nuovoIdPercorso(adesso = Date.now()) {
  return `percorso-${adesso.toString(36)}`;
}

// Un percorso importato (GPX, KML) si può modificare direttamente, ma la traccia del file si conserva (una volta sola)
// in `originale`: «Ripristina la traccia originale» la rimette. → { originale } da aggiungere al salvataggio, o {}
export function conservaOriginale(p) {
  if (!p || p.originale || !['gpx', 'kml'].includes(p.origine)) return {};
  return { originale: { origine: p.origine, geojson: p.geojson, terreno: p.terreno ?? [], fonteTerreno: p.fonteTerreno ?? null, aggiornatoTerreno: p.aggiornatoTerreno ?? null } };
}
// il percorso con la traccia originale rimessa (null se non ce n'è una conservata)
export function ripristinaOriginale(p) {
  const o = p?.originale;
  if (!o) return null;
  return { ...p, origine: o.origine, geojson: o.geojson, terreno: o.terreno ?? [], fonteTerreno: o.fonteTerreno ?? null, aggiornatoTerreno: o.aggiornatoTerreno ?? null, puntiControllo: [], originale: null };
}
