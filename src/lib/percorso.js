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
