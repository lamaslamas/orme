// Previsioni meteo (Open-Meteo, gratuito e senza chiavi) per celle di 0,1°: scaricate a gruppi e
// tenute un'ora, anche sul dispositivo, così riaprire una pagina non le scarica di nuovo.
// Le usano Suggerisci e il blocco «Quando» della scheda del sentiero.
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

export const TEMPO_MASSIMO_MS = 10_000; // oltre, la richiesta si lascia: i risultati non aspettano il meteo
export const ATTESA_429_MS = 3000;
const inCorso = new Map(); // url → richiesta già partita (stesse celle chieste due volte: una sola chiamata)

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// una richiesta con limite di tempo; con 429 (troppe richieste) si aspetta e si riprova una volta
async function scarica(url, segnale) {
  for (let tentativo = 0; ; tentativo++) {
    const controllo = new AbortController();
    const scaduto = setTimeout(() => controllo.abort(), TEMPO_MASSIMO_MS);
    segnale?.addEventListener('abort', () => controllo.abort(), { once: true });
    try {
      const r = await fetch(url, { signal: controllo.signal });
      if (r.status === 429 && tentativo === 0) {
        clearTimeout(scaduto);
        await attendi(ATTESA_429_MS);
        continue;
      }
      if (r.status === 429) throw new Error('troppe richieste a Open-Meteo, riprova tra un minuto');
      if (!r.ok) throw new Error(`Open-Meteo ha risposto ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(scaduto);
    }
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
    if (!inCorso.has(url)) inCorso.set(url, scarica(url, segnale).finally(() => inCorso.delete(url)));
    const json = await inCorso.get(url);
    const risposte = Array.isArray(json) ? json : [json];
    gruppo.forEach((p, i) => memoria.set(p.chiave, { giorni: giorniDaRisposta(risposte[i]), quando: adesso, finoA: giorni }));
  }
  if (mancanti.length) salva();
}

// il giorno "aaaa-mm-gg" di una cella già scaricata (o undefined)
export const previsioneDi = (chiave, data) => memoria.get(chiave)?.giorni?.[data];
