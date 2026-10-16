// Quote scaricate da TINITALY per una traccia che non le ha (scheda del sentiero): si salvano a parte,
// accanto alla traccia, come elenco di quote nell'ordine dei punti. La traccia resta quella di prima
// (la sua impronta non cambia: panorama, fauna e terreno non si ricalcolano).
import { lineeConQuote } from './quote.js';

const conta = (pezzi) => pezzi.reduce((n, l) => n + l.length, 0);

// pezzi [[lon, lat, quota?]…]; z: quote nell'ordine dei punti; impronta: della geometria
// → { pezzi: con le quote } o null se le quote salvate non sono di questa traccia
export function conQuoteSalvate(pezzi, salvate, impronta) {
  if (!salvate || !Array.isArray(salvate.z) || salvate.impronta !== impronta) return null;
  if (salvate.z.length !== conta(pezzi) || salvate.z.some((q) => !Number.isFinite(q))) return null;
  let i = 0;
  return pezzi.map((linea) => linea.map(([lon, lat]) => [lon, lat, salvate.z[i++]]));
}

// pezzi con le quote → l'elenco da salvare (arrotondato al decimetro); null se manca anche un solo punto
export function quotePerSalvare(pezzi) {
  if (!lineeConQuote(pezzi)) return null;
  return pezzi.flat().map((p) => Math.round(p[2] * 10) / 10);
}

// Le quote da usare: quelle della traccia, altrimenti quelle scaricate. { pezzi, fonte } o null
// (fonte: 'traccia' o la fonte salvata, es. 'tinitaly')
export function quoteDellaScheda(pezzi, salvate, impronta) {
  if (lineeConQuote(pezzi)) return { pezzi, fonte: 'traccia' };
  const conQuote = conQuoteSalvate(pezzi, salvate, impronta);
  return conQuote ? { pezzi: conQuote, fonte: salvate.fonte ?? 'tinitaly' } : null;
}
