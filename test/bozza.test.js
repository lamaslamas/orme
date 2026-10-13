import { describe, it, expect, beforeEach } from 'vitest';
import { leggiBozza, iniziaBozza, aggiungiABozza, cancellaBozza } from '../src/lib/bozza.js';

const dati = new Map();
globalThis.localStorage = { getItem: (k) => dati.get(k) ?? null, setItem: (k, v) => dati.set(k, String(v)), removeItem: (k) => dati.delete(k) };

describe('bozza del percorso', () => {
  beforeEach(() => dati.clear());
  it('si inizia da un punto e si allunga', () => {
    expect(leggiBozza()).toBeNull();
    iniziaBozza([13.8, 41.8]);
    expect(aggiungiABozza([13.81, 41.81])).toBe(2);
    expect(leggiBozza().punti).toEqual([[13.8, 41.8], [13.81, 41.81]]);
    iniziaBozza([14, 42]);
    expect(leggiBozza().punti).toEqual([[14, 42]]);
  });
  it('"Aggiungi" senza bozza ne inizia una; si cancella', () => {
    expect(aggiungiABozza([13.8, 41.8])).toBe(1);
    cancellaBozza();
    expect(leggiBozza()).toBeNull();
  });
  it('dati rovinati: nessuna bozza', () => {
    dati.set('orme.bozza', '{"punti":[["x",1]]}');
    expect(leggiBozza().punti).toEqual([]);
    dati.set('orme.bozza', 'non json');
    expect(leggiBozza()).toBeNull();
  });
});
