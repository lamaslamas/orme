// Profilo altimetrico: quota in funzione della distanza percorsa.
import { distanzaKm } from './geo.js';
import { lineeConQuote } from './quote.js';

// Restituisce { punti: [[km, quota]...], minimo, massimo, totaleKm } oppure null senza quote.
// I pezzi staccati vengono messi in fila (il salto tra un pezzo e l'altro non conta).
export function profiloAltimetrico(pezzi, massimoPunti = 160) {
  if (!lineeConQuote(pezzi)) return null;
  const tutti = [];
  let km = 0;
  pezzi.forEach((linea) => {
    linea.forEach((p, i) => {
      if (i > 0) km += distanzaKm(linea[i - 1], p);
      tutti.push([km, p[2]]);
    });
  });
  // riduce i punti a intervalli regolari di distanza
  const passo = km / (massimoPunti - 1) || 1;
  const punti = [];
  let prossimo = 0;
  for (const pt of tutti) {
    if (pt[0] >= prossimo || pt === tutti[tutti.length - 1]) {
      punti.push(pt);
      prossimo = pt[0] + passo;
    }
  }
  const quote = tutti.map((p) => p[1]);
  return { punti, minimo: Math.min(...quote), massimo: Math.max(...quote), totaleKm: km };
}

// Percorso SVG (area sotto la curva) per un riquadro larghezza × altezza
export function percorsoProfiloSvg(profilo, larghezza, altezza) {
  const { punti, minimo, massimo, totaleKm } = profilo;
  const margine = Math.max(20, (massimo - minimo) * 0.1);
  const basso = minimo - margine;
  const alto = massimo + margine;
  const x = (k) => (totaleKm ? (k / totaleKm) * larghezza : 0);
  const y = (q) => altezza - ((q - basso) / (alto - basso)) * altezza;
  const r = (n) => Math.round(n * 10) / 10;
  const linea = punti.map(([k, q], i) => `${i ? 'L' : 'M'}${r(x(k))} ${r(y(q))}`).join('');
  return { linea, area: `${linea}L${r(larghezza)} ${altezza}L0 ${altezza}Z`, y };
}
