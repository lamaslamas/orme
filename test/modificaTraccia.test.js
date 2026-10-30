import { describe, it, expect } from 'vitest';
import { creaBase, proietta, fetta, puntoAllaPos } from '../src/lib/modificaTraccia.js';
import { distanzaKm } from '../src/lib/geo.js';

// una traccia di circa 1,7 km a 40° di latitudine (0,001° di longitudine ≈ 85 m), in due pezzi
const base = creaBase([[[15, 40], [15.01, 40]], [[15.01, 40], [15.02, 40]]]);
const metri = (linea) => linea.reduce((m, p, i) => (i ? m + distanzaKm(linea[i - 1], p) * 1000 : 0), 0);

describe('base', () => {
  it('una linea sola, senza punti ripetuti, con le distanze', () => {
    expect(base.linea).toHaveLength(3);
    expect(Math.round(base.totaleM)).toBe(1704);
  });
  it('proietta un punto sulla traccia', () => {
    const r = proietta(base, [15.005, 40.0004]); // a nord, circa 44 m
    expect(Math.round(r.pos)).toBe(426);
    expect(Math.round(r.dM)).toBe(44);
  });
  it('il punto a una posizione e la fetta in un senso e nell\'altro', () => {
    expect(puntoAllaPos(base, base.totaleM / 2)[0]).toBeCloseTo(15.01, 4);
    const avanti = fetta(base, 200, 1200);
    expect(Math.round(metri(avanti))).toBe(1000);
    const indietro = fetta(base, 1200, 200);
    expect(indietro[0]).toEqual(avanti.at(-1));
    expect(indietro.at(-1)).toEqual(avanti[0]);
  });
});
