// Fotografia naturalistica: a che ora partire per essere in un punto del percorso all'alba o al tramonto,
// e quanto del cammino cade al buio. Solo calcoli sul telefono (sole: src/lib/sole.js; tempi: metodo CAI).
import { luciDelGiorno, minutiItaliani } from './sole.js';

export const ANTICIPO_ALBA_MIN = 20; // si arriva e ci si prepara prima che il sole sorga
export const SOSTA_TRAMONTO = 'oro'; // al tramonto si arriva all'inizio dell'ora d'oro e si resta fino al tramonto
export const ARROTONDA_MIN = 5;

// Orari del giorno in minuti dalla mezzanotte italiana (null se il sole non sorge o non tramonta)
export function orariDelGiorno(data, punto) {
  const l = luciDelGiorno(data, punto);
  const m = {};
  for (const [k, d] of Object.entries(l)) m[k] = minutiItaliani(d);
  return m;
}

// Minuti di cammino dalla partenza al km dato (serie: profiloTempi), interpolando
export function minutiAlKm(serie, km) {
  const { km: ks, min } = serie ?? {};
  if (!ks?.length) return null;
  if (km <= 0) return 0;
  const i = ks.findIndex((k) => k >= km);
  if (i < 0) return min.at(-1);
  if (i === 0) return min[0];
  const f = (km - ks[i - 1]) / (ks[i] - ks[i - 1] || 1);
  return min[i - 1] + (min[i] - min[i - 1]) * f;
}

const sotto = (min, soglia) => Math.max(0, Math.min(min, soglia));
