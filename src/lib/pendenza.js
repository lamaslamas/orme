// Analisi delle pendenze di un percorso con le quote.
// Le quote (GPS, modello del terreno) hanno errori di metri: la pendenza si calcola
// su una finestra di ~100 m, su tratti più corti sarebbe soprattutto rumore.
import { distanzaKm } from './geo.js';
import { lineeConQuote } from './quote.js';

export const PASSO_M = 25;
export const FINESTRA_M = 100;
export const SOGLIA_PIANO = 5; // % sotto la quale il tratto conta come "piano"

// Classi per il colore del profilo (pendenza in valore assoluto, %)
export const CLASSI_PENDENZA = [
  { max: 5, nome: 'meno del 5%', colore: '#9fd8b0' },
  { max: 15, nome: '5–15%', colore: '#f2d34b' },
  { max: 25, nome: '15–25%', colore: '#f59e0b' },
  { max: 35, nome: '25–35%', colore: '#dc2626' },
  { max: Infinity, nome: 'oltre il 35%', colore: '#7f1d1d' },
];

export const classePendenza = (p) => CLASSI_PENDENZA.findIndex((c) => Math.abs(p) < c.max);

// Punti ogni PASSO_M lungo i pezzi messi in fila: [{ m, quota }]
export function campiona(pezzi, passoM = PASSO_M) {
  if (!lineeConQuote(pezzi)) return null;
  const punti = [];
  let base = 0;
  for (const linea of pezzi) {
    let prog = 0;
    let prossimo = 0;
    for (let i = 0; i < linea.length; i++) {
      const d = i ? distanzaKm(linea[i - 1], linea[i]) * 1000 : 0;
      const inizio = prog;
      prog += d;
      while (prossimo <= prog) {
        const t = d ? (prossimo - inizio) / d : 0;
        const q = i ? linea[i - 1][2] + (linea[i][2] - linea[i - 1][2]) * t : linea[0][2];
        punti.push({ m: base + prossimo, quota: q });
        prossimo += passoM;
      }
    }
    const ultimo = linea[linea.length - 1];
    if (punti[punti.length - 1].m < base + prog) punti.push({ m: base + prog, quota: ultimo[2] });
    base += prog;
  }
  return punti;
}

// Pendenza (%) di ogni campione, misurata tra ±metà finestra
export function pendenze(campioni, finestraM = FINESTRA_M) {
  const n = campioni.length;
  return campioni.map((c, i) => {
    let a = i;
    let b = i;
    while (a > 0 && c.m - campioni[a].m < finestraM / 2) a--;
    while (b < n - 1 && campioni[b].m - c.m < finestraM / 2) b++;
    const dm = campioni[b].m - campioni[a].m;
    return dm > 0 ? ((campioni[b].quota - campioni[a].quota) / dm) * 100 : 0;
  });
}

// Riepilogo: km in salita/discesa/piano, pendenze massime, tratti più ripidi
export function analizzaPendenze(pezzi) {
  const campioni = campiona(pezzi);
  if (!campioni || campioni.length < 2) return null;
  const p = pendenze(campioni);
  const km = { salita: 0, discesa: 0, piano: 0 };
  const perClasse = CLASSI_PENDENZA.map(() => 0);
  for (let i = 1; i < campioni.length; i++) {
    const d = (campioni[i].m - campioni[i - 1].m) / 1000;
    const media = (p[i] + p[i - 1]) / 2;
    if (media >= SOGLIA_PIANO) km.salita += d;
    else if (media <= -SOGLIA_PIANO) km.discesa += d;
    else km.piano += d;
    perClasse[classePendenza(media)] += d;
  }
  // tratti più ripidi: massimi della pendenza assoluta, distanti almeno 300 m tra loro
  const ordinati = p.map((v, i) => ({ i, v })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const ripidi = [];
  for (const x of ordinati) {
    if (ripidi.length === 3) break;
    if (ripidi.some((r) => Math.abs(campioni[r.i].m - campioni[x.i].m) < 300)) continue;
    ripidi.push(x);
  }
  return {
    campioni,
    pendenze: p,
    km,
    perClasse,
    maxSalita: Math.max(0, ...p),
    maxDiscesa: Math.min(0, ...p),
    tratti: ripidi.map((r) => ({ km: campioni[r.i].m / 1000, pendenza: r.v, quota: campioni[r.i].quota })),
  };
}
