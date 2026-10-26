import { describe, it, expect } from 'vitest';
import { luciDelGiorno, minutiItaliani } from '../src/lib/sole.js';
import { orariDelGiorno, minutiAlKm } from '../src/lib/fotografia.js';

const ROMA = [12.5, 41.9];
describe('luci del giorno', () => {
  it('in ordine: alba civile, alba, fine ora d\'oro, inizio ora d\'oro serale, tramonto, tramonto civile', () => {
    const l = luciDelGiorno('2026-10-17', ROMA);
    const m = Object.fromEntries(Object.entries(l).map(([k, d]) => [k, d.getTime()]));
    expect(m.albaCivile).toBeLessThan(m.alba);
    expect(m.alba).toBeLessThan(m.oroMattinaFine);
    expect(m.oroMattinaFine).toBeLessThan(m.oroSeraInizio);
    expect(m.oroSeraInizio).toBeLessThan(m.tramonto);
    expect(m.tramonto).toBeLessThan(m.tramontoCivile);
  });
  it('a metà ottobre a Roma: alba verso le 7:20, ora d\'oro di circa 45-60 minuti, crepuscolo civile di circa 25-30 minuti', () => {
    const o = orariDelGiorno('2026-10-17', ROMA);
    expect(o.alba).toBeGreaterThan(7 * 60 + 5);
    expect(o.alba).toBeLessThan(7 * 60 + 40);
    expect(o.oroMattinaFine - o.alba).toBeGreaterThan(35);
    expect(o.oroMattinaFine - o.alba).toBeLessThan(70);
    expect(o.alba - o.albaCivile).toBeGreaterThan(20);
    expect(o.alba - o.albaCivile).toBeLessThan(40);
  });
  it('l\'ora d\'oro in estate dura di più che in inverno... a parità di latitudine il tramonto è più tardi', () => {
    expect(orariDelGiorno('2026-06-21', ROMA).tramonto).toBeGreaterThan(orariDelGiorno('2026-12-21', ROMA).tramonto);
    expect(minutiItaliani(null)).toBeNull();
  });
});

describe('quando partire', () => {
  // un percorso di 10 km a 4 km/h: 15 minuti al km
  const serie = { km: [0, 5, 10], min: [0, 75, 150] };
  const orari = { albaCivile: 6 * 60 + 45, alba: 7 * 60 + 15, oroMattinaFine: 8 * 60, oroSeraInizio: 17 * 60, tramonto: 17 * 60 + 50, tramontoCivile: 18 * 60 + 20 };
  it('minuti al km, interpolando', () => {
    expect(minutiAlKm(serie, 0)).toBe(0);
    expect(minutiAlKm(serie, 2.5)).toBe(37.5);
    expect(minutiAlKm(serie, 99)).toBe(150);
  });
});
