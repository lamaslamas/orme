import { describe, it, expect } from 'vitest';
import { campiona, pendenze, analizzaPendenze, classePendenza } from '../src/lib/pendenza.js';

// 0,001° di latitudine ≈ 111 m: 2 km in piano, poi 1 km al 20% in salita, poi 1 km al 10% in discesa
const pt = (m, q) => [13.8, 41.7 + m / 111195, q];
const linea = [pt(0, 1000), pt(2000, 1000), pt(3000, 1200), pt(4000, 1100)];

describe('pendenze', () => {
  it('campiona ogni 25 m con quote interpolate', () => {
    const c = campiona([linea]);
    expect(c[0]).toEqual({ m: 0, quota: 1000 });
    expect(c[1].m).toBeCloseTo(25, 0);
    expect(c.at(-1).m).toBeCloseTo(4000, -1);
    expect(campiona([[[13.8, 41.7], [13.8, 41.71]]])).toBeNull();
  });

  it('misura la pendenza sulla finestra di 100 m', () => {
    const c = campiona([linea]);
    const p = pendenze(c);
    const a = c.findIndex((x) => x.m >= 2500);
    const b = c.findIndex((x) => x.m >= 3500);
    expect(p[a]).toBeCloseTo(20, 0);
    expect(p[b]).toBeCloseTo(-10, 0);
    expect(p[10]).toBeCloseTo(0, 5);
  });

  it('riassume km in salita, discesa e piano e le pendenze massime', () => {
    const r = analizzaPendenze([linea]);
    expect(r.km.piano).toBeCloseTo(2, 1);
    expect(r.km.salita).toBeCloseTo(1, 1);
    expect(r.km.discesa).toBeCloseTo(1, 1);
    expect(r.maxSalita).toBeCloseTo(20, 0);
    expect(r.maxDiscesa).toBeCloseTo(-10, 0);
    expect(r.tratti[0].pendenza).toBeCloseTo(20, 0);
    expect(r.tratti[0].km).toBeGreaterThan(2);
    expect(r.tratti[0].km).toBeLessThan(3);
  });

  it('assegna le classi di pendenza', () => {
    expect(classePendenza(2)).toBe(0);
    expect(classePendenza(-12)).toBe(1);
    expect(classePendenza(30)).toBe(3);
    expect(classePendenza(50)).toBe(4);
  });
});
