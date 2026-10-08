import { describe, it, expect } from 'vitest';
import { misureSentiero } from '../src/lib/riassunto.js';
import { sagomaSvg } from '../src/lib/sagoma.js';

const p = (n, q) => (q == null ? [13.8, 41.7 + n * 0.001] : [13.8, 41.7 + n * 0.001, q]);
const traccia = { geojson: { type: 'MultiLineString', coordinates: [[p(0, 1000), p(9, 1300)]] } };

describe('numeri chiave del sentiero', () => {
  it('preferisce i valori inseriti a mano', () => {
    const m = misureSentiero({ lunghezzaKm: 8, dislivelloM: 200, durataMin: 150 }, traccia);
    expect(m).toMatchObject({ km: 8, salita: 200, durataMin: 150, durataStimata: false, kmCalcolati: false });
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

import { profiloAltimetrico, percorsoProfiloSvg } from '../src/lib/profilo.js';

describe('profilo altimetrico', () => {
  const linea = Array.from({ length: 500 }, (_, i) => [13.8, 41.7 + i * 0.0001, 1000 + i]);

  it('calcola distanze, quota minima e massima', () => {
    const pr = profiloAltimetrico([linea], 50);
    expect(pr.minimo).toBe(1000);
    expect(pr.massimo).toBe(1499);
    expect(pr.totaleKm).toBeCloseTo(5.55, 1);
    expect(pr.punti.length).toBeLessThanOrEqual(51);
    expect(pr.punti[0]).toEqual([0, 1000]);
    expect(pr.punti[pr.punti.length - 1][1]).toBe(1499);
  });

  it('è null senza quote', () => {
    expect(profiloAltimetrico([[[13.8, 41.7], [13.8, 41.71]]])).toBeNull();
  });

  it('il disegno sale verso destra quando la quota cresce', () => {
    const { linea: d, area } = percorsoProfiloSvg(profiloAltimetrico([linea], 20), 300, 100);
    const ys = d.match(/[ML][\d.]+ ([\d.]+)/g).map((t) => Number(t.split(' ')[1]));
    expect(ys[0]).toBeGreaterThan(ys[ys.length - 1]);
    expect(area.endsWith('Z')).toBe(true);
  });
});
