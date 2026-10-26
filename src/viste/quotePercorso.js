// Le quote di un percorso mio: già disponibili (nella traccia o salvate) oppure scaricate dalle Terrain Tiles e salvate.
import { salvaPercorso, leggiPercorso } from '../db.js';
import { quoteDeiPezzi } from './quote.js';
import { improntaTraccia } from '../lib/panorama.js';
import { quoteDisponibili } from '../lib/quoteSalvate.js';

export { quoteDisponibili };

// Pezzi con le quote: già disponibili o chieste ora a Open-Meteo
export async function pezziConQuote(percorso, pezzi) {
  const pronte = quoteDisponibili(percorso, pezzi);
  if (pronte) return pronte;
  const impronta = improntaTraccia({ type: 'MultiLineString', coordinates: pezzi });
  try {
    const { pezzi: conQuote, fonte } = await quoteDeiPezzi(pezzi);
    // si rilegge il percorso: nel frattempo potrei averne cambiato nome o note
    const ora = (await leggiPercorso(percorso.id)) ?? percorso;
    const quote = { impronta, coordinates: conQuote, fonte };
    // un percorso arrivato da un link (sola lettura) non si scrive sul telefono
    if (!percorso.virtuale) await salvaPercorso({ ...ora, quote });
    percorso.quote = quote;
    return { pezzi: conQuote, fonte };
  } catch (e) {
    console.warn('Quote del percorso', e);
    return { pezzi, fonte: null };
  }
}
