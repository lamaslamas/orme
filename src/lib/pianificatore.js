// Il pianificatore (pagina MapLibre): i calcoli, senza mappa né rete. Il percorso è una lista di tappe (punti con un
// id, la posizione e un nome che si trova da solo); tra due tappe un tratto calcolato da BRouter (src/lib/brouter.js).
import { distanzaKm } from './geo.js';
import { creaBase } from './modificaTraccia.js';

const arr = (n) => Number(Number(n).toFixed(6));
let contatore = 0;

// una tappa: { id, p: [lon, lat], libero, nome }
export function nuovaTappa(p, extra = {}) {
  contatore += 1;
  return { id: `t${Date.now().toString(36)}${contatore.toString(36)}`, p: [arr(p[0]), arr(p[1])], libero: false, nome: null, ...extra };
}
// i punti salvati (anche solo { p, libero }) → tappe con id
export const tappeDaPunti = (punti) => (punti ?? []).map((x, i) => nuovaTappa(x.p ?? x, { libero: i === 0 ? false : Boolean(x.libero), nome: x.nomeManuale ? x.nome ?? null : null, nomeManuale: Boolean(x.nomeManuale) }));

// «A», 1, 2… e «B» per l'ultima (con almeno due tappe)
export const etichetta = (i, n) => (i === 0 ? 'A' : i === n - 1 ? 'B' : String(i));

// il nuovo punto dopo la tappa k (trascinando il tratto che parte da k)
export const inserisciDopo = (tappe, k, p) => [...tappe.slice(0, k + 1), nuovaTappa(p), ...tappe.slice(k + 1)];
// spostata: il nome automatico si ritrova (quello scritto a mano resta)
export const sposta = (tappe, i, p) => tappe.map((t, j) => (j === i ? { ...t, p: [arr(p[0]), arr(p[1])], pos: undefined, ...(t.nomeManuale ? {} : { nome: null, luoghi: null, poi: null }) } : t));
export const togli = (tappe, i) => tappe.filter((_, j) => j !== i).map((t, j) => (j === 0 ? { ...t, libero: false } : t));
// una tappa su (-1) o giù (+1); la prima tappa del percorso non è mai «libera»
// una tappa trascinata dal posto `da` al posto `a`; la prima tappa del percorso non è mai «libera»
export function muovi(tappe, da, a) {
  if (da === a || da < 0 || a < 0 || da >= tappe.length || a >= tappe.length) return tappe;
  const r = [...tappe];
  const [t] = r.splice(da, 1);
  r.splice(a, 0, t);
  return r.map((x, k) => (k === 0 ? { ...x, libero: false } : x));
}
export function riordina(tappe, i, verso) {
  const j = i + verso;
  if (j < 0 || j >= tappe.length) return tappe;
  const r = [...tappe];
  [r[i], r[j]] = [r[j], r[i]];
  return r.map((t, k) => (k === 0 ? { ...t, libero: false } : t));
}
// un altro luogo scelto con la ricerca (il nome è quello del luogo, non scritto a mano)
export const sostituisci = (tappe, i, p, nome = null) => tappe.map((t, j) => (j === i ? { ...t, p: [arr(p[0]), arr(p[1])], nome, luoghi: null, poi: null, pos: undefined, nomeManuale: false } : t));
// rinominata a mano; vuoto = di nuovo il nome automatico
export const rinomina = (tappe, i, testo) => {
  const nome = String(testo ?? '').trim();
  return tappe.map((t, j) => (j === i ? (nome ? { ...t, nome, nomeManuale: true } : { ...t, nome: null, nomeManuale: false }) : t));
};

