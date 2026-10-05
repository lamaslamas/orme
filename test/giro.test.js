import { describe, it, expect } from 'vitest';
import { completaGiro, controllaGiro, calcolaGiro, giriConSentiero } from '../src/lib/giro.js';

const p = (n, q) => (q == null ? [13.8, 41.7 + n * 0.001] : [13.8, 41.7 + n * 0.001, q]);
const traccia = (...punti) => ({ geojson: { type: 'MultiLineString', coordinates: [punti] } });

const sentieri = new Map([
  ['a', { id: 'a', codici: ['F2'], nome: 'Andata' }],
  ['b', { id: 'b', codici: [], nome: 'Bivio' }],
  ['c', { id: 'c', codici: ['K6'], nome: 'Lontano' }],
  ['d', { id: 'd', codici: [], nome: 'Senza traccia' }],
]);

describe('giro: dati', () => {
  it('completa i campi mancanti e pulisce le tappe', () => {
    const g = completaGiro({ id: 'g', tappe: [{ sentieroId: 'a' }, null, { sentieroId: 'b', alContrario: 1 }] });
    expect(g.stato).toBe('da_fare');
    expect(g.tappe).toEqual([
      { sentieroId: 'a', alContrario: false },
      { sentieroId: 'b', alContrario: true },
    ]);
  });

  it('richiede nome e almeno due sentieri', () => {
    expect(() => controllaGiro({ nome: '', tappe: [{}, {}] })).toThrow('nome');
    expect(() => controllaGiro({ nome: 'X', tappe: [{}] })).toThrow('due');
    expect(() => controllaGiro({ nome: 'X', tappe: [{}, {}] })).not.toThrow();
  });

  it('trova i giri che contengono un sentiero', () => {
    const giri = [{ id: '1', tappe: [{ sentieroId: 'a' }] }, { id: '2', tappe: [{ sentieroId: 'b' }] }];
    expect(giriConSentiero(giri, 'a').map((g) => g.id)).toEqual(['1']);
  });
});

describe('giro: calcoli', () => {
  it('somma lunghezze, dislivelli e stima la durata (andata e ritorno)', () => {
    // 1 km circa in salita di 300 m, poi ritorno sullo stesso sentiero
    const tracce = new Map([['a', traccia(p(0, 1000), p(4.5, 1150), p(9, 1300))]]);
    const giro = completaGiro({ nome: 'A/R', tappe: [{ sentieroId: 'a' }, { sentieroId: 'a', alContrario: true }] });
    const r = calcolaGiro(giro, sentieri, tracce);
    expect(r.lunghezzaKm).toBeCloseTo(2.0, 1);
    expect(r.dislivello).toEqual({ salita: 300, discesa: 300 });
    expect(r.salti).toEqual([]);
    // piano 0,5 h; dislivello 1 h + 0,6 h = 1,6 h -> 1,6 + 0,25 = 1,85 h
    expect(r.durataMin).toBe(111);
  });

  it('senza quote il dislivello non è disponibile e indica quali tappe', () => {
    const tracce = new Map([
      ['a', traccia(p(0, 1000), p(5, 1100))],
      ['b', traccia(p(5), p(8))],
    ]);
    const r = calcolaGiro(completaGiro({ tappe: [{ sentieroId: 'a' }, { sentieroId: 'b' }] }), sentieri, tracce);
    expect(r.dislivello).toBeNull();
    expect(r.tappeSenzaQuote).toEqual(['Bivio']);
    expect(r.durataMin).toBe(Math.round((r.lunghezzaKm / 4) * 60));
  });

  it('segnala salti, sentieri mancanti e senza traccia', () => {
    const tracce = new Map([
      ['a', traccia(p(0), p(2))],
      ['c', traccia(p(20), p(22))],
    ]);
    const giro = completaGiro({
      tappe: [{ sentieroId: 'a' }, { sentieroId: 'c' }, { sentieroId: 'd' }, { sentieroId: 'eliminato' }],
    });
    const r = calcolaGiro(giro, sentieri, tracce);
    expect(r.salti).toHaveLength(1);
    expect(r.salti[0]).toMatchObject({ da: 'F2 Andata', a: 'K6 Lontano' });
    expect(r.salti[0].distanzaM).toBeCloseTo(2000, -2);
    expect(r.problemi.map((t) => t.etichetta)).toEqual(['Senza traccia', 'sentiero mancante']);
  });
});
