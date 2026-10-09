// Archivio pubblico dei percorsi (dati/archivio.json) e unione con i miei dati sul telefono.
// Regola: un campo dell'archivio aggiorna il mio solo se io non l'ho modificato
// (confronto a tre vie: versione precedente dell'archivio, la mia, quella nuova).

// Campi solo miei: l'archivio non li tocca mai
export const CAMPI_PERSONALI = ['stato', 'dataPercorso', 'notePersonali', 'creato', 'modificato', 'salvato'];

const uguali = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Record dell'archivio a partire da un sentiero (senza i campi personali)
export function recordDaSentiero(s) {
  const r = { ...s };
  for (const k of CAMPI_PERSONALI) delete r[k];
  return r;
}

// Unione a tre vie, campo per campo (anche dentro gli oggetti come accesso o bici)
export function unisciTreVie(base, mio, nuovo) {
  if (!mio) return { ...nuovo };
  const risultato = { ...mio };
  for (const k of Object.keys(nuovo)) {
    if (CAMPI_PERSONALI.includes(k)) continue;
    const vb = base?.[k];
    const vm = mio[k];
    const vn = nuovo[k];
    if (vn && typeof vn === 'object' && !Array.isArray(vn) && vm && typeof vm === 'object' && !Array.isArray(vm)) {
      risultato[k] = unisciTreVie(vb ?? {}, vm, vn);
    } else if (uguali(vm, vb) || vm === undefined) {
      risultato[k] = vn; // non l'ho toccato: vale l'archivio
    }
    // altrimenti resta il mio valore
  }
  return risultato;
}

// Una traccia dell'archivio sostituisce la mia solo se manca o se viene anch'essa dall'archivio
export function tracciaDaArchivio(mia, nuova) {
  if (!nuova?.geojson) return false;
  if (!mia) return true;
  if (!(mia.dettagli?.archivio || mia.dettagli?.iniziale)) return false; // GPX o scelta mia
  return !uguali(mia.geojson, nuova.geojson) || !uguali(mia.dettagli, nuova.dettagli);
}

// Calcola cosa salvare: sentieri, tracce e nuove "basi" (copia dell'archivio per il prossimo confronto)
export function pianoSincronizzazione(archivio, { miei, basi, tracce }) {
  const sentieri = [];
  const tracceNuove = [];
  const basiNuove = [];
  for (const record of archivio?.percorsi ?? []) {
    const { traccia, ...dati } = record;
    const mio = miei.get(dati.id);
    const base = basi.get(dati.id) ?? null;
    const unito = unisciTreVie(base, mio, dati);
    if (!mio || !uguali(recordDaSentiero(unito), recordDaSentiero(mio))) sentieri.push(unito);
    if (!uguali(base, dati)) basiNuove.push(dati);
    const t = traccia ? { sentieroId: dati.id, ...traccia, dettagli: { ...traccia.dettagli, archivio: true } } : null;
    if (t && tracciaDaArchivio(tracce.get(dati.id), t)) tracceNuove.push(t);
  }
  return { sentieri, tracce: tracceNuove, basi: basiNuove };
}

export function controllaArchivio(dati) {
  if (!dati || dati.app !== 'orme-archivio' || !Array.isArray(dati.percorsi)) throw new Error('Archivio non valido.');
  for (const p of dati.percorsi) if (!p?.id || !p?.nome) throw new Error('Archivio: percorso senza id o nome.');
}