// Annulla e Ripeti: la storia delle liste di tappe
export function creaStoria(iniziale = []) {
  let passati = [];
  let futuri = [];
  let ora = iniziale;
  return {
    ora: () => ora,
    vai(nuovo) {
      passati.push(ora);
      if (passati.length > 100) passati.shift();
      futuri = [];
      ora = nuovo;
      return ora;
    },
    annulla() {
      if (!passati.length) return ora;
      futuri.push(ora);
      ora = passati.pop();
      return ora;
    },
    ripeti() {
      if (!futuri.length) return ora;
      passati.push(ora);
      ora = futuri.pop();
      return ora;
    },
    puoAnnullare: () => passati.length > 0,
    puoRipetere: () => futuri.length > 0,
    azzera(nuovo = []) {
      passati = [];
      futuri = [];
      ora = nuovo;
    },
  };
}

// Quale tratto è più vicino a un punto: tratti = [[[lon, lat]…]…] → { indice, distanzaM } (indice -1 se non ce ne sono)
export function trattoPiuVicino(tratti, [lon, lat]) {
  const kx = Math.cos((lat * Math.PI) / 180);
  let migliore = { indice: -1, distanzaM: Infinity };
  tratti.forEach((linea, indice) => {
    for (let i = 1; i < linea.length; i++) {
      const [ax, ay] = [(linea[i - 1][0] - lon) * kx, linea[i - 1][1] - lat];
      const [bx, by] = [(linea[i][0] - lon) * kx, linea[i][1] - lat];
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy) * 111_195;
      if (d < migliore.distanzaM) migliore = { indice, distanzaM: d };
    }
  });
  return migliore;
}

// --- tipo di fondo, dai tag OSM che BRouter dà per ogni tratto ---
const ASFALTO = new Set(['asphalt', 'paved', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'sett', 'cobblestone', 'chipseal', 'bricks']);
const STERRATO = new Set(['gravel', 'fine_gravel', 'compacted', 'ground', 'dirt', 'earth', 'unpaved', 'pebblestone', 'grass', 'mud', 'sand']);
const SENTIERI = new Set(['path', 'footway', 'steps', 'bridleway', 'via_ferrata', 'pedestrian']);
const STRADE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'road', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);

// → 'sentiero' | 'sterrata' | 'asfalto' | 'altro'
export function classeFondo(tag = {}) {
  const s = tag.surface;
  const h = tag.highway;
  if (s && ASFALTO.has(s)) return 'asfalto';
  if (s && STERRATO.has(s)) return h && SENTIERI.has(h) ? 'sentiero' : 'sterrata';
  if (h && SENTIERI.has(h)) return 'sentiero';
  if (h === 'track') return 'sterrata';
  if (h && STRADE.has(h)) return 'asfalto';
  return 'altro';
}
// terreno: [{ daM, aM, tag }] → { parti: [{ daM, aM, classe }], percentuali: { sentiero, sterrata, asfalto, altro } (somma 100), totaleM }
export function fondoDaTerreno(terreno) {
  const parti = (terreno ?? []).map((x) => ({ daM: x.daM, aM: x.aM, classe: classeFondo(x.tag) }));
  const totaleM = parti.reduce((m, x) => m + (x.aM - x.daM), 0);
  const per = { sentiero: 0, sterrata: 0, asfalto: 0, altro: 0 };
  for (const x of parti) per[x.classe] += x.aM - x.daM;
  if (!totaleM) return { parti, percentuali: null, totaleM: 0 };
  const grezze = Object.entries(per).map(([k, v]) => [k, (v / totaleM) * 100]);
  const percentuali = Object.fromEntries(grezze.map(([k, v]) => [k, Math.floor(v)]));
  // i punti persi dall'arrotondamento vanno alle classi con più resto
  let resto = 100 - Object.values(percentuali).reduce((a, b) => a + b, 0);
  for (const [k] of [...grezze].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (resto <= 0) break;
    percentuali[k] += 1;
    resto -= 1;
  }
  return { parti, percentuali, totaleM };
}

// Due preferenze di BRouter per Trekking: «Preferisci sentieri» (parametro del profilo escursionistico alto) e «Misto»
// (il valore di base del profilo). Per MTB non c'è: il profilo è uno solo.
export const PREFERENZE_FONDO = { sentieri: { nome: 'Preferisci sentieri', valore: 1.5 }, misto: { nome: 'Misto', valore: null } };
export const preferenzaPer = (scelta, attivita) => (attivita === 'mtb' ? null : PREFERENZE_FONDO[scelta]?.valore ?? null);

