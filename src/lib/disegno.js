// Percorso a tappe: tra due tappe un tratto calcolato da BRouter (agganciato ai sentieri) oppure «fuori sentiero» (linea
// dritta). Ogni tappa { p: [lon, lat], libero } dice come si arriva a lei dalla tappa prima. Qui solo i calcoli, senza mappa né rete.
import { distanzaKm } from './geo.js';

export const chiaveTratto = (a, b, libero) => `${a.p[0]},${a.p[1]}>${b.p[0]},${b.p[1]}${libero ? ':libero' : ''}`;

// tratto a mano libera: linea dritta, con un punto ogni 25 m (per le quote)
export function trattoLibero(a, b, passoM = 25) {
  const n = Math.max(1, Math.ceil((distanzaKm(a.p, b.p) * 1000) / passoM));
  const coordinate = Array.from({ length: n + 1 }, (_, k) => [a.p[0] + ((b.p[0] - a.p[0]) * k) / n, a.p[1] + ((b.p[1] - a.p[1]) * k) / n]);
  return { coordinate, terreno: [], libero: true };
}

// tratti in fila → una linea sola (il primo punto di ogni tratto è l'ultimo del precedente)
export function unisciTratti(tratti) {
  const linea = [];
  for (const t of tratti) {
    if (!t?.coordinate?.length) continue;
    linea.push(...(linea.length ? t.coordinate.slice(1) : t.coordinate));
  }
  return linea;
}

// terreno (tag OSM) dei tratti in fila, con le distanze dall'inizio del percorso
export function unisciTerreno(tratti) {
  const tutto = [];
  let base = 0;
  for (const t of tratti) {
    for (const x of t?.terreno ?? []) tutto.push({ ...x, daM: x.daM + base, aM: x.aM + base });
    base += lunghezzaM(t?.coordinate ?? []);
  }
  return tutto;
}
export const lunghezzaM = (linea) => linea.reduce((m, p, i) => (i ? m + distanzaKm(linea[i - 1], p) * 1000 : 0), 0);

export const eAnello = (punti) => punti.length > 2 && punti[0].p[0] === punti.at(-1).p[0] && punti[0].p[1] === punti.at(-1).p[1];

// inverte il verso: ogni punto tiene il modo del tratto che ora arriva a lui
export function inverti(punti) {
  const r = [...punti].reverse();
  return r.map((x, j) => ({ p: [...x.p], libero: j === 0 ? false : r[j - 1].libero, ...(Number.isFinite(x.pos) ? { pos: x.pos } : {}) }));
}

// profilo per la barra: [{ km, z }] al massimo `max` punti (pezzi con le quote)
export function profiloPezzi(pezzi, max = 240) {
  const serie = [];
  let km = 0;
  for (const linea of pezzi ?? []) {
    linea.forEach((p, i) => {
      if (i) km += distanzaKm(linea[i - 1], p);
      if (Number.isFinite(p[2])) serie.push({ km, z: p[2], p });
    });
  }
  if (serie.length <= max) return serie;
  const passo = serie.length / max;
  return Array.from({ length: max }, (_, k) => serie[Math.floor(k * passo)]).concat(serie.at(-1));
}

// il punto del profilo più vicino a quel km
export const puntoAlKm = (serie, km) => serie.reduce((m, x) => (Math.abs(x.km - km) < Math.abs(m.km - km) ? x : m), serie[0]);

// tratto segnato secondo BRouter: fa parte di un percorso escursionistico (locale, regionale, nazionale, internazionale)
export const terrenoSegnato = (tag) => Object.keys(tag ?? {}).some((k) => /^route_hiking_(l|r|n|i)wn$/.test(k));

// La scala verticale del profilo: almeno `minimo` metri di dislivello, così un percorso quasi piano appare piano (15 m non
// sembrano una collina). Il tratto vero sta al centro della scala. → { basso, alto }
export function scalaProfilo(min, max, minimo = 100) {
  const intervallo = max - min;
  if (!(intervallo < minimo)) return { basso: min, alto: max };
  const centro = (min + max) / 2;
  return { basso: centro - minimo / 2, alto: centro + minimo / 2 };
}
