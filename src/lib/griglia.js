// Correzione per lo sforzo di osservazione: per ogni cella della griglia di iNaturalist
// confronta le osservazioni della specie con tutte le osservazioni verificate.
// Le tile "grid" sono UTFGrid 64×64: ogni cella aggregata occupa più caratteri.

export const MINIMO_RIFERIMENTO = 20;

function idDaCarattere(c) {
  let code = c.charCodeAt(0);
  if (code >= 93) code--;
  if (code >= 35) code--;
  return code - 32;
}

const lonDaTile = (x, z) => (x / 2 ** z) * 360 - 180;
const latDaTile = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};

// Celle di una tile: [{ chiave, limiti: [sud, ovest, nord, est], conteggio }]
export function celleDaTile(z, x, y, utf) {
  const righe = utf?.grid ?? [];
  const n = righe.length || 64;
  const estensioni = new Map();
  righe.forEach((riga, r) => {
    [...riga].forEach((car, c) => {
      const chiave = utf.keys?.[idDaCarattere(car)];
      if (!chiave || !utf.data?.[chiave]) return;
      const e = estensioni.get(chiave) ?? { r0: r, r1: r, c0: c, c1: c };
      e.r0 = Math.min(e.r0, r);
      e.r1 = Math.max(e.r1, r);
      e.c0 = Math.min(e.c0, c);
      e.c1 = Math.max(e.c1, c);
      estensioni.set(chiave, e);
    });
  });
  return [...estensioni].map(([chiave, e]) => {
    const ovest = lonDaTile(x + e.c0 / n, z);
    const est = lonDaTile(x + (e.c1 + 1) / n, z);
    const nord = latDaTile(y + e.r0 / n, z);
    const sud = latDaTile(y + (e.r1 + 1) / n, z);
    return {
      // la posizione nella tile identifica la cella anche tra ricerche diverse
      chiave: `${z}/${x}/${y}/${e.r0}/${e.c0}`,
      limiti: [sud, ovest, nord, est],
      conteggio: utf.data[chiave].cellCount ?? 1,
    };
  });
}

// Indice per cella = osservazioni della specie / tutte le osservazioni.
// Celle con meno di "minimo" osservazioni in tutto: dati insufficienti (indice null).
export function rapportoSforzo(celleSpecie, celleTutte, minimo = MINIMO_RIFERIMENTO) {
  const specie = new Map(celleSpecie.map((c) => [c.chiave, c.conteggio]));
  return celleTutte.map((c) => {
    const s = specie.get(c.chiave) ?? 0;
    return {
      chiave: c.chiave,
      limiti: c.limiti,
      specie: s,
      tutte: c.conteggio,
      indice: c.conteggio >= minimo ? s / c.conteggio : null,
    };
  });
}

// Classe 0 = nessuna osservazione della specie; 1–4 = quartili degli indici positivi
export function classifica(celle) {
  const positivi = celle.filter((c) => c.indice > 0).map((c) => c.indice).sort((a, b) => a - b);
  const soglia = (q) => positivi[Math.max(0, Math.ceil(q * positivi.length) - 1)];
  const soglie = positivi.length ? [soglia(0.25), soglia(0.5), soglia(0.75)] : [];
  return celle.map((c) => {
    if (c.indice == null) return { ...c, classe: null };
    if (c.indice === 0) return { ...c, classe: 0 };
    const classe = 1 + soglie.filter((s) => c.indice > s).length;
    return { ...c, classe };
  });
}

// Tile (x, y) che coprono un riquadro a un certo zoom
export function tilePerRiquadro([sud, ovest, nord, est], z) {
  const x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const y = (lat) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  const tile = [];
  for (let tx = x(ovest); tx <= x(est); tx++) for (let ty = y(nord); ty <= y(sud); ty++) tile.push([tx, ty]);
  return tile;
}
