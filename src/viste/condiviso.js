// «#/condiviso?d=…»: un percorso arrivato da un link. Si vede la scheda in sola lettura (profilo, tempi, acqua, fauna, meteo)
// e «Salva nei miei percorsi». Il link non contiene altro che traccia, nome, note e verso: tutto si calcola qui.
import { leggiLink } from '../lib/condividi.js';
import { vistaPercorso } from './percorso.js';

export async function vistaCondiviso(app, query) {
  // il testo grezzo dell'indirizzo: il router lo ha già decodificato e un «&» o un «%» nel nome lo romperebbero
  const grezzo = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?') + 1) : query;
  const dati = leggiLink(grezzo);
  if (!dati) {
    app.innerHTML = '<p class="vuoto">Questo link non contiene un percorso valido (forse è stato tagliato). <a href="#/">Torna alla mappa</a></p>';
    return;
  }
  return vistaPercorso(app, 'condiviso', dati);
}