// Chiave di un tratto calcolato (con le opzioni: cambiando attività o preferenza si ricalcola)
export const chiaveTratto = (a, b, libero, opzioni = '') => `${a.p[0]},${a.p[1]}>${b.p[0]},${b.p[1]}${libero ? ':libero' : ''}|${opzioni}`;

export const distanzaM = (a, b) => distanzaKm(a, b) * 1000;

// --- nomi delle tappe ---
// Nominatim (reverse a zoom 17) → { via, localita, paese }: la via o il sentiero più vicino, la frazione o località, il paese
export const urlReverseTappa = (lat, lon) =>
  `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ format: 'jsonv2', zoom: '17', addressdetails: '1', 'accept-language': 'it', lat: lat.toFixed(5), lon: lon.toFixed(5) })}`;
export function luoghiDaRisposta(json) {
  const a = json?.address;
  if (!a) return null;
  const via = a.road || a.footway || a.path || a.pedestrian || a.track || a.cycleway || a.bridleway || null;
  const localita = a.hamlet || a.locality || a.isolated_dwelling || a.farm || a.neighbourhood || a.suburb || null;
  const paese = a.village || a.town || a.city || a.municipality || a.city_district || null;
  return via || localita || paese ? { via, localita, paese } : null;
}
// il primo che c'è: un punto di interesse entro 100 m, la via o il sentiero, la località, il paese
export const RAGGIO_POI_NOME_M = 100;
export const nomeAutomaticoTappa = ({ poi = null, luoghi = null } = {}) => poi || luoghi?.via || luoghi?.localita || luoghi?.paese || null;
export const nomeDellaTappa = (t) => t?.nome || nomeAutomaticoTappa({ poi: t?.poi, luoghi: t?.luoghi });
// «Via Monteroni · km 4,2»: sempre con il km, che distingue anche due tappe con lo stesso nome
export const kmTesto = (km) => (Number.isFinite(km) ? `km ${String(Math.round(km * 10) / 10).replace('.', ',')}` : '');
export const etichettaConKm = (nome, km) => [nome, kmTesto(km)].filter(Boolean).join(' · ');
// i km di ogni tappa lungo il percorso, dai tratti calcolati (lunghezze in metri)
export function kmDelleTappe(lunghezzeTrattiM) {
  const km = [0];
  for (const m of lunghezzeTrattiM) km.push(km.at(-1) + m / 1000);
  return km;
}

// --- una traccia già esistente (sentiero dell'archivio, mio percorso, carrareccia) come tappe sulla sua «base» ---
export const INTERVALLO_TAPPE_M = 3000; // senza punti di controllo, una tappa ogni 3 km
// pezzi → { base, tappe }: la traccia come linea sola e le tappe con la loro posizione `pos` (metri dall'inizio) sulla base.
// Tra due tappe con `pos` il tratto è il pezzo della traccia originale, senza ricalcolare niente (finché non si spostano).
// puntiControllo: i punti con cui era stata disegnata (in ordine); se mancano, partenza, arrivo e una tappa ogni 3 km
export function tappeDaTraccia(pezzi, puntiControllo = null) {
  const base = creaBase(pezzi);
  if (base.linea.length < 2) return { base: null, tappe: [] };
  const lungo = puntiControllo?.length >= 2 ? puntiControllo : null;
  let posizioni;
  let punti;
  if (lungo) {
    // ogni punto sulla traccia nel punto più vicino, sempre in avanti (un anello o un andata e ritorno tornano sullo stesso posto)
    let minimo = 0;
    posizioni = [];
    punti = [];
    for (const x of lungo) {
      const p = x.p ?? x;
      let migliore = null;
      for (let i = 0; i < base.linea.length; i++) {
        if (base.cum[i] < minimo) continue;
        const d = distanzaM(base.linea[i], p);
        if (!migliore || d < migliore.d) migliore = { d, i };
      }
      if (!migliore) migliore = { d: Infinity, i: base.linea.length - 1 };
      const sulla = migliore.d <= 60;
      posizioni.push(sulla ? base.cum[migliore.i] : undefined);
      if (sulla) minimo = base.cum[migliore.i];
      // il tratto «fuori sentiero» scelto in precedenza resta tale (mai per la partenza)
      punti.push({ p: sulla ? base.linea[migliore.i] : p, libero: punti.length > 0 && Boolean(x.libero) });
    }
  } else {
    const n = Math.max(1, Math.round(base.totaleM / INTERVALLO_TAPPE_M));
    posizioni = Array.from({ length: n + 1 }, (_, k) => (base.totaleM * k) / n);
    punti = posizioni.map((m) => {
      let i = 0;
      while (i < base.linea.length - 1 && base.cum[i] < m) i++;
      return { p: base.linea[i], libero: false };
    });
    posizioni = punti.map((_, k) => (k === 0 ? 0 : k === punti.length - 1 ? base.totaleM : posizioni[k]));
  }
  const tappe = punti.map((x, k) => nuovaTappa(x.p, { pos: posizioni[k], libero: Boolean(x.libero), nome: lungo?.[k]?.nomeManuale ? lungo[k].nome ?? null : null, nomeManuale: Boolean(lungo?.[k]?.nomeManuale) }));
  return { base, tappe };
}

