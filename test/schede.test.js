import { describe, it, expect } from 'vitest';
import { misureSentiero } from '../src/lib/riassunto.js';
import { sagomaSvg } from '../src/lib/sagoma.js';

const p = (n, q) => (q == null ? [13.8, 41.7 + n * 0.001] : [13.8, 41.7 + n * 0.001, q]);
const traccia = { geojson: { type: 'MultiLineString', coordinates: [[p(0, 1000), p(9, 1300)]] } };

describe('numeri chiave del sentiero', () => {
  it('senza traccia valgono i valori della fonte', () => {
    const m = misureSentiero({ lunghezzaKm: 8, dislivelloM: 200, durataMin: 150 }, null);
    expect(m).toMatchObject({ km: 8, salita: 200, durataMin: 150, durataStimata: false, kmCalcolati: false });
  });

  it('con la traccia continua i numeri vengono dalla traccia; la fonte resta a parte', () => {
    const m = misureSentiero({ lunghezzaKm: 8, dislivelloM: 200, durataMin: 150 }, traccia);
    expect(m.km).toBeCloseTo(1.0, 1);
    expect(m.salita).toBe(300);
    expect(m.durataStimata).toBe(true);
    expect(m.fonte).toEqual({ km: 8, salita: 200, durataMin: 150 });
    expect(m.incompleta).toBeNull();
  });

  it('traccia con un salto oltre 500 m: incompleta, valgono i numeri della fonte', () => {
    const buco = { origine: 'osm', geojson: { type: 'MultiLineString', coordinates: [[p(0, 1000), p(9, 1100)], [p(100, 1200), p(109, 1300)]] } };
    const m = misureSentiero({ lunghezzaKm: 8, dislivelloM: 200, durataMin: 150 }, buco);
    expect(m).toMatchObject({ km: 8, salita: 200, durataMin: 150, kmCalcolati: false });
    expect(m.incompleta.mancanoKm).toBeGreaterThan(0.9);
    // senza dati della fonte non si inventa nulla
    expect(misureSentiero({}, buco)).toMatchObject({ km: null, salita: null, durataMin: null });
  });

  it('un GPX mio non è mai incompleto', () => {
    const mio = { origine: 'gpx', geojson: { type: 'MultiLineString', coordinates: [[p(0, 1000), p(9, 1100)], [p(100, 1200), p(109, 1300)]] } };
    expect(misureSentiero({}, mio).incompleta).toBeNull();
  });

  it('se mancano li calcola dalla traccia e stima la durata', () => {
    const m = misureSentiero({}, traccia);
    expect(m.km).toBeCloseTo(1.0, 1);
    expect(m.salita).toBe(300);
    expect(m.kmCalcolati).toBe(true);
    expect(m.durataStimata).toBe(true);
    expect(m.durataMin).toBeGreaterThan(60);
  });

  it('senza traccia e senza dati restano vuoti', () => {
    expect(misureSentiero({}, null)).toMatchObject({ km: null, salita: null, durataMin: null });
  });

  it('con i soli km stima la durata in piano', () => {
    expect(misureSentiero({ lunghezzaKm: 8 }, null).durataMin).toBe(120);
  });
});

describe('sagoma della traccia', () => {
  it('sta dentro il riquadro, con il nord in alto', () => {
    const d = sagomaSvg({ coordinates: [[p(0), p(5), [13.805, 41.705]]] }, 100, 60, 10);
    const numeri = d.match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = numeri.filter((_, i) => i % 2 === 0);
    const ys = numeri.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...xs)).toBeLessThanOrEqual(90);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
    // il primo punto (più a sud) è più in basso del secondo
    expect(ys[0]).toBeGreaterThan(ys[1]);
  });

  it('semplifica le tracce lunghe e gestisce quelle vuote', () => {
    const lunga = Array.from({ length: 5000 }, (_, i) => [13.8 + Math.sin(i / 100) * 0.01, 41.7 + i * 0.00001]);
    expect(sagomaSvg({ coordinates: [lunga] }).split('L').length).toBeLessThanOrEqual(300);
    expect(sagomaSvg({ coordinates: [] })).toBe('');
    expect(sagomaSvg(null)).toBe('');
  });
});
