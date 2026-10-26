// Il tratto del percorso con più fauna segnalata ("km 6–8"): per ogni chilometro si contano gli osservatori
// diversi che hanno segnalato un animale entro 150 m dalla traccia; il tratto migliore sono due chilometri
// di fila. Lo calcola il robot (che ha le osservazioni); il telefono lo disegna.
// Contano tutte le specie, anche quelle protette (l'app è per uso personale). Restano fuori solo le posizioni
// approssimate dalla fonte (iNaturalist o GBIF le sposta di proposito): non si sa dove sono sul percorso.
import { lunghezzaDeiPezzi, posizioneSullaTraccia } from './lungoIlPercorso.js';
import { improntaTraccia } from './panorama.js';
import { tracciaDaNonUsare } from './tracce.js';
import { nascoste } from './specieNascoste.js';

export const RAGGIO_TRATTO_M = 150;
export const MINIMO_OSSERVATORI_TRATTO = 3;
export const LUNGHEZZA_MINIMA_KM = 3; // su un percorso più corto il tratto sarebbe quasi tutto
// nomi italiani dei rapaci più comuni, per le specie che non sono nell'elenco fisso di Orme
export const NOMI_RAPACI = {
  'Buteo buteo': 'poiana', 'Falco tinnunculus': 'gheppio', 'Accipiter nisus': 'sparviere', 'Accipiter gentilis': 'astore', 'Circus aeruginosus': 'falco di palude',
  'Circus pygargus': 'albanella minore', 'Circus cyaneus': 'albanella reale', 'Falco subbuteo': 'lodolaio', 'Falco vespertinus': 'falco cuculo', 'Falco columbarius': 'smeriglio',
  'Pernis apivorus': 'falco pecchiaiolo', 'Circaetus gallicus': 'biancone', 'Milvus migrans': 'nibbio bruno', 'Pandion haliaetus': 'falco pescatore', 'Buteo rufinus': 'poiana codabianca',
  'Otus scops': 'assiolo', 'Athene noctua': 'civetta', 'Strix aluco': 'allocco', 'Asio otus': 'gufo comune', 'Hieraaetus pennatus': 'aquila minore',
};
// il nome con cui la specie entra nel conteggio: la chiave di Orme, il nome italiano di un rapace comune o lo scientifico
const nomeSpecie = (x) => x.animale ?? NOMI_RAPACI[x.nomeScientifico] ?? (x.nomeScientifico || null);
// al contrario: dal nome con cui la specie è nel tratto a ciò che serve per riconoscerla tra le specie nascoste
const SCIENTIFICO_DEL_NOME = new Map(Object.entries(NOMI_RAPACI).map(([sci, nome]) => [nome, sci]));
export const specieDelNome = (nome) => (SCIENTIFICO_DEL_NOME.has(nome) ? { scientifico: SCIENTIFICO_DEL_NOME.get(nome) } : /\s/.test(String(nome)) ? { scientifico: nome } : { animale: nome });