// --- tratti: agganciati alla strada e senza «code» ---
export const DISTANZA_MASSIMA_AGGANCIO_M = 200; // un punto più lontano di così da ogni sentiero e strada non si aggancia: «Fuori sentiero»
const uguali = (a, b) => Math.abs(a[0] - b[0]) < 2e-6 && Math.abs(a[1] - b[1]) < 2e-6;
const lungM = (linea) => linea.reduce((m, p, i) => (i ? m + distanzaM(linea[i - 1], p) : 0), 0);
function senzaFine(terreno, metri) {
  const totale = terreno.at(-1)?.aM ?? 0;
  return terreno.filter((x) => x.daM < totale - metri).map((x) => ({ ...x, aM: Math.min(x.aM, totale - metri) }));
}
function senzaInizio(terreno, metri) {
  return terreno.filter((x) => x.aM > metri).map((x) => ({ ...x, daM: Math.max(0, x.daM - metri), aM: x.aM - metri }));
}
// Dove un tratto torna indietro sullo stesso cammino (la tappa sta su un ramo che finisce lì), il ramo si toglie: il percorso
// passa dal punto dove il ramo si stacca. tratti: [{ coordinate, terreno, libero }] → nuovi tratti (gli stessi se non c'è niente da togliere)
export function tagliaCode(tratti) {
  const r = tratti.map((t) => ({ ...t, coordinate: [...t.coordinate], terreno: t.terreno ? [...t.terreno] : t.terreno }));
  for (let k = 0; k < r.length - 1; k++) {
    const a = r[k];
    const b = r[k + 1];
    if (a.libero || b.libero || a.coordinate.length < 3 || b.coordinate.length < 3) continue;
    let m = 0;
    while (m < a.coordinate.length && m < b.coordinate.length && uguali(a.coordinate[a.coordinate.length - 1 - m], b.coordinate[m])) m++;
    if (m < 2) continue; // un solo punto in comune: la tappa
    // il ramo va dalla giunzione (indice m-1 di b) alla tappa (indice 0 di b)
    m = Math.min(m, a.coordinate.length - 1, b.coordinate.length - 1);
    if (m < 2) continue;
    const lunghezza = lungM(b.coordinate.slice(0, m));
    r[k] = { ...a, coordinate: a.coordinate.slice(0, a.coordinate.length - m + 1), terreno: a.terreno ? senzaFine(a.terreno, lunghezza) : a.terreno };
    r[k + 1] = { ...b, coordinate: b.coordinate.slice(m - 1), terreno: b.terreno ? senzaInizio(b.terreno, lunghezza) : b.terreno };
    r[k].codaTolta = true;
    r[k + 1].codaTolta = true;
  }
  return r;
}
// Dove cade ogni tappa sulla strada, secondo i tratti calcolati: la fine del tratto che ci arriva o l'inizio di quello che parte.
// → [{ p, distanzaM }] (p null se non si sa: tappe tra tratti «fuori sentiero» o sulla traccia di partenza)
export function aggancioDelleTappe(tappe, tratti) {
  return tappe.map((t, i) => {
    const prima = i > 0 && !tratti[i - 1]?.libero && !tratti[i - 1]?.daBase ? tratti[i - 1].coordinate.at(-1) : null;
    const dopo = i < tratti.length && !tratti[i]?.libero && !tratti[i]?.daBase ? tratti[i].coordinate[0] : null;
    const p = prima ?? dopo;
    return p ? { p: [p[0], p[1]], distanzaM: Math.round(distanzaM(t.p, p)) } : { p: null, distanzaM: 0 };
  });
}

