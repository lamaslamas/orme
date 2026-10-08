// Archivio locale su IndexedDB.
// - sentieri: un elemento per sentiero (chiave: id)
// - tracce:   la traccia GeoJSON di un sentiero (chiave: sentieroId)
// - giri:     giri combinati di più sentieri (chiave: id)
// - avvistamenti: i miei avvistamenti (chiave: id) – restano solo sul dispositivo
// - confini:  confini dei parchi scaricati da OpenStreetMap (chiave: parco)
// - osservazioni: osservazioni iNaturalist in memoria (chiave: id)
// - meta:     informazioni interne (es. dati iniziali già caricati)
import { DATI_INIZIALI, VERSIONE_DATI_INIZIALI, VERSIONE_TRACCE_INIZIALI } from './datiIniziali.js';
import { completaSentiero } from './lib/sentiero.js';
import { completaGiro } from './lib/giro.js';
import { completaAvvistamento } from './lib/avvistamenti.js';

const NOME_DB = 'orme';
// 1: sentieri, tracce, meta
// 2: aggiunto il campo "bici" ai sentieri già salvati
// 3: aggiunto l'archivio "giri"
// 4: parchi (campo "parco" nei sentieri), avvistamenti, confini, osservazioni
const VERSIONE_DB = 4;
// backup 1: sentieri e tracce; 2: anche i giri; 3: anche gli avvistamenti (facoltativi)
export const VERSIONE_BACKUP = 3;

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
      if (!db.objectStoreNames.contains('giri')) db.createObjectStore('giri', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('avvistamenti')) db.createObjectStore('avvistamenti', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('confini')) db.createObjectStore('confini', { keyPath: 'parco' });
      if (!db.objectStoreNames.contains('osservazioni')) {
        db.createObjectStore('osservazioni', { keyPath: 'id' }).createIndex('parco', 'parco');
      }
      if (evento.oldVersion >= 1 && evento.oldVersion < 4) {
        // Aggiunge i campi nuovi (bici, parco) solo dove mancano, senza toccare il resto
        const cursore = req.transaction.objectStore('sentieri').openCursor();
        cursore.onsuccess = () => {
          const c = cursore.result;
          if (!c) return;
          if (!c.value.bici || !c.value.parco) c.update(completaSentiero(c.value));
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

export async function tutteLeTracce() {
  return new Map((await tuttiDa('tracce')).map((t) => [t.sentieroId, t]));
}

export async function sentieriConTraccia() {
  const db = await apriDb();
  const chiavi = await richiesta(db.transaction('tracce').objectStore('tracce').getAllKeys());
  return new Set(chiavi);
}

// --- Giri ---

export const tuttiIGiri = async () => (await tuttiDa('giri')).map(completaGiro);

export async function leggiGiro(id) {
  const g = await leggiDa('giri', id);
  return g && completaGiro(g);
}

export function salvaGiro(giro) {
  const adesso = new Date().toISOString();
  return scriviIn('giri', completaGiro({ ...giro, creato: giro.creato ?? adesso, modificato: adesso }));
}

export async function eliminaGiro(id) {
  const db = await apriDb();
  const tx = db.transaction('giri', 'readwrite');
  tx.objectStore('giri').delete(id);
  await fine(tx);
}

// --- Avvistamenti (solo sul dispositivo) ---

export const tuttiGliAvvistamenti = async () => (await tuttiDa('avvistamenti')).map(completaAvvistamento);

export async function leggiAvvistamento(id) {
  const a = await leggiDa('avvistamenti', id);
  return a && completaAvvistamento(a);
}

export function salvaAvvistamento(a) {
  const adesso = new Date().toISOString();
  return scriviIn('avvistamenti', completaAvvistamento({ ...a, creato: a.creato ?? adesso, modificato: adesso }));
}

export async function eliminaAvvistamento(id) {
  const db = await apriDb();
  const tx = db.transaction('avvistamenti', 'readwrite');
  tx.objectStore('avvistamenti').delete(id);
  await fine(tx);
}

// --- Confini dei parchi ---

export const leggiConfine = (parco) => leggiDa('confini', parco);
export const tuttiIConfini = () => tuttiDa('confini');
export const salvaConfine = (confine) => scriviIn('confini', { ...confine, scaricato: new Date().toISOString() });

// --- Dati iniziali ---

// Carica i sentieri di partenza solo la prima volta che l'app viene aperta
// La prima volta carica tutti i sentieri di partenza; in seguito aggiunge solo
// quelli comparsi in versioni più recenti dell'app (es. i nuovi parchi), senza
// ricreare quelli che ho eliminato. Restituisce true se ha aggiunto qualcosa.
export async function caricaDatiIniziali() {
  const meta = await leggiDa('meta', 'datiIniziali');
  const versione = meta ? (meta.versione ?? 1) : 0;
  if (versione >= VERSIONE_DATI_INIZIALI) return false;
  const db = await apriDb();
  const esistenti = new Set(await richiesta(db.transaction('sentieri').objectStore('sentieri').getAllKeys()));
  const nuovi = DATI_INIZIALI.filter((s) => (s.aggiunto ?? 1) > versione && !esistenti.has(s.id));
  // tracce iniziali: solo per i sentieri presenti e senza una traccia (mai sovrascrivere le mie)
  let tracceNuove = [];
  if (versione < VERSIONE_TRACCE_INIZIALI) {
    const { default: tracceIniziali } = await import('./tracceIniziali.json');
    const conTraccia = new Set(await richiesta(db.transaction('tracce').objectStore('tracce').getAllKeys()));
    const presenti = new Set([...esistenti, ...nuovi.map((s) => s.id)]);
    tracceNuove = tracceIniziali.filter((t) => presenti.has(t.sentieroId) && !conTraccia.has(t.sentieroId));
  }
  const tx = db.transaction(['sentieri', 'tracce', 'meta'], 'readwrite');
  const adesso = new Date().toISOString();
  for (const s of nuovi) {
    tx.objectStore('sentieri').put(completaSentiero({ ...s, creato: adesso, modificato: adesso }));
  }
  for (const t of tracceNuove) tx.objectStore('tracce').put({ ...t, salvata: adesso });
  tx.objectStore('meta').put({ chiave: 'datiIniziali', caricati: adesso, versione: VERSIONE_DATI_INIZIALI });
  await fine(tx);
  return nuovi.length + tracceNuove.length > 0;
}

// --- Backup ---

// Per i file da condividere gli avvistamenti si escludono (è la scelta predefinita)
export async function esporta({ escludiAvvistamenti = true } = {}) {
  const meta = await leggiDa('meta', 'datiIniziali');
  return {
    app: 'orme',
    versione: VERSIONE_BACKUP,
    esportato: new Date().toISOString(),
    versioneDatiIniziali: meta?.versione ?? 1,
    sentieri: await tuttiISentieri(),
    tracce: await tuttiDa('tracce'),
    giri: await tuttiIGiri(),
    ...(escludiAvvistamenti ? { avvistamentiEsclusi: true } : { avvistamenti: await tuttiGliAvvistamenti() }),
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
  // i backup della versione 1 non hanno i giri
  if (dati.giri != null && !Array.isArray(dati.giri)) throw new Error('Nel backup i giri non sono validi.');
  for (const g of dati.giri ?? []) {
    if (!g || typeof g.id !== 'string' || !g.id || !Array.isArray(g.tappe)) {
      throw new Error('Nel backup c’è un giro non valido.');
    }
  }
  if (dati.avvistamenti != null && !Array.isArray(dati.avvistamenti)) throw new Error('Nel backup gli avvistamenti non sono validi.');
  for (const a of dati.avvistamenti ?? []) {
    if (!a || typeof a.id !== 'string' || !a.id) throw new Error('Nel backup c’è un avvistamento non valido.');
  }
}

// modo "sostituisci": cancella tutto e carica il backup
// modo "unisci": aggiunge il backup, sovrascrivendo i sentieri con lo stesso id
export async function importa(dati, modo = 'unisci') {
  controllaBackup(dati);
  const db = await apriDb();
  const tx = db.transaction(['sentieri', 'tracce', 'giri', 'avvistamenti', 'meta'], 'readwrite');
  const sentieri = tx.objectStore('sentieri');
  const tracce = tx.objectStore('tracce');
  const giri = tx.objectStore('giri');
  const avvistamenti = tx.objectStore('avvistamenti');
  const conAvvistamenti = Array.isArray(dati.avvistamenti);
  if (modo === 'sostituisci') {
    sentieri.clear();
    tracce.clear();
    giri.clear();
    // un backup senza avvistamenti non cancella quelli che ho sul telefono
    if (conAvvistamenti) avvistamenti.clear();
  }
  for (const a of dati.avvistamenti ?? []) avvistamenti.put(completaAvvistamento(a));
  for (const s of dati.sentieri) sentieri.put(completaSentiero(s));
  for (const t of dati.tracce) tracce.put(t);
  for (const g of dati.giri ?? []) giri.put(completaGiro(g));
  // dopo un import i dati iniziali del backup non vanno ricaricati
  tx.objectStore('meta').put({
    chiave: 'datiIniziali',
    caricati: new Date().toISOString(),
    versione: dati.versioneDatiIniziali ?? 1,
  });
  await fine(tx);
  return {
    sentieri: dati.sentieri.length,
    tracce: dati.tracce.length,
    giri: dati.giri?.length ?? 0,
    avvistamenti: dati.avvistamenti?.length ?? 0,
  };
}
