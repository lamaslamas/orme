// Animali che si possono incontrare lungo un percorso secondo le osservazioni verificate
// (GBIF: iNaturalist, eBird, Observation.org e le altre fonti; un tempo solo iNaturalist).
// Due livelli, perché iNaturalist sposta di proposito la posizione delle specie protette:
// - "percorso": posizione precisa entro 500 m dalla traccia;
// - "zona": posizione sfumata (orso, lupo, camoscio…) o comunque nei dintorni, entro circa 5 km.
// Si salvano solo i conteggi: niente nomi né codici degli osservatori.
import { TAXON_INATURALIST } from './costanti.js';
import { distanzaDallaTracciaM } from './geo.js';
import { mesiMigliori } from './inaturalistTraccia.js';
import { puntoNelPoligono } from './confini.js';

export const RAGGIO_PERCORSO_M = 500;
export const RAGGIO_ZONA_M = 5000;
export const MINIMO_OSSERVAZIONI = 3;
export const MINIMO_PERSONE = 2;

const PER_TAXON = new Map(Object.entries(TAXON_INATURALIST).map(([k, t]) => [t.id, k]));
export const TAXA_FAUNA = Object.values(TAXON_INATURALIST).map((t) => t.id);

// Il nostro animale per un taxon iNaturalist (anche sottospecie: si guardano gli antenati)
export function animaleDelTaxon(taxon) {
  if (!taxon) return null;
  for (const id of [taxon.id, ...[...(taxon.ancestor_ids ?? [])].reverse()]) if (PER_TAXON.has(id)) return PER_TAXON.get(id);
  return null;
}

