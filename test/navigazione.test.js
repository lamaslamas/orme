import { describe, it, expect } from 'vitest';
import { puntoDiPartenza, linkGoogleMaps, linkGeo } from '../src/lib/navigazione.js';

const traccia = { geojson: { type: 'MultiLineString', coordinates: [[[13.85, 41.77], [13.86, 41.78]]] } };

describe('navigazione fino alla partenza', () => {
  it('usa la partenza inserita a mano, altrimenti l\'inizio della traccia', () => {
    expect(puntoDiPartenza({ partenza: { lat: 41.1, lon: 13.1 } }, traccia)).toEqual({ lat: 41.1, lon: 13.1, fonte: 'manuale' });
    expect(puntoDiPartenza({ partenza: { lat: null, lon: null } }, traccia)).toEqual({ lat: 41.77, lon: 13.85, fonte: 'traccia' });
    expect(puntoDiPartenza({}, null)).toBeNull();
  });

  it('crea i link per Google Maps e per le altre app', () => {
    const p = { lat: 41.77, lon: 13.85 };
    expect(linkGoogleMaps(p)).toBe('https://www.google.com/maps/dir/?api=1&destination=41.770000,13.850000&travelmode=driving');
    expect(linkGoogleMaps(p, 'piedi')).toContain('travelmode=walking');
    expect(linkGeo(p)).toBe('geo:41.770000,13.850000?q=41.770000,13.850000(Partenza)');
  });
});
