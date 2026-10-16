import { describe, it, expect } from 'vitest';
import { piuVicino, tipoZona, testoNessunoQui, testoZonaCercata } from '../src/lib/zonaVuota.js';

const linea = (lon, lat) => ({ type: 'MultiLineString', coordinates: [[[lon, lat], [lon + 0.01, lat]]] });

describe('piuVicino', () => {
  it('il percorso più vicino al centro, con la distanza', () => {
    const r = piuVicino([13.8, 41.8], [{ id: 'lontano', geojson: linea(14.5, 42) }, { id: 'vicino', geojson: linea(13.81, 41.81) }, { id: 'senza', geojson: null }]);
    expect(r.id).toBe('vicino');
    expect(r.metri).toBeGreaterThan(500);
    expect(r.metri).toBeLessThan(2000);
  });
  it('nessun percorso: null', () => {
    expect(piuVicino([13.8, 41.8], [])).toBeNull();
  });
});

describe('tipoZona', () => {
  it('vuota per i filtri, vuota e basta, pochi, ok', () => {
    expect(tipoZona({ qui: 0, altre: 12, filtri: true })).toBe('filtri');
    expect(tipoZona({ qui: 0, altre: 0, filtri: true })).toBe('vuota');
    expect(tipoZona({ qui: 0, altre: 50, filtri: false })).toBe('vuota');
    expect(tipoZona({ qui: 4, altre: 50, filtri: true })).toBe('pochi');
    expect(tipoZona({ qui: 5, altre: 0, filtri: false })).toBe('ok');
  });
});

describe('testi', () => {
  it('nessuno qui, con singolare e plurale', () => {
    expect(testoNessunoQui(12)).toBe('Nessun percorso qui con questi filtri · 12 in altre zone');
    expect(testoNessunoQui(1)).toBe("Nessun percorso qui con questi filtri · 1 in un'altra zona");
  });
  it('zona già cercata: con la data, vuoto senza', () => {
    expect(testoZonaCercata({ aggiornato: '2026-10-12T10:00:00Z' }, Date.parse('2026-10-16'))).toBe('Zona già cercata il 12 ottobre');
    expect(testoZonaCercata(null)).toBe('');
    expect(testoZonaCercata({ aggiornato: 'ieri' })).toBe('');
  });
});