// osservazioni: [{ animale, nomeScientifico, ordine, data, lat, lon, sfumata, osservatore }]; pezzi: la traccia in ordine di percorrenza
// → { km, perKm: [osservatori diversi per ogni km], migliore: { daKm, aKm, persone, specie } | null }
export function trattiFauna(osservazioni, pezzi, { raggioM = RAGGIO_TRATTO_M } = {}) {
  const km = lunghezzaDeiPezzi(pezzi);
  const bins = Math.max(1, Math.ceil(km));
  const perBin = Array.from({ length: bins }, () => new Map()); // animale → insieme di osservatori
  // riquadro della traccia con un margine: scarta subito le osservazioni lontane
  let [s, o, n, e] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const linea of pezzi ?? []) for (const [x, y] of linea) [s, o, n, e] = [Math.min(s, y), Math.min(o, x), Math.max(n, y), Math.max(e, x)];
  const m = 0.003;
  for (const x of osservazioni ?? []) {
    const specie = nomeSpecie(x);
    if (!specie || x.sfumata || x.osservatore == null) continue;
    if (x.lat < s - m || x.lat > n + m || x.lon < o - m || x.lon > e + m) continue;
    const pos = posizioneSullaTraccia([x.lon, x.lat], pezzi);
    if (pos.km == null || pos.distanzaM > raggioM) continue;
    const mappa = perBin[Math.min(bins - 1, Math.floor(pos.km))];
    if (!mappa.has(specie)) mappa.set(specie, new Set());
    mappa.get(specie).add(x.osservatore);
  }
  const unione = (indici) => {
    const persone = new Set();
    const perAnimale = new Map();
    for (const i of indici)
      for (const [a, set] of perBin[i]) {
        if (!perAnimale.has(a)) perAnimale.set(a, new Set());
        for (const p of set) (persone.add(`${a}:${p}`), perAnimale.get(a).add(p));
      }
    const tutte = new Set();
    for (const set of perAnimale.values()) for (const p of set) tutte.add(p);
    return { persone: tutte.size, perAnimale };
  };
  const perKm = perBin.map((_, i) => unione([i]).persone);
  // osservatori diversi di ogni specie in ogni km: serve a rifare il tratto quando alcune specie sono nascoste
  const perKmSpecie = perBin.map((m) => Object.fromEntries([...m].map(([a, set]) => [a, set.size])));
  if (km < LUNGHEZZA_MINIMA_KM) return { km: Math.round(km * 10) / 10, perKm, perKmSpecie, migliore: null };
  let migliore = null;
  const finestra = 2;
  for (let i = 0; i + finestra <= bins; i++) {
    const { persone, perAnimale } = unione(Array.from({ length: finestra }, (_, k) => i + k));
    if (persone > (migliore?.persone ?? 0)) migliore = { daKm: i, aKm: Math.min(i + finestra, Math.round(km * 10) / 10), persone, perAnimale };
  }
  if (!migliore || migliore.persone < MINIMO_OSSERVATORI_TRATTO) return { km: Math.round(km * 10) / 10, perKm, perKmSpecie, migliore: null };
  const specie = [...migliore.perAnimale].sort((a, b) => b[1].size - a[1].size).slice(0, 3).map(([a]) => a);
  return { km: Math.round(km * 10) / 10, perKm, perKmSpecie, migliore: { daKm: migliore.daKm, aKm: migliore.aKm, persone: migliore.persone, specie } };
}

// Il tratto migliore senza le specie nascoste. Con i conti per specie (perKmSpecie) si rifà la finestra di due
// chilometri; senza (dati calcolati prima) si tiene il tratto di prima se gli resta almeno una specie.
// I conti per specie si sommano: chi ha visto due specie conta due volte (poche persone in più, mai in meno).
export function trattoSenzaNascoste(tratti, esclude = (x) => nascoste.esclude(x)) {
  const m = tratti?.migliore ?? null;
  if (!m) return null;
  const visibili = (nomi) => nomi.filter((n) => !esclude(specieDelNome(n)));
  if (!Array.isArray(tratti.perKmSpecie)) {
    const specie = visibili(m.specie ?? []);
    return specie.length === (m.specie ?? []).length ? m : specie.length ? { ...m, specie } : null;
  }
  const bins = tratti.perKmSpecie;
  const conti = bins.map((b) => Object.fromEntries(Object.entries(b).filter(([n]) => !esclude(specieDelNome(n)))));
  if (conti.every((c, i) => Object.keys(c).length === Object.keys(bins[i]).length)) return m; // niente di nascosto qui: il tratto è lo stesso
  if ((tratti.km ?? 0) < LUNGHEZZA_MINIMA_KM) return null;
  const finestra = 2;
  let migliore = null;
  for (let i = 0; i + finestra <= conti.length; i++) {
    const perSpecie = {};
    for (let k = 0; k < finestra; k++) for (const [n, c] of Object.entries(conti[i + k])) perSpecie[n] = (perSpecie[n] ?? 0) + c;
    const persone = Object.values(perSpecie).reduce((a, b) => a + b, 0);
    if (persone > (migliore?.persone ?? 0)) migliore = { daKm: i, aKm: Math.min(i + finestra, tratti.km), persone, perSpecie };
  }
  if (!migliore || migliore.persone < MINIMO_OSSERVATORI_TRATTO) return null;
  return { daKm: migliore.daKm, aKm: migliore.aKm, persone: migliore.persone, specie: Object.entries(migliore.perSpecie).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n) };
}

// "km 6–8"
export const testoTratto = (t) => `km ${String(t.daKm).replace('.', ',')}–${String(Math.round(t.aKm * 10) / 10).replace('.', ',')}`;

// Il tratto da mostrare per un percorso: solo se il robot l'ha calcolato sulla traccia che c'è ora (un GPX mio
// la cambia) e se la traccia è continua
export function trattoDelPercorso(sentiero, traccia) {
  const t = trattoSenzaNascoste(sentiero?.faunaInat?.tratti);
  if (!t || !traccia?.geojson) return null;
  if (sentiero.faunaInat.impronta !== improntaTraccia(traccia.geojson).split('-')[1]) return null;
  return tracciaDaNonUsare(sentiero, traccia).incompleta ? null : t;
}
