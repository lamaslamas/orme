import { describe, it, expect } from 'vitest';
import { trattiARischio, testiAvvisi, intervalliLiberi } from '../src/lib/avvisiParco.js';

// circa 2,2 km verso est; il parco copre la metà ovest (lon < 13.81)
const linea = [[13.8, 41.8], [13.81, 41.8], [13.82, 41.8], [13.827, 41.8]];
const PARCO = { id: 'pnalm', nomeBreve: 'PNALM' };
const parcoDi = ([lon]) => (lon < 13.81 ? PARCO : null);

describe('avvisi del percorso nei parchi', () => {
  it('tratti non segnati solo dentro il parco', () => {
    const terreno = [{ daM: 0, aM: 5000, tag: { highway: 'path' } }];
    const t = trattiARischio({ linea, terreno }, { parcoDi });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ motivo: 'non_segnato', daM: 0 });
    expect(t[0].aM).toBeGreaterThan(780);
    expect(t[0].aM).toBeLessThan(860);
  });

  it('un sentiero segnato (route_hiking) non dà avvisi; una strada nemmeno', () => {
    expect(trattiARischio({ linea, terreno: [{ daM: 0, aM: 5000, tag: { highway: 'path', route_hiking_lwn: 'yes' } }] }, { parcoDi })).toEqual([]);
    expect(trattiARischio({ linea, terreno: [{ daM: 0, aM: 5000, tag: { highway: 'tertiary' } }] }, { parcoDi })).toEqual([]);
  });

  it('mano libera e sentieri ad accesso regolato hanno il loro motivo', () => {
    const liberi = [[0, 300]];
    const regolati = [{ nome: 'K6', accesso: 'guida', geojson: { type: 'MultiLineString', coordinates: [[[13.805, 41.8], [13.809, 41.8]]] } }];
    const t = trattiARischio({ linea, terreno: [], liberi }, { parcoDi, regolati });
    expect(t.map((x) => x.motivo)).toEqual(['mano_libera', 'regolato']);
    const testi = testiAvvisi(t);
    expect(testi[0]).toMatch(/a mano libera nel PNALM: uscire dai sentieri può essere vietato/);
    expect(testi[1]).toMatch(/^K6: solo con guida/);
  });

  it('intervalli a mano libera dai tratti in fila', () => {
    const tratti = [{ coordinate: [[0, 0], [0.01, 0]], libero: false }, { coordinate: [[0.01, 0], [0.02, 0]], libero: true }];
    const [[a, b]] = intervalliLiberi(tratti);
    expect(a).toBeCloseTo(1112, -1);
    expect(b).toBeCloseTo(2224, -1);
  });
});
