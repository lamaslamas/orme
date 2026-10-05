// Stima della durata di un'escursione con il metodo usato dal CAI
// (norma DIN 33466, derivata dal metodo svizzero):
// - in piano: 4 km all'ora
// - in salita: 300 m di dislivello all'ora
// - in discesa: 500 m di dislivello all'ora
// La durata è il tempo maggiore tra "piano" e "dislivello", più metà del minore.
// Le soste non sono comprese.

export const VELOCITA_PIANO_KMH = 4;
export const SALITA_MH = 300;
export const DISCESA_MH = 500;

export const SPIEGAZIONE_DURATA =
  'Stima con il metodo usato dal CAI (norma DIN 33466): 4 km/h in piano, 300 m/h in salita, ' +
  '500 m/h in discesa. Si calcolano il tempo per la distanza e quello per il dislivello; ' +
  'la durata è il maggiore dei due più metà del minore. Soste escluse: è una stima per un ' +
  'escursionista medio, da adattare al proprio passo, al terreno e al meteo.';

// Restituisce i minuti stimati. Se il dislivello non è noto (null), usa solo la distanza.
export function stimaDurataMin(km, disl) {
  if (!Number.isFinite(km) || km < 0) return null;
  const orePiano = km / VELOCITA_PIANO_KMH;
  if (!disl) return Math.round(orePiano * 60);
  const oreDislivello = disl.salita / SALITA_MH + disl.discesa / DISCESA_MH;
  const maggiore = Math.max(orePiano, oreDislivello);
  const minore = Math.min(orePiano, oreDislivello);
  return Math.round((maggiore + minore / 2) * 60);
}
