// Le scelte di Suggerisci (e di «Dove vado domani?»): una funzione sola le rimette in forma ogni volta che si leggono
// o cambiano, così un valore in un formato vecchio o rovinato (cerco stringa, vuoto, mancante) non rompe mai niente.
import { SCELTE_PREDEFINITE, MODI_SUGGERISCI, QUANDO, TEMPI, COSE, FATICHE, DISTANZE, SCELTE_FACOLTATIVE } from './suggerimenti.js';
import { LUNGHEZZE } from './anello.js';

export const CHIAVE_SCELTE = 'orme.suggerisci';
const DOVE = ['qualsiasi', 'rifugi', 'strutture'];
const CAMPI_TESTO = ['specie', 'specieNome', 'parco', 'quota', 'salita', 'senzaQuote', 'lunghezzaKm'];

const come = (v, predefinito) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : predefinito);

// «cerco» sempre una lista di cose valide: da una lista, da una stringa («fauna» o «fauna,bosco») o da niente
export function normalizzaCerco(v) {
  const lista = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : [];
  return [...new Set(lista.filter((c) => typeof c === 'string' && c in COSE))];
}

// → scelte complete e del tipo giusto (un oggetto nuovo: non condivide liste con le scelte predefinite)
export function normalizzaScelte(grezze) {
  const g = grezze && typeof grezze === 'object' && !Array.isArray(grezze) ? grezze : {};
  const s = { ...SCELTE_PREDEFINITE, ...g, cerco: normalizzaCerco(g.cerco) };
  for (const k of CAMPI_TESTO) s[k] = come(g[k], SCELTE_PREDEFINITE[k]);
  s.modo = come(g.modo, '') in MODI_SUGGERISCI ? g.modo : SCELTE_PREDEFINITE.modo;
  s.quando = come(g.quando, '') in QUANDO ? g.quando : SCELTE_PREDEFINITE.quando;
  const tempo = come(g.tempo, SCELTE_PREDEFINITE.tempo);
  s.tempo = tempo === '' || tempo in TEMPI ? tempo : SCELTE_PREDEFINITE.tempo;
  const fatica = come(g.fatica, SCELTE_PREDEFINITE.fatica);
  s.fatica = fatica in FATICHE ? fatica : SCELTE_PREDEFINITE.fatica;
  const distanza = come(g.distanza, SCELTE_PREDEFINITE.distanza);
  s.distanza = distanza === '' || distanza in DISTANZE ? distanza : SCELTE_PREDEFINITE.distanza;
  const lunghezza = come(g.lunghezza, SCELTE_PREDEFINITE.lunghezza);
  s.lunghezza = lunghezza in LUNGHEZZE ? lunghezza : SCELTE_PREDEFINITE.lunghezza;
  if ('dormire' in s && !DOVE.includes(s.dormire)) delete s.dormire;
  return s;
}

export function leggiScelte(memoria = globalThis.localStorage) {
  try {
    return normalizzaScelte(JSON.parse(memoria.getItem(CHIAVE_SCELTE) ?? '{}'));
  } catch {
    return normalizzaScelte({});
  }
}

// Rimette in forma le scelte (anche quelle che l'app tiene in memoria, in modo che non restino storte) e le salva
export function salvaScelte(scelte, memoria = globalThis.localStorage) {
  Object.assign(scelte, normalizzaScelte(scelte));
  try {
    memoria.setItem(CHIAVE_SCELTE, JSON.stringify(scelte));
  } catch {
    // senza memoria del browser le scelte valgono solo ora
  }
  return scelte;
}

// Il tocco su una voce: «Cosa cerchi» accende e spegne le voci (più di una); tempo, distanza e fatica si tolgono
// toccando di nuovo la voce attiva; le altre scelte prendono il valore. → nuove scelte (le vecchie non si toccano)
export function applicaScelta(scelte, scelta, valore) {
  const s = normalizzaScelte(scelte);
  if (scelta === 'cerco') s.cerco = s.cerco.includes(valore) ? s.cerco.filter((x) => x !== valore) : [...s.cerco, valore];
  else if (scelta in SCELTE_FACOLTATIVE && s[scelta] === valore) s[scelta] = SCELTE_FACOLTATIVE[scelta];
  else s[scelta] = valore;
  return normalizzaScelte(s);
}