// Un'osservazione in forma comune, da GBIF (già interpretata: src/lib/gbif.js) o dall'API di
// iNaturalist (grezza). null se non è una delle nostre specie o manca la posizione.
export function osservazioneComune(o) {
  if (o && 'animale' in o && 'lat' in o) {
    if (!o.animale || !Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return null;
    return { animale: o.animale, lat: o.lat, lon: o.lon, sfumata: Boolean(o.sfumata), persona: o.osservatore ?? null, data: o.data ?? null };
  }
  if (o?.quality_grade && o.quality_grade !== 'research') return null;
  const animale = animaleDelTaxon(o?.taxon);
  const [lat, lon] = String(o?.location ?? ',').split(',').map(Number);
  if (!animale || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { animale, lat, lon, sfumata: Boolean(o.obscured), persona: o.user?.id ?? null, data: o.observed_on ?? null };
}

// risultati: osservazioni (GBIF o iNaturalist); geojson: traccia del percorso
export function faunaDalleOsservazioni(risultati, geojson) {
  const perAnimale = new Map();
  for (const grezza of risultati ?? []) {
    const o = osservazioneComune(grezza);
    if (!o) continue;
    const { animale, lat, lon } = o;
    const d = distanzaDallaTracciaM([lon, lat], geojson);
    const vicino = !o.sfumata && d <= RAGGIO_PERCORSO_M;
    if (!vicino && d > RAGGIO_ZONA_M + (o.sfumata ? 10_000 : 0)) continue; // le sfumate possono essere spostate di ~10 km
    const a = perAnimale.get(animale) ?? { percorso: { n: 0, persone: new Set(), mesi: Array(12).fill(0) }, zona: { n: 0, persone: new Set(), mesi: Array(12).fill(0) } };
    for (const livello of vicino ? ['percorso', 'zona'] : ['zona']) {
      const l = a[livello];
      l.n++;
      if (o.persona != null) l.persone.add(o.persona);
      if (o.data) l.mesi[Number(o.data.slice(5, 7)) - 1]++;
    }
    perAnimale.set(animale, a);
  }
  const specie = [];
  for (const [animale, a] of perAnimale) {
    const ok = (l) => l.n >= MINIMO_OSSERVAZIONI && l.persone.size >= MINIMO_PERSONE;
    const livello = ok(a.percorso) ? 'percorso' : ok(a.zona) ? 'zona' : null;
    if (!livello) continue;
    const l = a[livello];
    // perMese: osservazioni di ogni mese (gen…dic), per il giudizio "nel periodo attuale"
    specie.push({ animale, livello, osservazioni: l.n, persone: l.persone.size, mesi: mesiMigliori(l.mesi), perMese: l.mesi });
  }
  return specie.sort((x, y) => (x.livello === y.livello ? y.osservazioni - x.osservazioni : x.livello === 'percorso' ? -1 : 1));
}

// Animali di un percorso: quelli delle associazioni più quelli di iNaturalist
export function animaliPossibili(s) {
  return [...new Set([...(s.animali ?? []), ...(s.faunaInat?.specie ?? []).map((x) => x.animale)])];
}

// Un percorso è "di osservazione" se lo dice l'archivio (uscite delle associazioni)
// o se iNaturalist ha osservazioni verificate proprio lungo il percorso
export const conFaunaLungoIlPercorso = (s) => (s.faunaInat?.specie ?? []).some((x) => x.livello === 'percorso');

// Riepilogo della fauna di un parco: osservazioni verificate dentro il confine (o, per quelle
// con posizione sfumata, dentro il riquadro del parco). Stesse soglie dei percorsi.
// anelli: confine [[lon, lat]] (se manca si usa solo il riquadro); bbox: [sud, ovest, nord, est]
export function faunaDelParco(risultati, { anelli = null, bbox }) {
  const [s, o, n, e] = bbox;
  const nelRiquadro = (lat, lon) => lat >= s && lat <= n && lon >= o && lon <= e;
  const perAnimale = new Map();
  let totale = 0;
  for (const grezza of risultati ?? []) {
    const x = osservazioneComune(grezza);
    if (!x) continue;
    const { animale, lat, lon } = x;
    if (!nelRiquadro(lat, lon)) continue;
    if (!x.sfumata && anelli?.length && !puntoNelPoligono([lon, lat], anelli)) continue;
    totale++;
    const a = perAnimale.get(animale) ?? { n: 0, persone: new Set(), mesi: Array(12).fill(0), sfumate: 0 };
    a.n++;
    if (x.sfumata) a.sfumate++;
    if (x.persona != null) a.persone.add(x.persona);
    if (x.data) a.mesi[Number(x.data.slice(5, 7)) - 1]++;
    perAnimale.set(animale, a);
  }
  const specie = [...perAnimale]
    .filter(([, a]) => a.n >= MINIMO_OSSERVAZIONI && a.persone.size >= MINIMO_PERSONE)
    .map(([animale, a]) => ({ animale, osservazioni: a.n, persone: a.persone.size, mesi: mesiMigliori(a.mesi), sfumate: a.sfumate }))
    .sort((x, y) => y.osservazioni - x.osservazioni);
  return { osservazioni: totale, specie };
}

// Mesi di un testo tipo "giu, ago–set" → numeri 1-12
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export function mesiDaTesto(testo) {
  const mesi = new Set();
  for (const parte of String(testo ?? '').split(',')) {
    const [a, b] = parte.trim().split(/[–-]/).map((x) => MESI.indexOf(x.trim()) + 1);
    if (!a) continue;
    if (!b) mesi.add(a);
    else
      for (let m = a; ; m = (m % 12) + 1) {
        mesi.add(m);
        if (m === b) break;
      }
  }
  return mesi;
}

// Possibilità di vedere fauna lungo un percorso, uguale in tutte le liste dell'app:
// - frequenti: molte osservazioni verificate lungo il percorso (o più specie), oppure
//   uscite di osservazione delle associazioni
// - possibili: qualche osservazione lungo il percorso, o molte nella zona
// - occasionali: solo nella zona
// mese (1-12): gli animali osservati di solito in quel mese vengono prima.
// Non è una probabilità statistica: dice quanto spesso sono stati visti, non se li vedrai.
export const POSSIBILITA_FAUNA = {
  frequenti: 'Ricco di fauna',
  possibili: 'Fauna possibile',
  occasionali: 'Fauna nella zona',
};
// "Ricco di fauna": osservazioni lungo il percorso pesate sui km (un sentiero di 26 km ne accumula
// più di uno di 3 km), con un minimo assoluto. Le soglie di qualità per specie (3 osservazioni di
// almeno 2 persone) sono già nel calcolo di faunaInat.
export const DENSITA_RICCO = 1.5; // osservazioni per km
export const MINIMO_RICCO = 8; // osservazioni in tutto lungo il percorso
export const MINIMO_RICCO_SENZA_KM = 15; // se la lunghezza non si conosce

// Il mese e quelli accanto (dicembre e febbraio per gennaio)
export function mesiVicini(mese) {
  return new Set([((mese + 10) % 12) + 1, mese, (mese % 12) + 1]);
}

// Osservazioni di una specie nei mesi scelti: dai conteggi mensili; se mancano (dati calcolati
// prima), tutte se i mesi migliori cadono nel periodo, altrimenti nessuna
function nelPeriodo(x, mesi) {
  if (Array.isArray(x.perMese)) return [...mesi].reduce((n, m) => n + (x.perMese[m - 1] ?? 0), 0);
  return [...mesiDaTesto(x.mesi)].some((m) => mesi.has(m)) ? x.osservazioni : 0;
}

// Periodo migliore per vedere fauna lungo il percorso ("mag–set"), dai conteggi mensili
// delle specie lungo la traccia (o nella zona se lungo la traccia non ce ne sono)
export function periodoMigliore(specie) {
  const base = specie.some((x) => x.livello === 'percorso') ? specie.filter((x) => x.livello === 'percorso') : specie;
  const conMesi = base.filter((x) => Array.isArray(x.perMese));
  if (conMesi.length) return mesiMigliori(Array.from({ length: 12 }, (_, i) => conMesi.reduce((n, x) => n + (x.perMese[i] ?? 0), 0)));
  return [...base].sort((a, b) => b.osservazioni - a.osservazioni)[0]?.mesi ?? '';
}

// km: lunghezza del percorso (di base quella salvata con la fauna o nel sentiero)
// stagione: il giudizio conta solo le osservazioni del mese e di quelli accanto
export function possibilitaFauna(s, mese = null, { km = null, stagione = false } = {}) {
  const tutte = s?.faunaInat?.specie ?? [];
  const associazioni = s?.animali ?? [];
  if (!tutte.length && !associazioni.length) return null;
  const periodo = periodoMigliore(tutte);
  const mesi = stagione && mese ? mesiVicini(mese) : null;
  const inat = mesi ? tutte.map((x) => ({ ...x, osservazioni: nelPeriodo(x, mesi) })).filter((x) => x.osservazioni > 0) : tutte;
  if (!inat.length && !associazioni.length) return null;
  const lungo = inat.filter((x) => x.livello === 'percorso');
  const totale = lungo.reduce((n, x) => n + (x.osservazioni ?? 0), 0);
  const lunghezza = km ?? s.faunaInat?.km ?? (Number.isFinite(s.lunghezzaKm) ? s.lunghezzaKm : null);
  const ricco = lunghezza ? totale >= MINIMO_RICCO && totale / Math.max(lunghezza, 1) >= DENSITA_RICCO : totale >= MINIMO_RICCO_SENZA_KM;
  let livello = 'occasionali';
  if (ricco || (s.osservazione && associazioni.length)) livello = 'frequenti';
  else if (lungo.length || associazioni.length || inat.some((x) => x.osservazioni >= 15)) livello = 'possibili';
  const nelMese = (x) => (mese ? mesiDaTesto(x.mesi).has(mese) : false);
  const ordinate = [
    ...associazioni.map((animale) => ({ animale, peso: 3, mese: false })),
    ...inat.map((x) => ({ animale: x.animale, peso: (x.livello === 'percorso' ? 2 : 1) + Math.min(x.osservazioni, 50) / 100, mese: nelMese(x) })),
  ].sort((a, b) => b.mese - a.mese || b.peso - a.peso);
  const specie = [...new Set(ordinate.map((x) => x.animale))].slice(0, 3);
  return { livello, specie, nelPeriodo: ordinate.some((x) => x.mese), periodo, stagione: Boolean(mesi) };
}
