// Quote dal servizio gratuito Open-Meteo (modello del terreno Copernicus, 90 m).
// Si inviano solo le coordinate della traccia del sentiero ufficiale.
import { distanzaKm } from './geo.js';

export const URL_QUOTE = 'https://api.open-meteo.com/v1/elevation';
export const MAX_PUNTI_RICHIESTA = 100;
const MAX_CAMPIONI = 2000;

// Indici dei punti da chiedere: uno ogni passoM circa, più il primo e l'ultimo
export function campionaIndici(linea, passoM) {
  const indici = [0];
  let percorsi = 0;
  for (let i = 1; i < linea.length; i++) {
    percorsi += distanzaKm(linea[i - 1], linea[i]) * 1000;
    if (percorsi >= passoM || i === linea.length - 1) {
      indici.push(i);
      percorsi = 0;
    }
  }
  return indici;
}

// Assegna una quota a ogni punto, interpolando in base alla distanza tra i campioni
export function interpolaQuote(linea, indici, quote) {
  const risultato = linea.map((p) => [p[0], p[1]]);
  for (let k = 0; k < indici.length; k++) risultato[indici[k]][2] = quote[k];
  for (let k = 1; k < indici.length; k++) {
    const da = indici[k - 1];
    const a = indici[k];
    if (a - da < 2) continue;
    let totale = 0;
    const progressivi = [0];
    for (let i = da + 1; i <= a; i++) {
      totale += distanzaKm(linea[i - 1], linea[i]);
      progressivi.push(totale);
    }
    for (let i = da + 1; i < a; i++) {
      const t = totale ? progressivi[i - da] / totale : 0;
      risultato[i][2] = quote[k - 1] + (quote[k] - quote[k - 1]) * t;
    }
  }
  for (const p of risultato) p[2] = Math.round(p[2] * 10) / 10;
  return risultato;
}

export async function aggiungiQuote(geojson, { fetchFn = fetch, passoM = 50 } = {}) {
  const linee = geojson.coordinates;
  let passo = passoM;
  let campioni = linee.map((l) => campionaIndici(l, passo));
  // tracce molto lunghe: meno campioni, per non fare troppe richieste
  while (campioni.reduce((n, c) => n + c.length, 0) > MAX_CAMPIONI) {
    passo *= 2;
    campioni = linee.map((l) => campionaIndici(l, passo));
  }

  const punti = campioni.flatMap((indici, j) => indici.map((i) => linee[j][i]));
  const quote = [];
  for (let k = 0; k < punti.length; k += MAX_PUNTI_RICHIESTA) {
    const blocco = punti.slice(k, k + MAX_PUNTI_RICHIESTA);
    const url =
      `${URL_QUOTE}?latitude=${blocco.map((p) => p[1].toFixed(5)).join(',')}` +
      `&longitude=${blocco.map((p) => p[0].toFixed(5)).join(',')}`;
    let dati;
    try {
      const risposta = await fetchFn(url);
      if (!risposta.ok) throw new Error(`il servizio ha risposto ${risposta.status}`);
      dati = await risposta.json();
    } catch (e) {
      throw new Error(`Quote non disponibili (${e.message}). Controlla la connessione e riprova.`);
    }
    if (!Array.isArray(dati.elevation) || dati.elevation.length !== blocco.length) {
      throw new Error('Risposta del servizio delle quote non valida.');
    }
    quote.push(...dati.elevation);
  }

  let k = 0;
  const coordinates = linee.map((linea, j) => {
    const q = campioni[j].map(() => quote[k++]);
    return interpolaQuote(linea, campioni[j], q);
  });
  return { type: 'MultiLineString', coordinates };
}
