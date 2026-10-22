// L'immagine del percorso da condividere (1080×1350): i calcoli della mappa a tessere, senza canvas né rete.
export const LARGHEZZA = 1080;
export const ALTEZZA = 1350;
export const TESSERA = 256;
export const ZOOM_MAX = 16;

// coordinate "mondo" in pixel allo zoom z (proiezione Web Mercator)
export function pixelMondo([lon, lat], z) {
  const scala = TESSERA * 2 ** z;
  const sen = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * scala, (0.5 - Math.log((1 + sen) / (1 - sen)) / (4 * Math.PI)) * scala];
}

// riquadro [minLon, minLat, maxLon, maxLat] delle linee
export function riquadroLinee(linee) {
  const r = [Infinity, Infinity, -Infinity, -Infinity];
  for (const l of linee) for (const [lon, lat] of l) (r[0] = Math.min(r[0], lon)), (r[1] = Math.min(r[1], lat)), (r[2] = Math.max(r[2], lon)), (r[3] = Math.max(r[3], lat));
  return r;
}

// Lo zoom più grande per cui il riquadro sta in larghezza × altezza pixel (con un margine)
export function zoomPer(riquadro, larghezza, altezza, margine = 60, max = ZOOM_MAX) {
  for (let z = max; z >= 2; z--) {
    const [x0, y1] = pixelMondo([riquadro[0], riquadro[1]], z);
    const [x1, y0] = pixelMondo([riquadro[2], riquadro[3]], z);
    if (x1 - x0 <= larghezza - 2 * margine && y1 - y0 <= altezza - 2 * margine) return z;
  }
  return 2;
}

// La vista: zoom, angolo in alto a sinistra in pixel mondo e le tessere da scaricare per coprire larghezza × altezza
export function vista(riquadro, larghezza, altezza, margine = 60) {
  const z = zoomPer(riquadro, larghezza, altezza, margine);
  const [x0, y1] = pixelMondo([riquadro[0], riquadro[1]], z);
  const [x1, y0] = pixelMondo([riquadro[2], riquadro[3]], z);
  const sinistra = (x0 + x1) / 2 - larghezza / 2;
  const alto = (y0 + y1) / 2 - altezza / 2;
  const n = 2 ** z;
  const tessere = [];
  for (let ty = Math.floor(alto / TESSERA); ty <= Math.floor((alto + altezza) / TESSERA); ty++) {
    for (let tx = Math.floor(sinistra / TESSERA); tx <= Math.floor((sinistra + larghezza) / TESSERA); tx++) {
      if (ty >= 0 && ty < n) tessere.push({ x: ((tx % n) + n) % n, y: ty, px: tx * TESSERA - sinistra, py: ty * TESSERA - alto });
    }
  }
  return { z, sinistra, alto, tessere };
}

// punto [lon, lat] → pixel nell'immagine della mappa
export function suImmagine(p, v) {
  const [x, y] = pixelMondo(p, v.z);
  return [x - v.sinistra, y - v.alto];
}

// Profilo [{ km, z }] ridotto a poche decine di punti per il grafico
export function serieProfilo(pezzi, max = 160) {
  const serie = [];
  let km = 0;
  for (const linea of pezzi) {
    linea.forEach((p, i) => {
      if (i) {
        const dLat = ((p[1] - linea[i - 1][1]) * Math.PI) / 180;
        const dLon = ((p[0] - linea[i - 1][0]) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((linea[i - 1][1] * Math.PI) / 180) * Math.cos((p[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
        km += 2 * 6371 * Math.asin(Math.sqrt(a));
      }
      if (Number.isFinite(p[2])) serie.push({ km, z: p[2] });
    });
  }
  if (serie.length <= max) return serie;
  const passo = (serie.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => serie[Math.round(i * passo)]);
}

export const TEMI = {
  chiaro: { sfondo: '#f6f4ef', testo: '#253238', tenue: '#5f6e75', traccia: '#0f6e56', alone: '#ffffff', riquadro: '#ffffff', profilo: 'rgba(15,110,86,0.22)', scuraMappa: false },
  scuro: { sfondo: '#14201e', testo: '#eaf1ee', tenue: '#9db1ab', traccia: '#9fe1cb', alone: '#0b1412', riquadro: '#1c2d2a', profilo: 'rgba(159,225,203,0.25)', scuraMappa: true },
};
