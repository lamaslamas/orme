// Animali che si possono incontrare lungo un percorso secondo iNaturalist (osservazioni verificate).
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

// risultati: osservazioni grezze dell'API di iNaturalist; geojson: traccia del percorso
export function faunaDalleOsservazioni(risultati, geojson) {
  const perAnimale = new Map();
  for (const o of risultati ?? []) {
    if (o.quality_grade && o.quality_grade !== 'research') continue;
    const animale = animaleDelTaxon(o.taxon);
    if (!animale) continue;
    const [lat, lon] = String(o.location ?? ',').split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const d = distanzaDallaTracciaM([lon, lat], geojson);
    const vicino = !o.obscured && d <= RAGGIO_PERCORSO_M;
    if (!vicino && d > RAGGIO_ZONA_M + (o.obscured ? 10_000 : 0)) continue; // le sfumate possono essere spostate di ~10 km
    const a = perAnimale.get(animale) ?? { percorso: { n: 0, persone: new Set(), mesi: Array(12).fill(0) }, zona: { n: 0, persone: new Set(), mesi: Array(12).fill(0) } };
    for (const livello of vicino ? ['percorso', 'zona'] : ['zona']) {
      const l = a[livello];
      l.n++;
      if (o.user?.id != null) l.persone.add(o.user.id);
      if (o.observed_on) l.mesi[Number(o.observed_on.slice(5, 7)) - 1]++;
    }
    perAnimale.set(animale, a);
  }
  const specie = [];
  for (const [animale, a] of perAnimale) {
    const ok = (l) => l.n >= MINIMO_OSSERVAZIONI && l.persone.size >= MINIMO_PERSONE;
    const livello = ok(a.percorso) ? 'percorso' : ok(a.zona) ? 'zona' : null;
    if (!livello) continue;
    const l = a[livello];
    specie.push({ animale, livello, osservazioni: l.n, persone: l.persone.size, mesi: mesiMigliori(l.mesi) });
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
  for (const x of risultati ?? []) {
    if (x.quality_grade && x.quality_grade !== 'research') continue;
    const animale = animaleDelTaxon(x.taxon);
    if (!animale) continue;
    const [lat, lon] = String(x.location ?? ',').split(',').map(Number);
    if (!Number.isFinite(lat) || !nelRiquadro(lat, lon)) continue;
    if (!x.obscured && anelli?.length && !puntoNelPoligono([lon, lat], anelli)) continue;
    totale++;
    const a = perAnimale.get(animale) ?? { n: 0, persone: new Set(), mesi: Array(12).fill(0), sfumate: 0 };
    a.n++;
    if (x.obscured) a.sfumate++;
    if (x.user?.id != null) a.persone.add(x.user.id);
    if (x.observed_on) a.mesi[Number(x.observed_on.slice(5, 7)) - 1]++;
    perAnimale.set(animale, a);
  }
  const specie = [...perAnimale]
    .filter(([, a]) => a.n >= MINIMO_OSSERVAZIONI && a.persone.size >= MINIMO_PERSONE)
    .map(([animale, a]) => ({ animale, osservazioni: a.n, persone: a.persone.size, mesi: mesiMigliori(a.mesi), sfumate: a.sfumate }))
    .sort((x, y) => y.osservazioni - x.osservazioni);
  return { osservazioni: totale, specie };
}
