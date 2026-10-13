// Stili MapLibre della mappa (puri, con i test): un solo stile per le basi vettoriali, con la base,
// tutti i sentieri di OpenStreetMap e le scritte, in quest'ordine. Una mappa WebGL sola invece di tre
// (base, sentieri, scritte): sul telefono ogni mappa WebGL si ridisegna per conto suo a ogni movimento.

// Lo stile mostra i nomi in inglese ("Italy", "Tuscany"): si usa name:it, altrimenti il nome locale
const NOME_ITALIANO = ['coalesce', ['get', 'name:it'], ['get', 'name']];
export function inItaliano(l) {
  const testo = l.layout?.['text-field'];
  if (!JSON.stringify(testo ?? '').includes('name_en')) return l;
  return { ...l, layout: { ...l.layout, 'text-field': NOME_ITALIANO } };
}

// Tutti i sentieri di OpenStreetMap (path, footway, bridleway, gradini e carrarecce), anche quelli
// che non fanno parte di un percorso segnato: puntini marroni (le carrarecce a tratti) con un bordo
// (diversi dai tratteggi rossi dei percorsi segnati di Waymarked), così restano
// leggibili sopra la heatmap e su ogni mappa di base. I percorsi segnati sono sopra (Waymarked e
// le nostre tracce). scuro: colori per le basi scure (scura, satellitare).
export const COLORI_SENTIERI = { chiaro: { linea: '#8a5a2b', bordo: 'rgba(255,255,255,0.85)' }, scuro: { linea: '#f0c27a', bordo: 'rgba(11,16,18,0.85)' } };
export function stileSentieri(sorgenti, scuro = false) {
  const c = COLORI_SENTIERI[scuro ? 'scuro' : 'chiaro'];
  const filtro = (classi, sottoclassi = null) => [
    'all',
    ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
    ['match', ['get', 'class'], classi, true, false],
    ...(sottoclassi ? [['match', ['to-string', ['get', 'subclass']], sottoclassi, true, false]] : []),
  ];
  // zoom di MapLibre (uno meno di quello della mappa): 12 = 13 sulla mappa
  const larghezza = (k) => ['interpolate', ['linear'], ['zoom'], 12, 1.1 * k, 14, 1.8 * k, 16, 2.6 * k, 18, 3.6 * k];
  const coppia = (id, f, tratteggio) => [
    { id: `${id}-bordo`, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12, filter: f, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.bordo, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 14, 4, 16, 5.2, 18, 7] } },
    { id, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12, filter: f, layout: { 'line-join': 'round', 'line-cap': tratteggio[0] < 1 ? 'round' : 'butt' }, paint: { 'line-color': c.linea, 'line-width': larghezza(tratteggio[0] < 1 ? 1.3 : 1), 'line-dasharray': tratteggio } },
  ];
  return {
    version: 8,
    sources: { openmaptiles: sorgenti.openmaptiles },
    layers: [
      ...coppia('orme-carrarecce', filtro(['track']), [3, 2]),
      ...coppia('orme-sentieri', filtro(['path'], ['path', 'footway', 'bridleway', 'steps', '']), [0.1, 1.8]),
      // i nomi dei sentieri, invisibili: servono al tocco (il foglio si apre subito con il nome)
      { id: 'orme-nomi', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 12, filter: ['match', ['get', 'class'], ['path', 'track'], true, false], paint: { 'line-opacity': 0, 'line-width': 8 } },
    ],
  };
}

// livelli dei sentieri dentro lo stile (si accendono e spengono senza un'altra mappa)
export const LIVELLI_SENTIERI = ['orme-carrarecce-bordo', 'orme-carrarecce', 'orme-sentieri-bordo', 'orme-sentieri', 'orme-nomi'];
export const visibilita = (acceso) => (acceso ? 'visible' : 'none');

// Base + sentieri + scritte in un solo stile. stile: quello di OpenFreeMap; sentieri: accesi o no
export function stileUnico(stile, { scuro = false, sentieri = true } = {}) {
  const tracciati = stileSentieri(stile.sources, scuro).layers.map((l) => ({ ...l, layout: { ...l.layout, visibility: visibilita(sentieri) } }));
  return {
    ...stile,
    layers: [...stile.layers.filter((l) => l.type !== 'symbol'), ...tracciati, ...stile.layers.filter((l) => l.type === 'symbol').map(inItaliano)],
  };
}
