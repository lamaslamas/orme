// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { leggiGpx } from '../src/lib/gpx.js';
import { lunghezzaKm, distanzaKm } from '../src/lib/geo.js';

const traccia = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Val Fondillo</name>
    <trkseg>
      <trkpt lat="41.7600" lon="13.8500"><ele>1100</ele></trkpt>
      <trkpt lat="41.7650" lon="13.8550"><ele>1150</ele></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="41.7650" lon="13.8550"></trkpt>
      <trkpt lat="41.7700" lon="13.8600"></trkpt>
      <trkpt lat="abc" lon="13.8600"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const rotta = `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte><name>Rotta</name>
    <rtept lat="41.70" lon="13.80"/><rtept lat="41.71" lon="13.81"/>
  </rte>
</gpx>`;

describe('file GPX', () => {
  it('legge tracce con più segmenti e scarta punti non validi', () => {
    const { geojson, nome } = leggiGpx(traccia);
    expect(nome).toBe('Val Fondillo');
    expect(geojson.coordinates).toHaveLength(2);
    expect(geojson.coordinates[1]).toHaveLength(2);
    expect(geojson.coordinates[0][0]).toEqual([13.85, 41.76]);
  });

  it('usa le rotte se non ci sono tracce', () => {
    expect(leggiGpx(rotta).geojson.coordinates[0]).toHaveLength(2);
  });

  it('rifiuta file non validi o vuoti', () => {
    expect(() => leggiGpx('non è xml <')).toThrow();
    expect(() => leggiGpx('<kml></kml>')).toThrow('non è un GPX');
    expect(() => leggiGpx('<gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>')).toThrow('non ci sono');
  });

  it('calcola la lunghezza', () => {
    // 0,01° di latitudine ≈ 1,11 km
    expect(distanzaKm([13.8, 41.7], [13.8, 41.71])).toBeCloseTo(1.112, 2);
    const { geojson } = leggiGpx(rotta);
    expect(lunghezzaKm(geojson)).toBeGreaterThan(1.3);
    expect(lunghezzaKm(geojson)).toBeLessThan(1.5);
  });
});
