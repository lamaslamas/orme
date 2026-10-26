import { describe, it, expect } from 'vitest';
import { puntiOgni, abbinaTerreno, tipoFondo, riepilogoFondo, queryVieVicine, vieDaRisposta } from '../src/lib/terreno.js';

const m = (n) => n / 111195; // metri → gradi di latitudine
const linea = [[13.8, 41.7], [13.8, 41.7 + m(200)]];

describe('terreno da OSM', () => {
  it('campiona ogni 25 m', () => {
    const p = puntiOgni([linea]);
    expect(p).toHaveLength(9);
    expect(p[8][2]).toBeCloseTo(200, 0);
  });

  it('abbina a ogni tratto la via più vicina e unisce i tratti uguali', () => {
    const vie = [
      { tag: { highway: 'track', surface: 'gravel' }, linea: [[13.8, 41.7], [13.8, 41.7 + m(100)]] },
      { tag: { highway: 'path', sac_scale: 'mountain_hiking' }, linea: [[13.8, 41.7 + m(100)], [13.8, 41.7 + m(200)]] },
      { tag: { highway: 'primary' }, linea: [[13.81, 41.7], [13.81, 41.71]] },
    ];
    const t = abbinaTerreno(puntiOgni([linea]), vie);
    expect(t).toHaveLength(2);
    expect(t[0].tag.highway).toBe('track');
    expect(t[1].tag.highway).toBe('path');
    // vicino agli incroci l'errore può arrivare a un passo di campionamento (25 m)
    expect(Math.abs(t[0].aM - 100)).toBeLessThanOrEqual(25);
  });

  it('senza vie vicine il fondo è sconosciuto', () => {
    const t = abbinaTerreno(puntiOgni([linea]), []);
    expect(riepilogoFondo(t)).toEqual([{ tipo: 'sconosciuto', nome: 'Sconosciuto', km: expect.closeTo(0.2, 2), percentuale: 100 }]);
  });

  it('classifica il fondo: sentiero, sterrato, asfalto, sconosciuto', () => {
    expect(tipoFondo({ highway: 'path' })).toBe('sentiero');
    expect(tipoFondo({ highway: 'path', surface: 'ground' })).toBe('sentiero');
    expect(tipoFondo({ highway: 'path', surface: 'gravel' })).toBe('sterrato');
    expect(tipoFondo({ highway: 'track' })).toBe('sterrato');
    expect(tipoFondo({ highway: 'track', surface: 'asphalt' })).toBe('asfalto');
    expect(tipoFondo({ highway: 'residential' })).toBe('asfalto');
    expect(tipoFondo({ highway: 'service', surface: 'unpaved' })).toBe('sterrato');
    expect(tipoFondo({})).toBe('sconosciuto');
  });

  it('riassume km e percentuali, nell\'ordine sentiero, sterrato, asfalto, sconosciuto', () => {
    const tratti = [
      { daM: 0, aM: 1000, tag: { highway: 'track', surface: 'gravel' } },
      { daM: 1000, aM: 1500, tag: { highway: 'path', surface: 'ground', sac_scale: 'hiking' } },
      { daM: 1500, aM: 2000, tag: {} },
    ];
    expect(riepilogoFondo(tratti)).toEqual([
      { tipo: 'sentiero', nome: 'Sentiero', km: 0.5, percentuale: 25 },
      { tipo: 'sterrato', nome: 'Sterrato', km: 1, percentuale: 50 },
      { tipo: 'sconosciuto', nome: 'Sconosciuto', km: 0.5, percentuale: 25 },
    ]);
  });

  it('costruisce la query e legge le vie', () => {
    expect(queryVieVicine([[13.8, 41.7]])).toContain('way["highway"](around:20,41.70000,13.80000)');
    expect(vieDaRisposta({ elements: [{ type: 'way', id: 1, tags: { highway: 'path' }, geometry: [{ lat: 1, lon: 2 }] }] })[0].linea).toEqual([[2, 1]]);
  });
});
