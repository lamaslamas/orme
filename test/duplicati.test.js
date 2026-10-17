import { describe, it, expect } from 'vitest';
import { stessaTraccia, segnaDuplicati } from '../src/lib/duplicati.js';

// una traccia verso nord di ~4 km, con un punto ogni ~110 m, spostabile e allungabile
const traccia = ({ lon = 13.8, lat = 41.8, passi = 36, passo = 0.001, inverti = false, storta = 0 } = {}) => {
  const linea = Array.from({ length: passi }, (_, i) => [lon + (i % 2 ? storta : 0), lat + i * passo]);
  return { type: 'MultiLineString', coordinates: [inverti ? [...linea].reverse() : linea] };
};

describe('tracce duplicate', () => {
  it('la stessa traccia, anche rovesciata o con pochi metri di scarto, è la stessa', () => {
    expect(stessaTraccia(traccia(), traccia())).toBe(true);
    expect(stessaTraccia(traccia(), traccia({ inverti: true }))).toBe(true);
    expect(stessaTraccia(traccia(), traccia({ lon: 13.80015 }))).toBe(true); // ~12 m di lato
  });
  it('un\'altra traccia no: lontana, di lunghezza diversa, o solo un pezzo della prima', () => {
    expect(stessaTraccia(traccia(), traccia({ lon: 13.82 }))).toBe(false); // ~1,6 km più a est
    expect(stessaTraccia(traccia(), traccia({ passi: 20 }))).toBe(false); // più corta di molto
    expect(stessaTraccia(traccia(), traccia({ passi: 40 }))).toBe(false); // il 10% in più ma l'ultimo pezzo è altrove
    expect(stessaTraccia(traccia(), traccia({ lon: 13.8008 }))).toBe(false); // ~70 m di lato: un altro sentiero parallelo
    expect(stessaTraccia(traccia(), null)).toBe(false);
  });
  it('segnaDuplicati: contro i percorsi già salvati e dentro la stessa importazione', () => {
    const esistenti = [{ nome: 'Il mio giro', geojson: traccia() }];
    const nuovi = [
      { nome: 'Uguale al mio', geojson: traccia({ inverti: true }) },
      { nome: 'Nuovo', geojson: traccia({ lon: 14.0 }) },
      { nome: 'Nuovo bis', geojson: traccia({ lon: 14.0, inverti: true }) },
    ];
    const r = segnaDuplicati(nuovi, esistenti);
    expect(r.map((x) => x.duplicatoDi?.nome ?? null)).toEqual(['Il mio giro', null, 'Nuovo']);
    expect(r[0].duplicatoDi.dellImport).toBe(false);
    expect(r[2].duplicatoDi.dellImport).toBe(true);
  });
});
