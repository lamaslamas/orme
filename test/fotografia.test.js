import { describe, it, expect } from 'vitest';
import { luciDelGiorno, minutiItaliani } from '../src/lib/sole.js';
import { orariDelGiorno, minutiAlKm, pianoFoto } from '../src/lib/fotografia.js';

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
  it('all\'alba: si arriva 20 minuti prima e si dice quanto è buio', () => {
    const p = pianoFoto({ evento: 'alba', km: 6, kmTotale: 10, serieAndata: serie, orari });
    expect(p.arrivoMin).toBe(7 * 60 + 15 - 20);
    expect(p.andataMin).toBe(90);
    expect(p.partenzaMin).toBe(5 * 60 + 25); // 6:55 - 1h30 = 5:25
    expect(p.buioMin).toBe(80); // dalle 5:25 alle 6:45, alba civile
    expect(p.crepuscoloMin).toBe(10); // dalle 6:45 alle 6:55
    expect(p.avvisi.map((a) => a.tipo)).toEqual(['buio', 'regole']);
  });
  it('km vicino: si parte dopo l\'alba civile, niente buio ma resta il richiamo alle regole', () => {
    const p = pianoFoto({ evento: 'alba', km: 0.5, kmTotale: 10, serieAndata: serie, orari: { ...orari, albaCivile: 5 * 60, alba: 5 * 60 + 30 } });
    expect(p.buioMin).toBeGreaterThanOrEqual(0);
    const chiaro = pianoFoto({ evento: 'alba', km: 0.5, kmTotale: 10, serieAndata: serie, orari: { ...orari, albaCivile: 3 * 60, alba: 3 * 60 + 30 } });
    expect(chiaro.buioMin).toBe(0);
    expect(chiaro.avvisi.map((a) => a.tipo)).toEqual(['regole']); // si cammina nel crepuscolo, prima che il sole sorga
  });
  it('al tramonto: si arriva all\'inizio dell\'ora d\'oro e il rientro dopo il crepuscolo è buio', () => {
    const p = pianoFoto({ evento: 'tramonto', km: 6, kmTotale: 10, serieAndata: serie, serieRitorno: serie, orari });
    expect(p.arrivoMin).toBe(17 * 60);
    expect(p.partenzaMin).toBe(15 * 60 + 30);
    expect(p.rientro.fineMin).toBe(17 * 60 + 50 + 60); // 4 km di ritorno = 60 minuti dopo il tramonto
    expect(p.rientro.buioMin).toBe(17 * 60 + 50 + 60 - (18 * 60 + 20)); // 30 minuti dopo il crepuscolo civile
    expect(p.avvisi.map((a) => a.tipo)).toEqual(['buio', 'regole']);
  });
  it('partenza prima di mezzanotte: lo dice e propone la notte fuori', () => {
    const lungo = { km: [0, 40], min: [0, 600] };
    const p = pianoFoto({ evento: 'alba', km: 40, kmTotale: 40, serieAndata: lungo, orari });
    expect(p.partenzaMin).toBeLessThan(0);
    expect(p.avvisi[0].tipo).toBe('prima-di-mezzanotte');
  });
  it('senza alba (sole sempre su) non inventa niente', () => {
    expect(pianoFoto({ evento: 'alba', km: 3, kmTotale: 10, serieAndata: serie, orari: { alba: null } }).impossibile).toBeTruthy();
  });
});
