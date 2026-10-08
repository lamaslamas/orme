import { describe, it, expect } from 'vitest';
import { avvistamentoDaModulo, sentieriVicini, parcoProposto, filtraAvvistamenti } from '../src/lib/avvistamenti.js';

// tutti i punti sono inventati
const base = { animale: 'cervo', dataOra: '2026-09-20T07:30', lat: '41.70', lon: '13.80' };

describe('modulo avvistamento', () => {
  it('converte i valori e accetta la virgola', () => {
    const a = avvistamentoDaModulo({ ...base, lat: '41,7', individui: '3', origine: 'gps', precisioneM: '12.4', parco: 'pnalm' });
    expect(a.punto).toEqual({ lat: 41.7, lon: 13.8, precisioneM: 12, origine: 'gps' });
    expect(a.individui).toBe(3);
    expect(a.parco).toBe('pnalm');
  });

  it('richiede animale, data e punto', () => {
    expect(() => avvistamentoDaModulo({ ...base, animale: 'drago' })).toThrow('animale');
    expect(() => avvistamentoDaModulo({ ...base, dataOra: '' })).toThrow('data');
    expect(() => avvistamentoDaModulo({ ...base, lat: '' })).toThrow('punto');
    expect(() => avvistamentoDaModulo({ ...base, individui: '0' })).toThrow('individui');
  });
});

describe('sentiero e parco proposti', () => {
  const sentieri = [{ id: 'a', parco: 'pnalm' }, { id: 'b', parco: 'pnalm' }, { id: 'c' }];
  const tracce = new Map([
    ['a', { geojson: { coordinates: [[[13.8, 41.70], [13.8, 41.71]]] } }],
    ['b', { geojson: { coordinates: [[[13.801, 41.70], [13.801, 41.71]]] } }],
  ]);

  it('propone i sentieri entro 300 m, dal più vicino', () => {
    const v = sentieriVicini({ lat: 41.705, lon: 13.8008 }, sentieri, tracce);
    expect(v.map((x) => x.sentiero.id)).toEqual(['b', 'a']);
    expect(sentieriVicini({ lat: 41.705, lon: 13.9 }, sentieri, tracce)).toEqual([]);
  });

  it('propone il parco dal confine o dal sentiero vicino', () => {
    const confini = [{ parco: 'x', anelli: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }];
    expect(parcoProposto({ lat: 0.5, lon: 0.5 }, confini)).toBe('x');
    expect(parcoProposto({ lat: 5, lon: 5 }, confini, { parco: 'pnalm' })).toBe('pnalm');
    expect(parcoProposto({ lat: 5, lon: 5 }, confini)).toBeNull();
  });

  it('filtra e ordina dal più recente', () => {
    const elenco = [
      { id: '1', animale: 'cervo', parco: 'pnalm', dataOra: '2026-01-01' },
      { id: '2', animale: 'lupo', parco: 'pnalm', dataOra: '2026-03-01' },
      { id: '3', animale: 'cervo', parco: 'foreste-casentinesi', dataOra: '2026-02-01' },
    ];
    expect(filtraAvvistamenti(elenco).map((a) => a.id)).toEqual(['2', '3', '1']);
    expect(filtraAvvistamenti(elenco, { animale: 'cervo', parco: 'pnalm' }).map((a) => a.id)).toEqual(['1']);
  });
});