// --- i comandi del fumetto (tocco sulla mappa o su una tappa), il giro ad anello e le forbici ---
const kmPer = (a, b) => distanzaKm(a, b) * 1000;

// «Aggiungi al percorso»: la posizione più logica per un punto nuovo = quella che allunga meno il percorso (in linea d'aria),
// mai prima della partenza. → indice dove inserirlo (1…n)
export function posizionePiuLogica(tappe, p) {
  const n = tappe.length;
  if (n < 2) return n;
  let migliore = { i: n, costo: kmPer(tappe[n - 1].p, p) };
  for (let i = 1; i < n; i++) {
    const costo = kmPer(tappe[i - 1].p, p) + kmPer(p, tappe[i].p) - kmPer(tappe[i - 1].p, tappe[i].p);
    if (costo < migliore.costo) migliore = { i, costo };
  }
  return migliore.i;
}
// libero: il tratto che arriva al punto è «fuori sentiero»
export const inserisciIn = (tappe, i, p, extra = {}, libero = false) => {
  const k = Math.max(0, Math.min(tappe.length, i));
  return [...tappe.slice(0, k), nuovaTappa(p, { ...extra, libero: k === 0 ? false : Boolean(libero) }), ...tappe.slice(k)];
};
export const aggiungiAlPercorso = (tappe, p, extra = {}, libero = false) => inserisciIn(tappe, posizionePiuLogica(tappe, p), p, extra, libero);
// «Imposta come partenza» per un punto nuovo: il tratto verso la vecchia partenza è libero se così si è scelto
export const comePartenza = (tappe, p, extra = {}, libero = false) => [nuovaTappa(p, { ...extra, libero: false }), ...tappe.map((t, j) => (j === 0 ? { ...t, libero: Boolean(libero), pos: undefined } : t))];
export const comeArrivo = (tappe, p, extra = {}, libero = false) => [...tappe, nuovaTappa(p, { ...extra, libero: tappe.length ? Boolean(libero) : false })];
// una tappa che c'è già diventa la partenza o l'arrivo
export const tappaComePartenza = (tappe, i) => muovi(tappe, i, 0);
export const tappaComeArrivo = (tappe, i) => muovi(tappe, i, tappe.length - 1);
// il tratto che arriva alla tappa i (non la prima) è «fuori sentiero» oppure no
export const impostaLibero = (tappe, i, libero) => tappe.map((t, j) => (j === i && j > 0 ? { ...t, libero: Boolean(libero) } : t));

// Forbici: si taglia sul tratto k (tra la tappa k e la k+1) nel punto p e si tiene una parte: 'inizio' = dalla partenza al taglio,
// 'fine' = dal taglio all'arrivo. Il taglio diventa l'arrivo o la partenza
export function taglia(tappe, k, p, tieni) {
  if (k < 0 || k >= tappe.length - 1) return tappe;
  if (tieni === 'inizio') return [...tappe.slice(0, k + 1), nuovaTappa(p)];
  return [nuovaTappa(p), ...tappe.slice(k + 1)].map((t, j) => (j === 0 ? { ...t, libero: false } : t));
}

