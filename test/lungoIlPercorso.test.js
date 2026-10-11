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
