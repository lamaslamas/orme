// Schema comune delle uscite di associazioni e guide: ogni fonte nuova legge le sue pagine
// e restituisce candidati in questa forma, poi l'importazione li unisce all'archivio
// (src/lib/importazione.js). Guida per aggiungere un'associazione: scripts/FONTI.md.
//
// Una fonte "elenco + pagine" (come Ecotur) si descrive con:
//   { fonte, organizzatore, parco, elenco, attesaMs, link(html, base) → [url], leggi(html, url) → candidato | null | { segnaposto: true } }
// e la legge scripts/importa-archivio.mjs con robots.txt, Crawl-delay e un'attesa minima tra le pagine.
import { animaliNelTesto, misureDalTesto, periodoDalTesto, riassunto, togliDatiPersonali, slug } from '../importazione.js';

// Campi del candidato: obbligatori e facoltativi
export const CAMPI_OBBLIGATORI = ['fonte', 'tipo', 'chiave', 'id', 'url', 'nome', 'organizzatore', 'parco'];
export const CAMPI_FACOLTATIVI = ['titoloFonte', 'descrizione', 'animali', 'partenza', 'paese', 'periodo', 'date', 'lunghezzaKm', 'dislivelloM', 'durataMin', 'difficolta', 'traccia'];

const ATTESA_MINIMA_MS = 5_000; // tra una pagina e l'altra, anche se robots.txt non chiede nulla

// Candidato "uscita guidata" da quello che una fonte sa dire. I testi passano sempre da
// togliDatiPersonali (email e telefoni non finiscono mai nell'archivio).
// testo: tutto il testo della pagina, per animali, misure e periodo se non dati a parte
export function candidatoUscita(def, { url, nome, descrizione = '', testo = '', partenza = '', paese = '', periodo = null, date = [], difficolta = null, id = null }) {
  const t = togliDatiPersonali(testo);
  return {
    fonte: def.fonte,
    tipo: 'uscita_guidata',
    chiave: url,
    id: id ?? `${def.fonte}-${slug(nome)}`,
    url,
    nome: riassunto(togliDatiPersonali(nome), 120),
    organizzatore: def.organizzatore,
    titoloFonte: `${def.organizzatore} – ${nome}`,
    parco: def.parco,
    descrizione: riassunto(togliDatiPersonali(descrizione)),
    animali: animaliNelTesto(`${nome}\n${t}`),
    partenza: riassunto(togliDatiPersonali(partenza), 120),
    ...(paese ? { paese } : {}),
    periodo: periodo ?? periodoDalTesto(t),
    ...(date.length ? { date } : {}),
    ...(difficolta ? { difficolta } : {}),
    ...misureDalTesto(t),
  };
}

// Problemi di un candidato (vuoto se va bene): campi mancanti o dati personali rimasti
export function controllaCandidato(c) {
  const problemi = CAMPI_OBBLIGATORI.filter((k) => !c?.[k]).map((k) => `manca ${k}`);
  const testi = ['nome', 'descrizione', 'partenza'].map((k) => c?.[k] ?? '').join(' ');
  if (togliDatiPersonali(testi) !== testi) problemi.push('contiene email o telefoni');
  return problemi;
}

// Una definizione di fonte "elenco + pagine" completa
export function controllaFonte(def) {
  const mancano = ['fonte', 'organizzatore', 'parco', 'elenco'].filter((k) => !def?.[k]);
  if (typeof def?.link !== 'function') mancano.push('link');
  if (typeof def?.leggi !== 'function') mancano.push('leggi');
  return mancano;
}

export const attesaTraLePagine = (def, robotsMs = 0) => Math.max(ATTESA_MINIMA_MS, def.attesaMs ?? 0, robotsMs);