// Giro ad anello: la tappa finale è la partenza (non è una tappa vera: non si vede e non si sposta)
export const ID_CHIUSURA = 'chiusura';
export const chiusuraAnello = (tappe) => ({ ...tappe[0], id: ID_CHIUSURA, libero: false, nome: null, nomeManuale: false, luoghi: null, poi: null, pos: undefined });
// la lista che si calcola: con l'anello, la partenza si ripete in fondo (servono almeno due tappe)
export const tappeConAnello = (tappe, anello) => (anello && tappe.length >= 2 ? [...tappe, chiusuraAnello(tappe)] : tappe);

// Quanto del ritorno ripassa dove si è già passati all'andata: la quota (0…1) dei suoi punti a meno di `sogliaM` dall'andata
export function sovrapposizione(andata, ritorno, sogliaM = 25) {
  if (!andata?.length || !ritorno?.length) return 0;
  const lat0 = andata[0][1];
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const s2 = (sogliaM / 111_195) ** 2;
  const A = andata.map(([x, y]) => [x * kx, y]);
  let dentro = 0;
  for (const [rx, ry] of ritorno) {
    const px = rx * kx;
    let vicino = false;
    for (let i = 1; i < A.length && !vicino; i++) {
      const [ax, ay] = A[i - 1];
      const dx = A[i][0] - ax;
      const dy = A[i][1] - ay;
      // fuori dal riquadro del segmento (più la soglia) non serve calcolare
      const m = sogliaM / 111_195;
      if (px < Math.min(ax, A[i][0]) - m || px > Math.max(ax, A[i][0]) + m || ry < Math.min(ay, A[i][1]) - m || ry > Math.max(ay, A[i][1]) + m) continue;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (ry - ay) * dy) / l2)) : 0;
      vicino = (ax + t * dx - px) ** 2 + (ay + t * dy - ry) ** 2 <= s2;
    }
    if (vicino) dentro++;
  }
  return dentro / ritorno.length;
}

// Il punto più vicino a p sulle linee (un tratto per linea): → { indice, p: [lon, lat], distanzaM }; indice -1 se non ce ne sono
export function proiettaSuTratti(tratti, [lon, lat]) {
  const kx = Math.cos((lat * Math.PI) / 180);
  let migliore = { indice: -1, p: null, distanzaM: Infinity };
  tratti.forEach((linea, indice) => {
    for (let i = 1; i < linea.length; i++) {
      const [ax, ay] = [(linea[i - 1][0] - lon) * kx, linea[i - 1][1] - lat];
      const [bx, by] = [(linea[i][0] - lon) * kx, linea[i][1] - lat];
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy) * 111_195;
      if (d < migliore.distanzaM) migliore = { indice, p: [linea[i - 1][0] + t * (linea[i][0] - linea[i - 1][0]), linea[i - 1][1] + t * (linea[i][1] - linea[i - 1][1])], distanzaM: d };
    }
  });
  return migliore;
}

// --- trascinare una tappa o la linea: sempre quella che si è presa, anche dopo aver riordinato o dopo Annulla e Ripeti ---
// Si lavora per id, non per posizione: l'elenco può essere cambiato tra il calcolo del percorso (che ricorda gli id delle tappe,
// uno per ogni punto di collegamento) e il gesto.
// Sposta la tappa con quell'id; le altre, A compresa, restano dove sono
export function spostaId(tappe, id, p) {
  const i = tappe.findIndex((t) => t.id === id);
  return i < 0 ? tappe : sposta(tappe, i, p);
}
// Il tratto k del percorso calcolato va dalla tappa ids[k] alla ids[k+1]: il punto trascinato diventa una tappa nuova subito dopo ids[k]
export function inserisciNelTratto(tappe, ids, k, p) {
  const i = tappe.findIndex((t) => t.id === ids?.[k]);
  return i < 0 ? tappe : inserisciDopo(tappe, i, p);
}
