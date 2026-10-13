import { describe, it, expect } from 'vitest';
import { raggruppaVicini } from '../src/lib/raggruppa.js';

describe('segni vicini raggruppati', () => {
  it('unisce i punti a meno della distanza, tiene separati gli altri', () => {
    const punti = [{ id: 'a', xy: [0, 0] }, { id: 'b', xy: [20, 0] }, { id: 'c', xy: [100, 0] }];
    const g = raggruppaVicini(punti, (p) => p.xy, 34);
    expect(g.map((x) => x.punti.map((p) => p.id))).toEqual([['a', 'b'], ['c']]);
    expect([g[0].x, g[0].y]).toEqual([10, 0]);
  });
});
