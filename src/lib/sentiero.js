import { LINK_PARCO, BICI_CONSENTITA, PEDALABILITA, SCALE_MTB, DIFFICOLTA } from './costanti.js';
import { PARCO_PREDEFINITO } from '../datiParchi.js';

export function biciPredefinita() {
  return { consentita: 'da_verificare', nota: '', link: LINK_PARCO, pedalabilita: null, scalaMtb: null };
}

// Completa un sentiero con i campi aggiunti nelle versioni successive dell'app.
// Non modifica i valori già presenti (se validi): serve per l'archivio e per i backup vecchi.
export function completaSentiero(s) {
  const bici = { ...biciPredefinita(), ...(s.bici ?? {}) };
  if (!Object.hasOwn(BICI_CONSENTITA, bici.consentita)) bici.consentita = 'da_verificare';
  if (!Object.hasOwn(PEDALABILITA, bici.pedalabilita ?? '')) bici.pedalabilita = null;
  if (!SCALE_MTB.includes(bici.scalaMtb)) bici.scalaMtb = null;
  if (bici.consentita === 'no') {
    bici.pedalabilita = null;
    bici.scalaMtb = null;
  }
  const difficolta = Object.hasOwn(DIFFICOLTA, s.difficolta ?? '') ? s.difficolta : null;
  // i sentieri creati prima dei parchi erano tutti del PNALM
  const parco = typeof s.parco === 'string' && s.parco ? s.parco : PARCO_PREDEFINITO;
  // un percorso può appartenere a più parchi; "parco" resta il principale
  const parchi = Array.isArray(s.parchi) && s.parchi.length ? s.parchi : [parco];
  return { ...s, bici, difficolta, parco, parchi };
}
