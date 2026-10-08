// Stato condiviso dell'app: attività, parco, specie, filtri, impostazioni della heatmap
// e livelli della mappa. Resta valido mentre si passa da una sezione all'altra.

export const STATO_INIZIALE = {
  attivita: 'trekking', // trekking | mtb | emtb
  parco: '',
  specie: '', // chiave dell'animale ('' = nessuno)
  filtri: { stato: '', difficolta: '', accesso: '', paese: '', bici: '', testo: '' },
  // insieme: specie mostrate quando non è scelto un animale ('rare' o 'minacciate')
  heatmap: { insieme: 'rare', stagione: 'tutto', anni: 0, soloVerificate: true, correggiSforzo: false },
  livelli: { heatmap: false, percorsi: true, osservazione: true, confini: true, sentieriOsm: true },
  base: 'topo', // topo | curve | satellite
};

function unisci(base, modifica) {
  const r = { ...base };
  for (const [k, v] of Object.entries(modifica ?? {})) {
    r[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? { ...base[k], ...v } : v;
  }
  return r;
}

// memoria: sessionStorage nel browser, oppure un oggetto (per i test)
export function creaStato(memoria = null, chiave = 'orme.stato') {
  let stato = STATO_INIZIALE;
  try {
    stato = unisci(STATO_INIZIALE, JSON.parse(memoria?.getItem(chiave) ?? 'null') ?? {});
  } catch {
    // memoria non leggibile: si parte dallo stato iniziale
  }
  const ascoltatori = new Set();
  return {
    leggi: () => stato,
    imposta(modifica) {
      const precedente = stato;
      stato = unisci(stato, modifica);
      try {
        memoria?.setItem(chiave, JSON.stringify(stato));
      } catch {
        // pazienza: lo stato vale fino alla chiusura
      }
      for (const f of ascoltatori) f(stato, precedente);
    },
    ascolta(f) {
      ascoltatori.add(f);
      return () => ascoltatori.delete(f);
    },
    azzeraFiltri() {
      this.imposta({ specie: '', filtri: { ...STATO_INIZIALE.filtri } });
    },
  };
}

// Numero di filtri attivi (il parco conta solo se richiesto)
export function filtriAttiviStato(s, { contaParco = true } = {}) {
  return (contaParco && s.parco ? 1 : 0) + (s.specie ? 1 : 0) + Object.values(s.filtri).filter(Boolean).length;
}
