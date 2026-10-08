import { describe, it, expect } from 'vitest';
import { puntiOgni, abbinaTerreno, riepilogoTerreno, queryVieVicine, vieDaRisposta, NON_INDICATO } from '../src/lib/terreno.js';
import { valutaTratto, valutaPercorsoMtb } from '../src/lib/mtb.js';

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

  it('senza vie vicine il tratto è "non indicato"', () => {
    const t = abbinaTerreno(puntiOgni([linea]), []);
    expect(riepilogoTerreno(t, 'surface')).toEqual([{ categoria: NON_INDICATO, km: expect.closeTo(0.2, 2) }]);
  });

  it('riassume in km per categoria', () => {
    const tratti = [
      { daM: 0, aM: 1000, tag: { highway: 'track', surface: 'gravel' } },
      { daM: 1000, aM: 1500, tag: { highway: 'path', surface: 'ground', sac_scale: 'hiking' } },
      { daM: 1500, aM: 2000, tag: { highway: 'path' } },
    ];
    expect(riepilogoTerreno(tratti, 'surface')).toEqual([
      { categoria: 'Sterrato o ghiaia', km: 1 },
      { categoria: 'Terra o prato', km: 0.5 },
      { categoria: NON_INDICATO, km: 0.5 },
    ]);
    expect(riepilogoTerreno(tratti, 'highway').map((x) => x.categoria)).toEqual(['Sentiero', 'Carrareccia']);
  });

  it('costruisce la query e legge le vie', () => {
    expect(queryVieVicine([[13.8, 41.7]])).toContain('way["highway"](around:20,41.70000,13.80000)');
    expect(vieDaRisposta({ elements: [{ type: 'way', id: 1, tags: { highway: 'path' }, geometry: [{ lat: 1, lon: 2 }] }] })[0].linea).toEqual([[2, 1]]);
  });
});

describe('valutazione MTB', () => {
  it('i divieti prevalgono', () => {
    expect(valutaTratto({ highway: 'track', bicycle: 'no' })).toBe('vietata');
    expect(valutaTratto({ highway: 'track' }, 0, { vietataDalParco: true })).toBe('vietata');
  });
  it('usa mtb:scale, poi sac_scale, poi fondo e tipo di via', () => {
    expect(valutaTratto({ 'mtb:scale': '2+' })).toBe('media');
    expect(valutaTratto({ highway: 'path', sac_scale: 'demanding_mountain_hiking' })).toBe('a_spinta');
    expect(valutaTratto({ highway: 'track', tracktype: 'grade2' })).toBe('facile');
    expect(valutaTratto({ highway: 'path' })).toBe('non_valutabile');
    expect(valutaTratto({})).toBe('non_valutabile');
  });
  it('la pendenza peggiora il giudizio', () => {
    expect(valutaTratto({ highway: 'track' }, 18)).toBe('difficile');
    expect(valutaTratto({ highway: 'track' }, 30)).toBe('a_spinta');
    expect(valutaTratto({ highway: 'track' }, -10)).toBe('facile');
  });
  it('riassume km, pedalabili e affidabilità', () => {
    const r = valutaPercorsoMtb([
      { daM: 0, aM: 1000, tag: { highway: 'track' } },
      { daM: 1000, aM: 1500, tag: { highway: 'path' } },
    ]);
    expect(r.km.facile).toBe(1);
    expect(r.km.non_valutabile).toBe(0.5);
    expect(r.pedalabili).toBe(1);
    expect(r.affidabilita).toBeCloseTo(2 / 3);
  });
});
