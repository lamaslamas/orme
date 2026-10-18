// Il tratto del percorso con più fauna segnalata ("km 6–8"): per ogni chilometro si contano gli osservatori
// diversi che hanno segnalato un animale entro 150 m dalla traccia; il tratto migliore sono due chilometri
// di fila. Lo calcola il robot (che ha le osservazioni); il telefono lo disegna.
// Mai a livello di tratto: le specie sensibili (orso, lupo, aquila reale, grifone, capovaccaio, falco pellegrino,
// lanario, gufo reale…), gli altri rapaci nel periodo di nidificazione e le posizioni sfumate, che restano a
// livello di zona. Poiana, gheppio e simili, fuori dal periodo di nidificazione, contano.
import { lunghezzaDeiPezzi, posizioneSullaTraccia } from './lungoIlPercorso.js';
import { improntaTraccia } from './panorama.js';
import { tracciaDaNonUsare } from './tracce.js';

export const RAGGIO_TRATTO_M = 150;
export const MINIMO_OSSERVATORI_TRATTO = 3;
export const LUNGHEZZA_MINIMA_KM = 3; // su un percorso più corto il tratto sarebbe quasi tutto
// sensibili sempre (chiave di Orme)
export const SPECIE_SENSIBILI_TRATTO = ['orso', 'lupo', 'gatto_selvatico', 'lontra', 'cicogna_nera', 'aquila_reale', 'gufo_reale'];
// sensibili sempre (nome scientifico): grifone, capovaccaio, falco pellegrino, lanario, aquila reale, gufo reale
export const SCIENTIFICI_SENSIBILI = ['Gyps fulvus', 'Neophron percnopterus', 'Falco peregrinus', 'Falco biarmicus', 'Aquila chrysaetos', 'Bubo bubo'];
// rapaci (diurni e notturni): fuori dai sensibili contano, ma non durante la nidificazione (febbraio–luglio, in modo semplice)
export const ORDINI_RAPACI = ['Accipitriformes', 'Falconiformes', 'Strigiformes'];
export const MESI_NIDIFICAZIONE = [2, 3, 4, 5, 6, 7];
// nomi italiani dei rapaci più comuni, per le specie che non sono nell'elenco fisso di Orme
export const NOMI_RAPACI = {
  'Buteo buteo': 'poiana', 'Falco tinnunculus': 'gheppio', 'Accipiter nisus': 'sparviere', 'Accipiter gentilis': 'astore', 'Circus aeruginosus': 'falco di palude',
  'Circus pygargus': 'albanella minore', 'Circus cyaneus': 'albanella reale', 'Falco subbuteo': 'lodolaio', 'Falco vespertinus': 'falco cuculo', 'Falco columbarius': 'smeriglio',
  'Pernis apivorus': 'falco pecchiaiolo', 'Circaetus gallicus': 'biancone', 'Milvus migrans': 'nibbio bruno', 'Pandion haliaetus': 'falco pescatore', 'Buteo rufinus': 'poiana codabianca',
  'Otus scops': 'assiolo', 'Athene noctua': 'civetta', 'Strix aluco': 'allocco', 'Asio otus': 'gufo comune', 'Hieraaetus pennatus': 'aquila minore',
};
const RAPACI_FISSI = ['aquila_reale', 'nibbio_reale', 'gufo_reale', 'falco_grillaio'];
const eRapace = (x) => ORDINI_RAPACI.includes(x.ordine) || RAPACI_FISSI.includes(x.animale);
const sensibile = (x) => SPECIE_SENSIBILI_TRATTO.includes(x.animale) || SCIENTIFICI_SENSIBILI.includes(x.nomeScientifico);
const nidificazione = (x) => eRapace(x) && MESI_NIDIFICAZIONE.includes(Number(String(x.data ?? '').slice(5, 7)));
// il nome con cui la specie entra nel conteggio (chiave di Orme, o nome italiano di un rapace); null se non si sa
const nomeSpecie = (x) => x.animale ?? NOMI_RAPACI[x.nomeScientifico] ?? null;

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
    if (!specie || x.sfumata || x.osservatore == null || sensibile(x) || nidificazione(x)) continue;
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
  if (km < LUNGHEZZA_MINIMA_KM) return { km: Math.round(km * 10) / 10, perKm, migliore: null };
  let migliore = null;
  const finestra = 2;
  for (let i = 0; i + finestra <= bins; i++) {
    const { persone, perAnimale } = unione(Array.from({ length: finestra }, (_, k) => i + k));
    if (persone > (migliore?.persone ?? 0)) migliore = { daKm: i, aKm: Math.min(i + finestra, Math.round(km * 10) / 10), persone, perAnimale };
  }
  if (!migliore || migliore.persone < MINIMO_OSSERVATORI_TRATTO) return { km: Math.round(km * 10) / 10, perKm, migliore: null };
  const specie = [...migliore.perAnimale].sort((a, b) => b[1].size - a[1].size).slice(0, 3).map(([a]) => a);
  return { km: Math.round(km * 10) / 10, perKm, migliore: { daKm: migliore.daKm, aKm: migliore.aKm, persone: migliore.persone, specie } };
}

// "km 6–8"
export const testoTratto = (t) => `km ${String(t.daKm).replace('.', ',')}–${String(Math.round(t.aKm * 10) / 10).replace('.', ',')}`;

// Il tratto da mostrare per un percorso: solo se il robot l'ha calcolato sulla traccia che c'è ora (un GPX mio
// la cambia) e se la traccia è continua
export function trattoDelPercorso(sentiero, traccia) {
  const t = sentiero?.faunaInat?.tratti?.migliore;
  if (!t || !traccia?.geojson) return null;
  if (sentiero.faunaInat.impronta !== improntaTraccia(traccia.geojson).split('-')[1]) return null;
  return tracciaDaNonUsare(sentiero, traccia).incompleta ? null : t;
}
