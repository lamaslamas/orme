import { describe, it, expect } from 'vitest';
import { campionaEquidistanti, profiloEquidistante, elencoQuote, serieDaProfilo, PUNTI_PROFILO } from '../src/lib/profiloCampionato.js';
import { distanzaKm } from '../src/lib/geo.js';

// una linea dritta verso nord di circa 10 km, con punti irregolari
const linea = [[13.7, 41.8], [13.7, 41.81], [13.7, 41.85], [13.7, 41.89]];

describe('profilo a punti equidistanti', () => {
  it('100 punti a distanza uguale, dal primo all\'ultimo', () => {
    const c = campionaEquidistanti([linea]);
    expect(c).toHaveLength(PUNTI_PROFILO);
    expect(c[0]).toMatchObject({ km: 0, lon: 13.7, lat: 41.8 });
    expect(c.at(-1).lat).toBeCloseTo(41.89, 5);
    const passi = c.slice(1).map((p, i) => distanzaKm([c[i].lon, c[i].lat], [p.lon, p.lat]));
    expect(Math.max(...passi) - Math.min(...passi)).toBeLessThan(0.002); // metri: uguali
    expect(c.at(-1).km).toBeCloseTo(10, 0);
  });
  it('i salti tra un pezzo e l\'altro non contano nei km', () => {
    const due = [[[13.7, 41.8], [13.7, 41.81]], [[14.5, 42.5], [14.5, 42.51]]];
    const c = campionaEquidistanti(due, 5);
    expect(c.at(-1).km).toBeCloseTo(2.2, 0); // solo i due pezzi, non i ~100 km tra loro
    expect(c.at(-1).lat).toBeCloseTo(42.51, 4);
  });
  it('senza traccia: niente', () => {
    expect(campionaEquidistanti([])).toEqual([]);
    expect(campionaEquidistanti([[[1, 2]]])).toEqual([]);
  });
  it('profiloEquidistante: quote intere, null se ne manca più del 10%', () => {
    const z = profiloEquidistante([linea], (lon, lat) => 1000 + (lat - 41.8) * 1000);
    expect(z).toHaveLength(100);
    expect(z[0]).toBe(1000);
    expect(z.at(-1)).toBe(1090);
    expect(profiloEquidistante([linea], () => null)).toBeNull();
    let k = 0;
    expect(profiloEquidistante([linea], () => (k++ % 4 === 0 ? null : 500))).toBeNull(); // un quarto mancante
  });
  it('elencoQuote: pochi buchi presi dal vicino', () => {
    const q = Array.from({ length: 20 }, (_, i) => (i === 5 ? null : 100 + i));
    const e = elencoQuote(q);
    expect(e[5]).toBe(104);
    expect(e[6]).toBe(106);
  });
  it('serieDaProfilo: la serie per il disegno; null se il numero di punti non combacia', () => {
    const z = Array.from({ length: 100 }, (_, i) => 1000 + i);
    const s = serieDaProfilo([linea], z);
    expect(s).toHaveLength(100);
    expect(s[10]).toMatchObject({ z: 1010 });
    expect(s[10].p).toHaveLength(3);
    expect(serieDaProfilo([linea], [1, 2, 3])).not.toBeNull(); // 3 punti: la serie si adegua al numero salvato
    expect(serieDaProfilo([linea], undefined)).toBeNull();
    expect(serieDaProfilo([], z)).toBeNull();
  });
});
