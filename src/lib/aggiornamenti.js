// Aggiornamenti dei dati iniziali già salvati sul telefono.
// Ogni campo cambia solo se ha ancora il valore originale: le mie modifiche non si toccano.
// campi: { 'percorso.del.campo': { da: valoreOriginale, a: valoreNuovo } }

const uguali = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);

function leggi(oggetto, percorso) {
  return percorso.split('.').reduce((o, k) => (o == null ? undefined : o[k]), oggetto);
}

function scrivi(oggetto, percorso, valore) {
  const chiavi = percorso.split('.');
  const copia = { ...oggetto };
  let nodo = copia;
  for (const k of chiavi.slice(0, -1)) {
    nodo[k] = { ...(nodo[k] ?? {}) };
    nodo = nodo[k];
  }
  nodo[chiavi[chiavi.length - 1]] = valore;
  return copia;
}

// Restituisce il sentiero aggiornato e l'elenco dei campi cambiati
export function applicaAggiornamento(sentiero, campi) {
  let risultato = sentiero;
  const cambiati = [];
  for (const [percorso, { da, a }] of Object.entries(campi)) {
    const attuale = leggi(risultato, percorso);
    if (uguali(attuale, da) && !uguali(attuale, a)) {
      risultato = scrivi(risultato, percorso, a);
      cambiati.push(percorso);
    }
  }
  return { sentiero: risultato, cambiati };
}

// Una traccia iniziale sostituisce quella salvata solo se manca o se è anch'essa iniziale
export function tracciaDaAggiornare(salvata, nuova) {
  if (!salvata) return true;
  if (!salvata.dettagli?.iniziale) return false;
  return !uguali(salvata.dettagli?.relazioniOsm, nuova.dettagli?.relazioniOsm) || !uguali(salvata.dettagli, nuova.dettagli);
}
