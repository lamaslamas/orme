import { describe, it, expect } from 'vitest';
import { puntoSullaLinea } from '../src/lib/misure.js';

// 0,001° di latitudine ≈ 111,2 m
const p = (n, q) => (q == null ? [13.8, 41.7 + n * 0.001] : [13.8, 41.7 + n * 0.001, q]);

describe('punto di una linea più vicino a un punto', () => {
  // una "L": 3 punti verso nord, poi verso est
  const linea = [p(0, 1000), p(1, 1050), p(2, 1100), [13.802, 41.702, 1080]];

  it('aggancia un punto vicino alla traccia', () => {
    const s = puntoSullaLinea(linea, [13.8001, 41.7005]);
    expect(s.indice).toBe(0);
    expect(s.t).toBeCloseTo(0.5, 2);
    expect(s.daInizioM).toBeCloseTo(55.6, 0);
    expect(s.distanzaDallaLineaM).toBeCloseTo(8.3, 0);
    expect(s.punto[2]).toBeCloseTo(1025, 0);
  });
});
