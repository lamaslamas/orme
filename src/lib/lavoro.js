// Lavoro pesante a pezzi piccoli: i calcoli lunghi si dividono in pezzi sotto i 30 ms e tra un pezzo e l'altro si cede il
// passo al browser (scheduler.yield, requestIdleCallback o un timer). Mentre si tocca o si sposta la mappa i pezzi
// aspettano (al massimo MAX_ATTESA_MS, così non si resta indietro per sempre).
const PAUSA_DOPO_INTERAZIONE_MS = 250;
const MAX_ATTESA_MS = 4000;

let ultimaInterazione = -Infinity;
let mappaInMovimento = false;
const adesso = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// tocchi, trascinamenti, rotellina e tastiera: il lavoro in sottofondo si ferma finché non passa un attimo di quiete
export function ascoltaInterazioni(bersaglio = globalThis.document) {
  if (!bersaglio?.addEventListener) return () => {};
  const segna = () => (ultimaInterazione = adesso());
  const eventi = ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel', 'keydown'];
  for (const e of eventi) bersaglio.addEventListener(e, segna, { passive: true, capture: true });
  return () => eventi.forEach((e) => bersaglio.removeEventListener(e, segna, { capture: true }));
}
// la mappa (Leaflet) si sta spostando o ingrandendo, anche per inerzia dopo il dito
export function collegaMappaAlLavoro(mappa) {
  mappa.on('movestart zoomstart', () => (mappaInMovimento = true));
  mappa.on('moveend zoomend', () => {
    mappaInMovimento = false;
    ultimaInterazione = adesso();
  });
  mappa.on('unload', () => (mappaInMovimento = false));
}
export const interagendo = (quietaMs = PAUSA_DOPO_INTERAZIONE_MS) => mappaInMovimento || adesso() - ultimaInterazione < quietaMs;

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// cede il passo al browser: prima il resto del lavoro urgente (tocchi, disegno), poi si riprende
export function respira() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  if (typeof globalThis.requestIdleCallback === 'function') return new Promise((r) => globalThis.requestIdleCallback(() => r(), { timeout: 120 }));
  return attendi(0);
}

// aspetta che non si stia toccando né spostando la mappa
export async function aspettaQuiete({ quietaMs = PAUSA_DOPO_INTERAZIONE_MS, massimoMs = MAX_ATTESA_MS } = {}) {
  const inizio = adesso();
  while (interagendo(quietaMs) && adesso() - inizio < massimoMs) await attendi(60);
}

// Applica fn a ogni elemento a pezzi: dopo `budgetMs` di lavoro cede il passo e, se si sta toccando, aspetta.
// Restituisce i risultati nello stesso ordine.
export async function inPezzi(elementi, fn, { budgetMs = 30, quietaMs = PAUSA_DOPO_INTERAZIONE_MS } = {}) {
  const risultati = [];
  let inizio = adesso();
  for (let i = 0; i < elementi.length; i++) {
    risultati.push(fn(elementi[i], i));
    if (adesso() - inizio >= budgetMs) {
      await respira();
      await aspettaQuiete({ quietaMs });
      inizio = adesso();
    }
  }
  return risultati;
}

// per i test: azzera lo stato delle interazioni
export function azzeraInterazioni() {
  ultimaInterazione = -Infinity;
  mappaInMovimento = false;
}

// Come inPezzi, ma con il costo stimato di ogni elemento (es. quanti punti ha una traccia): si impara quanti ms costa ogni
// unità e si cede il passo PRIMA di un elemento che da solo sforerebbe il budget (inPezzi può solo cedere dopo averlo
// fatto). costo(elemento) → numero. Gli elementi si fanno nell'ordine dato.
export async function inPezziStimati(elementi, fn, costo, { budgetMs = 25, quietaMs = PAUSA_DOPO_INTERAZIONE_MS } = {}) {
  let msPerUnita = 0.005; // stima iniziale prudente, poi si corregge con quello che si misura
  let inizio = adesso();
  for (let i = 0; i < elementi.length; i++) {
    const unita = Math.max(1, costo(elementi[i]));
    const usato = adesso() - inizio;
    if (usato > 0 && usato + unita * msPerUnita > budgetMs) {
      await respira();
      await aspettaQuiete({ quietaMs });
      inizio = adesso();
    }
    const prima = adesso();
    fn(elementi[i], i);
    const ms = adesso() - prima;
    msPerUnita = msPerUnita * 0.6 + (ms / unita) * 0.4;
  }
}
