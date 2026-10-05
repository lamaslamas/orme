// Archivio locale su IndexedDB.
// - sentieri: un elemento per sentiero (chiave: id)
// - tracce:   la traccia GeoJSON di un sentiero (chiave: sentieroId)
// - meta:     informazioni interne (es. dati iniziali già caricati)
import { DATI_INIZIALI } from './datiIniziali.js';
import { completaSentiero } from './lib/sentiero.js';

const NOME_DB = 'orme';
// 1: sentieri, tracce, meta
// 2: aggiunto il campo "bici" ai sentieri già salvati
const VERSIONE_DB = 2;
export const VERSIONE_BACKUP = 1;

let promessaDb = null;

function richiesta(req) {
  return new Promise((risolvi, rifiuta) => {
    req.onsuccess = () => risolvi(req.result);
    req.onerror = () => rifiuta(req.error);
  });
}

function fine(tx) {
  return new Promise((risolvi, rifiuta) => {
    tx.oncomplete = () => risolvi();
    tx.onerror = () => rifiuta(tx.error);
    tx.onabort = () => rifiuta(tx.error ?? new Error('Operazione annullata'));
  });
}

export function apriDb() {
  if (promessaDb) return promessaDb;
  promessaDb = new Promise((risolvi, rifiuta) => {
    const req = indexedDB.open(NOME_DB, VERSIONE_DB);
    req.onupgradeneeded = (evento) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sentieri')) db.createObjectStore('sentieri', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tracce')) db.createObjectStore('tracce', { keyPath: 'sentieroId' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'chiave' });
      if (evento.oldVersion >= 1 && evento.oldVersion < 2) {
        // Aggiunge la bici "da verificare" solo dove manca, senza toccare il resto
        const cursore = req.transaction.objectStore('sentieri').openCursor();
        cursore.onsuccess = () => {
          const c = cursore.result;
          if (!c) return;
          if (!c.value.bici) c.update(completaSentiero(c.value));
          c.continue();
        };
      }
    };
    req.onsuccess = () => risolvi(req.result);
    req.onerror = () => rifiuta(req.error);
  });
  return promessaDb;
}

// Solo per i test: chiude e dimentica la connessione
export async function chiudiDb() {
  if (!promessaDb) return;
  (await promessaDb).close();
  promessaDb = null;
}

async function leggiDa(store, chiave) {
  const db = await apriDb();
  return richiesta(db.transaction(store).objectStore(store).get(chiave));
}

async function tuttiDa(store) {
  const db = await apriDb();
  return richiesta(db.transaction(store).objectStore(store).getAll());
}

async function scriviIn(store, valore) {
  const db = await apriDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(valore);
  await fine(tx);
  return valore;
}

// --- Sentieri ---

export const tuttiISentieri = async () => (await tuttiDa('sentieri')).map(completaSentiero);

export async function leggiSentiero(id) {
  const s = await leggiDa('sentieri', id);
  return s && completaSentiero(s);
}

export function salvaSentiero(sentiero) {
  const adesso = new Date().toISOString();
  return scriviIn('sentieri', completaSentiero({ ...sentiero, creato: sentiero.creato ?? adesso, modificato: adesso }));
}

export async function eliminaSentiero(id) {
  const db = await apriDb();
  const tx = db.transaction(['sentieri', 'tracce'], 'readwrite');
  tx.objectStore('sentieri').delete(id);
  tx.objectStore('tracce').delete(id);
  await fine(tx);
}

// --- Tracce ---

export const leggiTraccia = (sentieroId) => leggiDa('tracce', sentieroId);

export function salvaTraccia(traccia) {
  return scriviIn('tracce', { ...traccia, salvata: new Date().toISOString() });
}

export async function eliminaTraccia(sentieroId) {
  const db = await apriDb();
  const tx = db.transaction('tracce', 'readwrite');
  tx.objectStore('tracce').delete(sentieroId);
  await fine(tx);
}

export async function sentieriConTraccia() {
  const db = await apriDb();
  const chiavi = await richiesta(db.transaction('tracce').objectStore('tracce').getAllKeys());
  return new Set(chiavi);
}

// --- Dati iniziali ---

// Carica i sentieri di partenza solo la prima volta che l'app viene aperta
export async function caricaDatiIniziali() {
  if (await leggiDa('meta', 'datiIniziali')) return false;
  const db = await apriDb();
  const tx = db.transaction(['sentieri', 'meta'], 'readwrite');
  const adesso = new Date().toISOString();
  for (const s of DATI_INIZIALI) {
    tx.objectStore('sentieri').put(completaSentiero({ ...s, creato: adesso, modificato: adesso }));
  }
  tx.objectStore('meta').put({ chiave: 'datiIniziali', caricati: adesso });
  await fine(tx);
  return true;
}

// --- Backup ---

export async function esporta() {
  return {
    app: 'orme',
    versione: VERSIONE_BACKUP,
    esportato: new Date().toISOString(),
    sentieri: await tuttiISentieri(),
    tracce: await tuttiDa('tracce'),
  };
}

export function controllaBackup(dati) {
  if (!dati || typeof dati !== 'object') throw new Error('Il file non contiene dati validi.');
  if (dati.app !== 'orme') throw new Error('Il file non è un backup di Orme.');
  if (!Array.isArray(dati.sentieri) || !Array.isArray(dati.tracce)) {
    throw new Error('Il backup è incompleto: mancano sentieri o tracce.');
  }
  if (dati.versione > VERSIONE_BACKUP) {
    throw new Error("Il backup è stato creato da una versione più recente dell'app.");
  }
  for (const s of dati.sentieri) {
    if (!s || typeof s.id !== 'string' || !s.id) throw new Error('Nel backup c’è un sentiero senza id.');
  }
  for (const t of dati.tracce) {
    if (!t || typeof t.sentieroId !== 'string') throw new Error('Nel backup c’è una traccia senza sentiero.');
  }
}

// modo "sostituisci": cancella tutto e carica il backup
// modo "unisci": aggiunge il backup, sovrascrivendo i sentieri con lo stesso id
export async function importa(dati, modo = 'unisci') {
  controllaBackup(dati);
  const db = await apriDb();
  const tx = db.transaction(['sentieri', 'tracce', 'meta'], 'readwrite');
  const sentieri = tx.objectStore('sentieri');
  const tracce = tx.objectStore('tracce');
  if (modo === 'sostituisci') {
    sentieri.clear();
    tracce.clear();
  }
  for (const s of dati.sentieri) sentieri.put(completaSentiero(s));
  for (const t of dati.tracce) tracce.put(t);
  // dopo un import i dati iniziali non vanno ricaricati
  tx.objectStore('meta').put({ chiave: 'datiIniziali', caricati: new Date().toISOString() });
  await fine(tx);
  return { sentieri: dati.sentieri.length, tracce: dati.tracce.length };
}
