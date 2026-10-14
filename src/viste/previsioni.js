// Previsioni meteo (Open-Meteo, gratuito e senza chiavi) per celle di 0,1°: scaricate a gruppi e
// tenute un'ora, anche sul dispositivo, così riaprire una pagina non le scarica di nuovo.
// Le usano "Dove vado domani", Suggeriscimi e la scheda del sentiero ("Quando andare").
import { urlPrevisioni, giorniDaRisposta } from '../lib/condizioni.js';

const VALIDITA_MS = 60 * 60 * 1000;
const CHIAVE = 'orme.previsioni';
const memoria = new Map(); // chiave della cella → { giorni, quando, finoA }
try {
  const salvate = JSON.parse(localStorage.getItem(CHIAVE) ?? '{}');
  for (const [k, v] of Object.entries(salvate)) if (v.quando > Date.now() - VALIDITA_MS) memoria.set(k, v);
} catch {
  // niente memoria del dispositivo: si scaricano ogni volta
}
function salva() {
  const recenti = Object.fromEntries([...memoria].filter(([, v]) => v.quando > Date.now() - VALIDITA_MS));
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(recenti));
  } catch {
    // spazio esaurito: restano solo in questa sessione
  }
}

// punti: [{ chiave, lat, lon }] (puntoMeteo); giorni: quanti giorni avanti servono
export async function scaricaPrevisioni(punti, { segnale, giorni = 2 } = {}) {
  const adesso = Date.now();
  const mancanti = punti.filter((p) => {
    const m = memoria.get(p.chiave);
    return !(m?.quando > adesso - VALIDITA_MS && (m.finoA ?? 2) >= giorni);
  });
  for (const { url, punti: gruppo } of urlPrevisioni(mancanti, { giorni })) {
    const r = await fetch(url, { signal: segnale });
    if (r.status === 429) throw new Error('troppe richieste a Open-Meteo, riprova tra un minuto');
    if (!r.ok) throw new Error(`Open-Meteo ha risposto ${r.status}`);
    const json = await r.json();
    const risposte = Array.isArray(json) ? json : [json];
    gruppo.forEach((p, i) => memoria.set(p.chiave, { giorni: giorniDaRisposta(risposte[i]), quando: adesso, finoA: giorni }));
  }
  if (mancanti.length) salva();
}

// il giorno "aaaa-mm-gg" di una cella già scaricata (o undefined)
export const previsioneDi = (chiave, data) => memoria.get(chiave)?.giorni?.[data];
