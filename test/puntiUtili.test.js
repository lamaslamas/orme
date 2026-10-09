import { describe, it, expect } from 'vitest';
import { queryPuntiParco, tipoDelPunto, puntoDaElemento, puntiDallaRisposta, puntiLungoIlPercorso, riassuntoPunti, noteDelPunto, puntiNelRiquadro, perLaNotte, conAcqua } from '../src/lib/puntiUtili.js';
import { parcoDa } from '../src/datiParchi.js';

const quadrato = [[[13.8, 41.8], [13.9, 41.8], [13.9, 41.9], [13.8, 41.9], [13.8, 41.8]]];

describe('punti utili (rifugi e acqua)', () => {
  it('la query usa l\'area del parco o, per i parchi disegnati come linea, il riquadro', () => {
    expect(queryPuntiParco(parcoDa('pnalm'))).toContain('area(id:3608426003)');
    expect(queryPuntiParco(parcoDa('pnalm'))).toContain('out center tags');
    expect(queryPuntiParco(parcoDa('pollino'))).toContain('(39.61,15.82,40.23,16.44)');
  });

  it('riconosce i tipi', () => {
    expect(tipoDelPunto({ tourism: 'alpine_hut' })).toBe('rifugio');
    expect(tipoDelPunto({ tourism: 'wilderness_hut' })).toBe('bivacco');
    expect(tipoDelPunto({ amenity: 'shelter', shelter_type: 'basic_hut' })).toBe('ricovero');
    expect(tipoDelPunto({ natural: 'spring' })).toBe('fonte');
    expect(tipoDelPunto({ amenity: 'drinking_water' })).toBe('fontanella');
    expect(tipoDelPunto({ amenity: 'bench' })).toBeNull();
  });

  it('salva solo i dati del luogo, mai i contatti', () => {
    const p = puntoDaElemento({ type: 'node', id: 5, lat: 41.812345678, lon: 13.8, tags: { tourism: 'alpine_hut', name: 'Rifugio X', ele: '1536', phone: '+39 1', email: 'a@b.it', fireplace: 'yes' } });
    expect(p).toEqual({ id: 'n5', tipo: 'rifugio', lat: 41.81235, lon: 13.8, nome: 'Rifugio X', quota: 1536, camino: true });
  });

  it('usa il centro delle aree e capisce potabilità, stagionalità e chiusura', () => {
    expect(puntoDaElemento({ type: 'way', id: 7, center: { lat: 41.85, lon: 13.85 }, tags: { tourism: 'wilderness_hut', note: 'closed' } })).toMatchObject({ id: 'w7', chiuso: true });
    expect(puntoDaElemento({ type: 'node', id: 1, lat: 41, lon: 13, tags: { amenity: 'drinking_water' } }).potabile).toBe(true);
    expect(puntoDaElemento({ type: 'node', id: 1, lat: 41, lon: 13, tags: { natural: 'spring' } }).potabile).toBeUndefined();
    expect(puntoDaElemento({ type: 'node', id: 1, lat: 41, lon: 13, tags: { natural: 'spring', drinking_water: 'no', intermittent: 'yes' } })).toMatchObject({ potabile: false, stagionale: true });
    expect(puntoDaElemento({ type: 'node', id: 1, tags: { natural: 'spring' } })).toBeNull();
  });

  it('scarta i doppioni e i punti fuori dal confine', () => {
    const json = {
      elements: [
        { type: 'node', id: 1, lat: 41.85, lon: 13.85, tags: { natural: 'spring' } },
        { type: 'node', id: 1, lat: 41.85, lon: 13.85, tags: { natural: 'spring' } },
        { type: 'node', id: 2, lat: 42.5, lon: 13.85, tags: { natural: 'spring' } },
      ],
    };
    expect(puntiDallaRisposta(json, quadrato).map((p) => p.id)).toEqual(['n1']);
    expect(puntiDallaRisposta(json).map((p) => p.id)).toEqual(['n1', 'n2']);
  });

  it('trova i punti lungo il percorso, dal più vicino', () => {
    const traccia = { type: 'MultiLineString', coordinates: [[[13.8, 41.8], [13.9, 41.8]]] };
    const punti = [
      { id: 'a', tipo: 'fonte', lat: 41.802, lon: 13.85 }, // ~220 m
      { id: 'b', tipo: 'bivacco', lat: 41.8005, lon: 13.82 }, // ~55 m
      { id: 'c', tipo: 'rifugio', lat: 41.81, lon: 13.85 }, // ~1,1 km
    ];
    const vicini = puntiLungoIlPercorso(punti, traccia);
    expect(vicini.map((p) => p.id)).toEqual(['b', 'a']);
    expect(vicini[0].distanzaM).toBeGreaterThan(40);
    expect(puntiLungoIlPercorso(punti, null)).toEqual([]);
  });

  it('riassume e descrive', () => {
    expect(riassuntoPunti([{ tipo: 'fonte' }, { tipo: 'bivacco' }, { tipo: 'fonte' }])).toBe('1 bivacco, 2 sorgenti');
    expect(riassuntoPunti([])).toBe('');
    expect(noteDelPunto({ tipo: 'fonte', quota: 1200, stagionale: true })).toEqual(['1200 m', 'potabilità non indicata', 'può seccarsi in estate']);
  });

  it('trova i punti nella zona inquadrata', () => {
    const punti = [{ id: 'a', lat: 41.85, lon: 13.85 }, { id: 'b', lat: 42.5, lon: 13.85 }];
    expect(puntiNelRiquadro(punti, [41.8, 13.8, 41.9, 13.9]).map((p) => p.id)).toEqual(['a']);
  });

  it('punti per la notte e acqua utilizzabile', () => {
    expect(perLaNotte({ tipo: 'bivacco' })).toBe(true);
    expect(perLaNotte({ tipo: 'rifugio', chiuso: true })).toBe(false);
    expect(perLaNotte({ tipo: 'fonte' })).toBe(false);
    expect(conAcqua({ tipo: 'fonte' })).toBe(true);
    expect(conAcqua({ tipo: 'fonte', potabile: false })).toBe(false);
  });
});
