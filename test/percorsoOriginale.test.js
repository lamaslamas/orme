import { describe, it, expect } from 'vitest';
import { conservaOriginale, ripristinaOriginale } from '../src/lib/percorso.js';

const gpx = { id: 'p1', origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]]] }, terreno: [{ daM: 0, aM: 10 }], fonteTerreno: 'overpass' };

describe('traccia originale dei percorsi importati', () => {
  it('alla prima modifica di un file si conserva la traccia', () => {
    const { originale } = conservaOriginale(gpx);
    expect(originale.origine).toBe('gpx');
    expect(originale.geojson).toBe(gpx.geojson);
    expect(originale.terreno).toHaveLength(1);
  });
  it('non si sovrascrive e non vale per i percorsi disegnati', () => {
    expect(conservaOriginale({ ...gpx, originale: { origine: 'gpx' } })).toEqual({});
    expect(conservaOriginale({ ...gpx, origine: 'disegnato' })).toEqual({});
    expect(conservaOriginale(null)).toEqual({});
    expect(conservaOriginale({ ...gpx, origine: 'kml' }).originale.origine).toBe('kml');
  });
  it('si ripristina: traccia, origine e terreno tornano quelli del file', () => {
    const modificato = { ...gpx, origine: 'disegnato', geojson: { type: 'MultiLineString', coordinates: [[[9, 9], [8, 8]]] }, terreno: [], fonteTerreno: null, puntiControllo: [{ p: [9, 9] }], ...conservaOriginale(gpx) };
    const r = ripristinaOriginale(modificato);
    expect(r.origine).toBe('gpx');
    expect(r.geojson).toBe(gpx.geojson);
    expect(r.fonteTerreno).toBe('overpass');
    expect(r.puntiControllo).toEqual([]);
    expect(r.originale).toBeNull();
    expect(ripristinaOriginale(gpx)).toBeNull();
  });
});
