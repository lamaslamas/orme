// GBIF: osservazioni di fauna da tutte le fonti insieme (iNaturalist, eBird, Observation.org,
// atlanti, musei…), ognuna una sola volta. API libera, senza chiavi. Ogni osservazione ha la
// sua licenza (CC0, CC BY o CC BY-NC) e la sua fonte, che l'app mostra quando la si apre.
// Dei nomi degli osservatori si tiene solo un codice anonimo, per contare le persone diverse.
import { TAXON_GBIF, ANIMALI, SPECIE_SOLO_INTORNO, CLASSI_FAUNA } from './costanti.js';
import { taxaDeiGruppi } from './gruppiFauna.js';
import { STAGIONI, SPECIE_RARE } from './inaturalist.js';

export const API_GBIF = 'https://api.gbif.org/v1';
// specie minacciate (Lista Rossa IUCN) tra mammiferi e uccelli: in "Intorno a me" si aggiungono a parte
export { CATEGORIE_RARE as CATEGORIE_MINACCIATE } from './costanti.js';
import { CATEGORIE_RARE } from './costanti.js';
// oltre questa incertezza la posizione vale solo per la zona (come le posizioni sfumate)
export const INCERTEZZA_MAX_M = 1000;

const PER_CHIAVE = new Map(Object.entries(TAXON_GBIF).map(([k, v]) => [v, k]));

// Parametri comuni a mappe e ricerche. filtri: { specie: 'rare' | chiave animale, stagione, anni }
export function parametriGbif(filtri = {}, oggi = new Date()) {
  const p = new URLSearchParams();
  // 'rare' = la lista della heatmap; 'tutte' = le specie dei parchi; 'intorno' = anche quelle di
  // "Intorno a me" (fenicottero, riccio…); altrimenti un animale
  // 'notevoli' = gli animali imperdibili (gruppi qui sopra); 'minacciate' = mammiferi e uccelli a rischio
  const chiavi =
    filtri.specie === 'intorno'
      ? Object.keys(TAXON_GBIF)
      : filtri.specie === 'tutte'
        ? Object.keys(TAXON_GBIF).filter((k) => !SPECIE_SOLO_INTORNO.includes(k))
        : !filtri.specie || filtri.specie === 'rare'
          ? SPECIE_RARE
          : [filtri.specie];
  // una specie scelta in "Cosa vedere qui" (anche fuori dalla lista di Orme): per nome scientifico
  if (filtri.taxon?.scientifico) p.set('scientificName', filtri.taxon.scientifico);
  const notevoli = filtri.specie === 'notevoli' ? taxaDeiGruppi(filtri, 'gbif') : [];
  // solo "rare" tra i gruppi: le minacciate tra mammiferi e uccelli
  const minacciate = filtri.specie === 'minacciate' || (filtri.specie === 'notevoli' && !notevoli.length);
  const taxa = filtri.taxon?.scientifico
    ? CLASSI_FAUNA.gbif
    : minacciate
      ? CLASSI_FAUNA.gbif
      : filtri.specie === 'notevoli'
        ? notevoli
        : chiavi.map((k) => TAXON_GBIF[k]).filter(Boolean);
  if (minacciate && !filtri.taxon) for (const c of CATEGORIE_RARE) p.append('iucnRedListCategory', c);
  // mai una ricerca senza specie: scaricherebbe ogni essere vivente della zona
  if (!taxa.length) throw new Error(`Specie sconosciuta per GBIF: ${filtri.specie}`);
  for (const t of taxa) p.append('taxonKey', String(t));
  for (const m of STAGIONI[filtri.stagione]?.mesi ?? []) p.append('month', String(m));
  if (filtri.anni > 0) p.set('year', `${oggi.getFullYear() - filtri.anni},${oggi.getFullYear()}`);
  p.set('occurrenceStatus', 'PRESENT');
  p.set('hasGeospatialIssue', 'false');
  return p;
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
        // per l'icona delle specie fuori dalla lista: uccello o mammifero
        classe: o.class ?? null,
        ordine: o.order ?? null,
        famiglia: o.family ?? null,
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
        // la pagina su GBIF (di solito senza verifiche "non sei un robot"); quella originale a parte
        url: `https://www.gbif.org/occurrence/${o.key}`,
        originale: /^https?:\/\//.test(o.references ?? '') ? o.references : null,
        luogo: o.locality ?? o.verbatimLocality ?? null,
        // solo per contare le persone diverse: un codice anonimo, mai il nome
        osservatore: o.recordedBy ? codiceAnonimo(o.recordedBy) : null,
      };
    })
    .filter((o) => o.lat != null && o.lon != null);
}

// Icona per una specie fuori dalla lista di Orme: la più vicina per gruppo (rapaci, gufi, ricci…)
const ICONA_FAMIGLIA = { Phoenicopteridae: 'fenicottero', Erinaceidae: 'riccio', Mustelidae: 'tasso', Canidae: 'volpe', Cervidae: 'cervo', Suidae: 'cinghiale', Felidae: 'gatto_selvatico', Ciconiidae: 'cicogna_nera' };
const ICONA_ORDINE = { Accipitriformes: 'aquila_reale', Falconiformes: 'falco_grillaio', Strigiformes: 'gufo_reale' };
export function iconaPerOsservazione(o) {
  return o.icona ?? o.animale ?? ICONA_FAMIGLIA[o.famiglia] ?? ICONA_ORDINE[o.ordine] ?? (o.classe === 'Aves' ? 'uccello' : 'mammifero');
}
