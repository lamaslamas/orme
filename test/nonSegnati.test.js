import { describe, it, expect } from 'vitest';
import { queryNonSegnati, sentieriNonSegnati, testoDifficoltaSac, ZOOM_NON_SEGNATI } from '../src/lib/nonSegnati.js';

describe('sentieri non segnati', () => {
  it('chiede sentieri, mulattiere e carrarecce nel riquadro, tolti quelli dei percorsi segnati', () => {
    const q = queryNonSegnati([40.25, 17.9, 40.3, 17.95]);
    expect(q).toContain('way["highway"~"^(path|bridleway|track)$"]');
    expect(q).toContain('"footway"!~"^(sidewalk|crossing)$"');
    expect(q).toContain('(.tutte; - .segnate;)');
    expect(q).toContain('(40.25000,17.90000,40.30000,17.95000)');
    expect(ZOOM_NON_SEGNATI).toBeGreaterThanOrEqual(12);
  });

  it('dalla risposta: tipo, nome, lunghezza e difficoltà se indicata', () => {
    const r = sentieriNonSegnati({
      elements: [
        { type: 'way', id: 1, tags: { highway: 'track' }, geometry: [{ lat: 40.25, lon: 17.9 }, { lat: 40.26, lon: 17.9 }] },
        { type: 'way', id: 2, tags: { highway: 'path', name: 'Sentiero della torre', sac_scale: 'mountain_hiking' }, geometry: [{ lat: 40.25, lon: 17.9 }, null, { lat: 40.25, lon: 17.91 }] },
        { type: 'way', id: 3, tags: { highway: 'path' }, geometry: [{ lat: 40.25, lon: 17.9 }] },
      ],
    });
    expect(r.map((x) => [x.id, x.tipo, x.nome])).toEqual([
      [1, 'Carrareccia', null],
      [2, 'Sentiero', 'Sentiero della torre'],
    ]);
    expect(r[0].km).toBeCloseTo(1.11, 1);
    expect(testoDifficoltaSac(r[1].difficolta)).toBe('escursionistico');
  });
});
