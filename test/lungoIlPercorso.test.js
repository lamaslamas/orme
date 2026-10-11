import { describe, it, expect } from 'vitest';
import { campionaPezzi, percorsoCoperto, riquadroDeiPezzi } from '../src/lib/lungoIlPercorso.js';

// circa 2,2 km verso est, a 41,8° N
const pezzi = [[[13.8, 41.8], [13.81, 41.8], [13.82, 41.8], [13.827, 41.8]]];

describe('copertura dei punti per un percorso di Pianifica', () => {
  it('campiona la traccia ogni 500 m circa, primo e ultimo punto compresi', () => {
    const c = campionaPezzi(pezzi);
    expect(c[0]).toEqual([13.8, 41.8]);
    expect(c.at(-1)).toEqual([13.827, 41.8]);
  });

  it('coperto solo se tutto il percorso è dentro le zone (confine o riquadro)', () => {
    const quadrato = [[[13.7, 41.7], [13.9, 41.7], [13.9, 41.9], [13.7, 41.9], [13.7, 41.7]]];
    expect(percorsoCoperto(pezzi, [{ anelli: quadrato }])).toBe(true);
    expect(percorsoCoperto(pezzi, [{ bbox: [41.7, 13.7, 41.9, 13.815] }])).toBe(false); // esce a est
    expect(percorsoCoperto(pezzi, [{ bbox: [41.7, 13.7, 41.9, 13.815] }, { bbox: [41.7, 13.81, 41.9, 13.9] }])).toBe(true);
    expect(percorsoCoperto(pezzi, [])).toBe(false);
  });

  it('riquadro della traccia con un margine di 1 km', () => {
    const [s, o, n, e] = riquadroDeiPezzi(pezzi);
    expect(s).toBeCloseTo(41.791, 3);
    expect(n).toBeCloseTo(41.809, 3);
    expect(o).toBeLessThan(13.8);
    expect(e).toBeGreaterThan(13.827);
    expect(riquadroDeiPezzi([])).toBeNull();
  });
});

import { kmLungoLaTraccia, lunghezzaDeiPezzi, trattoPiuLungoSenza, km1 } from '../src/lib/lungoIlPercorso.js';
describe('punti lungo la traccia: al km X', () => {
  // andata verso est, poi verso nord
  const giro = [[[13.8, 41.8], [13.82, 41.8]], [[13.82, 41.8], [13.82, 41.82]]];
  it('il km si conta nell\'ordine di percorrenza, anche tra pezzi diversi', () => {
    const tot = lunghezzaDeiPezzi(giro);
    expect(tot).toBeCloseTo(1.66 + 2.22, 1);
    expect(kmLungoLaTraccia([13.81, 41.8005], giro)).toBeCloseTo(0.83, 1); // metà del primo pezzo
    expect(kmLungoLaTraccia([13.8205, 41.81], giro)).toBeCloseTo(1.66 + 1.11, 1); // metà del secondo
  });
  it('tratto più lungo senza punti, partenza e arrivo compresi', () => {
    expect(trattoPiuLungoSenza([2, 9], 12)).toEqual({ da: 2, a: 9, km: 7 });
    expect(trattoPiuLungoSenza([], 5)).toEqual({ da: 0, a: 5, km: 5 });
    expect(km1(12.44)).toBe('12,4');
  });
});
