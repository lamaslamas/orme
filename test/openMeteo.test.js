import { describe, it, expect, vi } from 'vitest';
import { campionaIndici, interpolaQuote, aggiungiQuote } from '../src/lib/openMeteo.js';

// punti ogni ~11 m
const linea = Array.from({ length: 31 }, (_, i) => [13.8, 41.7 + i * 0.0001]);

describe('quote da Open-Meteo', () => {
  it('campiona un punto ogni ~50 m, con primo e ultimo', () => {
    const indici = campionaIndici(linea, 50);
    expect(indici[0]).toBe(0);
    expect(indici[indici.length - 1]).toBe(30);
    expect(indici.length).toBeGreaterThan(5);
    expect(indici.length).toBeLessThan(10);
  });

  it('interpola le quote dei punti intermedi', () => {
    const r = interpolaQuote(linea.slice(0, 5), [0, 4], [1000, 1040]);
    expect(r.map((p) => p[2])).toEqual([1000, 1010, 1020, 1030, 1040]);
  });

  it('chiede le quote a blocchi di 100 punti', async () => {
    const lunga = Array.from({ length: 250 }, (_, i) => [13.8, 41.7 + i * 0.001]);
    const fetchFn = vi.fn(async (url) => {
      const n = new URL(url).searchParams.get('latitude').split(',').length;
      expect(n).toBeLessThanOrEqual(100);
      return { ok: true, json: async () => ({ elevation: Array(n).fill(1200) }) };
    });
    const g = await aggiungiQuote({ type: 'MultiLineString', coordinates: [lunga] }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(g.coordinates[0].every((p) => p[2] === 1200)).toBe(true);
  });

  it('dà un errore chiaro se il servizio non risponde', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(aggiungiQuote({ coordinates: [linea] }, { fetchFn })).rejects.toThrow('Quote non disponibili');
  });
});
