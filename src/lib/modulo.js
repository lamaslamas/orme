import { ANIMALI, ACCESSI, LINK_PARCO, BICI_CONSENTITA, PEDALABILITA, SCALE_MTB, DIFFICOLTA } from './costanti.js';
import { parcoDa, PARCO_PREDEFINITO } from '../datiParchi.js';

// "F10, b4 + U1" -> ["F10", "B4", "U1"]
export function leggiCodici(testo) {
  const visti = new Set();
  for (const pezzo of String(testo ?? '').split(/[\s,;+/]+/)) {
    const codice = pezzo.trim().toUpperCase();
    if (codice) visti.add(codice);
  }
  return [...visti];
}

function numero(testo, { min = -Infinity, max = Infinity, etichetta }) {
  const pulito = String(testo ?? '').trim().replace(',', '.');
  if (pulito === '') return null;
  const n = Number(pulito);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${etichetta}: valore non valido.`);
  return n;
}

// Trasforma i valori del modulo (tutte stringhe) in un sentiero.
// Lancia un errore con un messaggio leggibile se qualcosa non va.
export function sentieroDaModulo(v, precedente = {}) {
  const nome = (v.nome ?? '').trim();
  if (!nome) throw new Error('Il nome è obbligatorio.');

  const ore = numero(v.durataOre, { min: 0, max: 48, etichetta: 'Durata (ore)' });
  const minuti = numero(v.durataMin, { min: 0, max: 59, etichetta: 'Durata (minuti)' });
  const durataMin = ore == null && minuti == null ? null : Math.round((ore ?? 0) * 60 + (minuti ?? 0));

  const lat = numero(v.lat, { min: -90, max: 90, etichetta: 'Latitudine' });
  const lon = numero(v.lon, { min: -180, max: 180, etichetta: 'Longitudine' });
  if ((lat == null) !== (lon == null)) throw new Error('Inserisci sia la latitudine sia la longitudine, oppure nessuna delle due.');

  const tipo = Object.hasOwn(ACCESSI, v.accessoTipo) ? v.accessoTipo : 'nessuno';
  const stato = v.stato === 'fatto' ? 'fatto' : 'da_fare';
  const consentita = Object.hasOwn(BICI_CONSENTITA, v.biciConsentita) ? v.biciConsentita : 'da_verificare';
  const vietata = consentita === 'no';

  const parco = parcoDa(v.parco) ? v.parco : precedente.parco ?? PARCO_PREDEFINITO;
  const sitoParco = parcoDa(parco).sito;
  return {
    ...precedente,
    parco,
    codici: leggiCodici(v.codici),
    nome,
    zona: (v.zona ?? '').trim(),
    descrizione: (v.descrizione ?? '').trim(),
    animali: (v.animali ?? []).filter((a) => Object.hasOwn(ANIMALI, a)),
    escursione: {
      associazione: (v.associazione ?? '').trim(),
      nomeUscita: (v.nomeUscita ?? '').trim(),
      periodo: (v.periodo ?? '').trim(),
    },
    difficolta: Object.hasOwn(DIFFICOLTA, v.difficolta ?? '') ? v.difficolta : null,
    lunghezzaKm: numero(v.lunghezzaKm, { min: 0, max: 200, etichetta: 'Lunghezza' }),
    dislivelloM: numero(v.dislivelloM, { min: 0, max: 5000, etichetta: 'Dislivello' }),
    durataMin,
    partenza: {
      paese: (v.paese ?? '').trim(),
      descrizione: (v.partenzaDescrizione ?? '').trim(),
      lat,
      lon,
    },
    accesso: {
      tipo,
      nota: (v.accessoNota ?? '').trim(),
      link: (v.accessoLink ?? '').trim() || sitoParco || LINK_PARCO,
    },
    bici: {
      consentita,
      emtb: vietata ? 'no' : Object.hasOwn(BICI_CONSENTITA, v.biciEmtb) ? v.biciEmtb : 'da_verificare',
      nota: (v.biciNota ?? '').trim(),
      link: (v.biciLink ?? '').trim() || sitoParco || LINK_PARCO,
      pedalabilita: !vietata && Object.hasOwn(PEDALABILITA, v.pedalabilita ?? '') ? v.pedalabilita : null,
      scalaMtb: !vietata && SCALE_MTB.includes(v.scalaMtb) ? v.scalaMtb : null,
    },
    stato,
    dataPercorso: stato === 'fatto' ? v.dataPercorso || null : precedente.dataPercorso ?? null,
    notePersonali: (v.notePersonali ?? '').trim(),
    daVerificare: Boolean(v.daVerificare),
  };
}
