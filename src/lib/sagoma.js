// Sagoma di una traccia come percorso SVG, da usare al posto della foto nelle schede.

// Riduce i punti mantenendo la forma (prende un punto ogni "passo")
function semplifica(linea, massimo) {
  if (linea.length <= massimo) return linea;
  const passo = (linea.length - 1) / (massimo - 1);
  return Array.from({ length: massimo }, (_, i) => linea[Math.round(i * passo)]);
}

// Restituisce l'attributo "d" di un <path> che sta nel riquadro larghezza × altezza
export function sagomaSvg(geojson, larghezza = 100, altezza = 100, margine = 10) {
  const linee = (geojson?.coordinates ?? []).filter((l) => l.length > 1);
  if (!linee.length) return '';
  const punti = linee.flat();
  const latMedia = punti.reduce((s, p) => s + p[1], 0) / punti.length;
  const k = Math.cos((latMedia * Math.PI) / 180);
  const xs = punti.map((p) => p[0] * k);
  const ys = punti.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const larg = maxX - minX || 1e-9;
  const alt = maxY - minY || 1e-9;
  const scala = Math.min((larghezza - 2 * margine) / larg, (altezza - 2 * margine) / alt);
  // centrata nel riquadro
  const ox = (larghezza - larg * scala) / 2;
  const oy = (altezza - alt * scala) / 2;
  const fmt = (n) => Math.round(n * 10) / 10;
  const massimoPerLinea = Math.max(20, Math.floor(300 / linee.length));
  return linee
    .map((l) =>
      semplifica(l, massimoPerLinea)
        .map((p, i) => `${i ? 'L' : 'M'}${fmt(ox + (p[0] * k - minX) * scala)} ${fmt(oy + (maxY - p[1]) * scala)}`)
        .join(''),
    )
    .join('');
}
