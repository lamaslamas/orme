import { describe, it, expect } from 'vitest';
import { geojsonUnito, TOLLERANZA_UNIONE_M, tracciaIncompleta } from '../src/lib/tracce.js';

// due spezzoni che distano ~44 m (0,0004° di lat) e un terzo lontano ~1 km
const g = { type: 'MultiLineString', coordinates: [[[13, 42], [13.001, 42]], [[13.001, 42.0004], [13.002, 42.0004]], [[13.002, 42.0113], [13.003, 42.0113]]] };
describe('pezzi uniti entro 50 m', () => {
  it('la tolleranza è 50 m', () => expect(TOLLERANZA_UNIONE_M).toBe(50));
  it('unisce quelli vicini e lascia staccato quello lontano', () => {
    const u = geojsonUnito(g);
    expect(u.coordinates).toHaveLength(2);
    expect(geojsonUnito(g)).toBe(u); // calcolata una volta sola
  });
  it('il buco vero (oltre 500 m) resta e fa una traccia incompleta', () => {
    const r = tracciaIncompleta(g);
    expect(r.incompleta).toBe(true);
    expect(r.mancanoKm).toBeGreaterThan(1);
  });
});
