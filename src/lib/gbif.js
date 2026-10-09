// GBIF: osservazioni di fauna da tutte le fonti insieme (iNaturalist, eBird, Observation.org,
// atlanti, musei…), ognuna una sola volta. API libera, senza chiavi. Ogni osservazione ha la
// sua licenza (CC0, CC BY o CC BY-NC) e la sua fonte, che l'app mostra quando la si apre.
// Dei nomi degli osservatori si tiene solo un codice anonimo, per contare le persone diverse.
import { TAXON_GBIF, ANIMALI } from './costanti.js';
import { STAGIONI, SPECIE_RARE } from './inaturalist.js';

export const API_GBIF = 'https://api.gbif.org/v1';
export const MAPPE_GBIF = 'https://api.gbif.org/v2/map/occurrence/adhoc';
// oltre questa incertezza la posizione vale solo per la zona (come le posizioni sfumate)
export const INCERTEZZA_MAX_M = 1000;

const PER_CHIAVE = new Map(Object.entries(TAXON_GBIF).map(([k, v]) => [v, k]));

// Parametri comuni a mappe e ricerche. filtri: { specie: 'rare' | chiave animale, stagione, anni }
export function parametriGbif(filtri = {}, oggi = new Date()) {
  const p = new URLSearchParams();
  // 'rare' = la lista della heatmap; 'tutte' = tutte le specie di Orme; altrimenti un animale
  const chiavi = filtri.specie === 'tutte' ? Object.keys(TAXON_GBIF) : !filtri.specie || filtri.specie === 'rare' ? SPECIE_RARE : [filtri.specie];
  const taxa = chiavi.map((k) => TAXON_GBIF[k]).filter(Boolean);
  // mai una ricerca senza specie: scaricherebbe ogni essere vivente della zona
  if (!taxa.length) throw new Error(`Specie sconosciuta per GBIF: ${filtri.specie}`);
  for (const t of taxa) p.append('taxonKey', String(t));
  for (const m of STAGIONI[filtri.stagione]?.mesi ?? []) p.append('month', String(m));
  if (filtri.anni > 0) p.set('year', `${oggi.getFullYear() - filtri.anni},${oggi.getFullYear()}`);
  p.set('occurrenceStatus', 'PRESENT');
  p.set('hasGeospatialIssue', 'false');
  return p;
}

// Sotto questo zoom (scala nazionale) la heatmap coprirebbe tutto: si mostra da regione/parco in giù
export const ZOOM_MINIMO_HEATMAP = 8;

// Tile della heatmap (densità di tutte le fonti)
export function urlTileGbif(filtri, oggi) {
  const p = parametriGbif(filtri, oggi);
  p.set('srs', 'EPSG:3857');
  // esagoni piccoli colorati per densità (dal rosa al rosso, come la heatmap di iNaturalist)
  p.set('style', 'iNaturalist.poly');
  p.set('bin', 'hex');
  p.set('hexPerTile', '40');
  return `${MAPPE_GBIF}/{z}/{x}/{y}@1x.png?${p}`;
}

// Osservazioni in un riquadro [sud, ovest, nord, est]
export function urlOsservazioniGbif(riquadro, filtri, { limite = 300, scarto = 0, oggi } = {}) {
  const p = parametriGbif(filtri, oggi);
  const [s, o, n, e] = riquadro;
  p.set('decimalLatitude', `${s.toFixed(5)},${n.toFixed(5)}`);
  p.set('decimalLongitude', `${o.toFixed(5)},${e.toFixed(5)}`);
  p.set('hasCoordinate', 'true');
  p.set('limit', String(limite));
  if (scarto) p.set('offset', String(scarto));
  return `${API_GBIF}/occurrence/search?${p}`;
}

// Nome breve della fonte: "eBird", "iNaturalist", "Observation.org"…
export function nomeFonte(dataset = '') {
  if (/inaturalist/i.test(dataset)) return 'iNaturalist';
  if (/ebird/i.test(dataset)) return 'eBird';
  if (/observation\.org/i.test(dataset)) return 'Observation.org';
  if (/naturgucker/i.test(dataset)) return 'naturgucker';
  if (/airone|wintering birds in italy/i.test(dataset)) return 'Atlante AIRONE';
  return dataset.length > 40 ? `${dataset.slice(0, 38)}…` : dataset || 'GBIF';
}

export function codiceAnonimo(testo) {
  let h = 2166136261;
  for (const c of `orme:${testo}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}

const LICENZE = { 'by-nc': 'CC BY-NC', by: 'CC BY', zero: 'CC0', 'by-sa': 'CC BY-SA' };
function licenzaBreve(url = '') {
  const m = String(url).match(/licenses\/(by-nc|by-sa|by)\/|publicdomain\/(zero)/i);
  return m ? LICENZE[(m[1] ?? m[2]).toLowerCase()] : null;
}

// Il nostro animale per un'osservazione GBIF (anche sottospecie: si guardano tutti i livelli)
export function animaleGbif(o) {
  for (const k of [o.taxonKey, o.acceptedTaxonKey, o.speciesKey, o.genusKey]) if (PER_CHIAVE.has(k)) return PER_CHIAVE.get(k);
  return null;
}

// Dalla risposta API alle osservazioni (nessun nome di osservatore salvato)
export function interpretaGbif(json) {
  return (json?.results ?? [])
    .map((o) => {
      const animale = animaleGbif(o);
      const foto = (o.media ?? []).find((m) => m.type === 'StillImage' && m.identifier && licenzaBreve(m.license));
      const incertezza = o.coordinateUncertaintyInMeters;
      return {
        id: o.key,
        animale,
        specie: animale ? ANIMALI[animale] : o.vernacularName ?? o.species ?? o.scientificName ?? 'Specie non indicata',
        nomeScientifico: o.species ?? o.scientificName ?? '',
        data: o.eventDate ? String(o.eventDate).slice(0, 10) : null,
        lat: Number.isFinite(o.decimalLatitude) ? o.decimalLatitude : null,
        lon: Number.isFinite(o.decimalLongitude) ? o.decimalLongitude : null,
        // posizione approssimata (o sfumata di proposito per le specie protette): vale solo per la zona.
        // Senza precisione indicata vale solo per la zona, tranne iNaturalist (che sfuma sempre
        // dichiarandolo, con un'incertezza di decine di km)
        sfumata: Number.isFinite(incertezza) ? incertezza > INCERTEZZA_MAX_M : !/inaturalist/i.test(o.datasetName ?? ''),
        fonte: nomeFonte(o.datasetName),
        licenza: licenzaBreve(o.license),
        foto: foto ? { url: foto.identifier, attribuzione: [foto.rightsHolder ?? foto.creator, licenzaBreve(foto.license)].filter(Boolean).join(' · '), licenza: licenzaBreve(foto.license) } : null,
        url: /^https?:\/\//.test(o.references ?? '') ? o.references : `https://www.gbif.org/occurrence/${o.key}`,
        // solo per contare le persone diverse: un codice anonimo, mai il nome
        osservatore: o.recordedBy ? codiceAnonimo(o.recordedBy) : null,
      };
    })
    .filter((o) => o.lat != null && o.lon != null);
}
