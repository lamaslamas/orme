import { describe, it, expect } from 'vitest';
import { catenaVia, nomeViaProposto, localitaVicina, vieDallaRisposta } from '../src/lib/viaCatena.js';

// 0,001° di longitudine ≈ 85 m a 40°
const via = (id, nome, ...punti) => ({ id, nome, highway: 'track', linea: punti });
const km = (l) => l.length;

describe('catena di vie', () => {
  it('tre vie in fila senza incroci diventano un tratto solo', () => {
    const vie = [via(1, null, [15, 40], [15.001, 40]), via(2, null, [15.001, 40], [15.002, 40]), via(3, null, [15.003, 40], [15.002, 40])];
    const c = catenaVia(vie, 2);
    expect(c.ids).toEqual([1, 2, 3]);
    expect(c.linea[0]).toEqual([15, 40]);
    expect(c.linea.at(-1)).toEqual([15.003, 40]); // la terza era girata
  });
  it('si ferma a un incrocio', () => {
    const vie = [via(1, null, [15, 40], [15.001, 40]), via(2, null, [15.001, 40], [15.002, 40]), via(3, null, [15.001, 40], [15.001, 40.001])];
    expect(catenaVia(vie, 2).ids).toEqual([2]);
  });
  it('con lo stesso nome continua anche a un incrocio', () => {
    const vie = [via(1, 'Via Vecchia', [15, 40], [15.001, 40]), via(2, 'Via Vecchia', [15.001, 40], [15.002, 40]), via(3, 'Altra', [15.001, 40], [15.001, 40.001])];
    expect(catenaVia(vie, 2).ids).toEqual([1, 2]);
  });
  it('un incrocio con una via che passa (vertice interno) ferma la catena', () => {
    const vie = [via(1, null, [15, 40], [15.001, 40]), via(2, null, [15.001, 40], [15.002, 40]), via(9, null, [15.001, 39.999], [15.001, 40], [15.001, 40.001])];
    expect(catenaVia(vie, 1).ids).toEqual([1]);
  });
  it('non gira in tondo e rispetta il limite', () => {
    const anello = [via(1, null, [15, 40], [15.001, 40]), via(2, null, [15.001, 40], [15.001, 40.001]), via(3, null, [15.001, 40.001], [15, 40])];
    expect(catenaVia(anello, 1).ids.sort()).toEqual([1, 2, 3]);
    const lunga = Array.from({ length: 50 }, (_, i) => via(i + 1, null, [15 + i * 0.001, 40], [15 + (i + 1) * 0.001, 40]));
    const c = catenaVia(lunga, 25, { maxKm: 1 });
    expect(c.ids.length).toBeLessThan(50);
    expect(c.ids).toContain(25);
  });
  it('via inesistente', () => {
    expect(catenaVia([], 5)).toBeNull();
    expect(km([1])).toBe(1);
  });
});

describe('nomi', () => {
  it('il nome della via, o tipo presso la località', () => {
    expect(nomeViaProposto({ nome: 'Carrareccia del Lago', highway: 'track' }, 'Opi')).toBe('Carrareccia del Lago');
    expect(nomeViaProposto({ nome: null, highway: 'track' }, 'Opi')).toBe('Carrareccia presso Opi');
    expect(nomeViaProposto({ nome: null, highway: 'path' }, 'Opi')).toBe('Sentiero presso Opi');
    expect(nomeViaProposto({ nome: null, highway: 'track' }, null)).toBe('Carrareccia senza nome');
  });
  it('la località più vicina e le vie dalla risposta', () => {
    const json = { elements: [
      { type: 'node', lat: 40.01, lon: 15, tags: { name: 'Lontano' } },
      { type: 'node', lat: 40.001, lon: 15, tags: { name: 'Vicino' } },
      { type: 'way', id: 7, tags: { name: 'X', highway: 'path' }, geometry: [{ lat: 40, lon: 15 }, { lat: 40, lon: 15.001 }] },
    ] };
    expect(localitaVicina(json, [15, 40]).nome).toBe('Vicino');
    expect(vieDallaRisposta(json)).toEqual([{ id: 7, nome: 'X', highway: 'path', linea: [[15, 40], [15.001, 40]] }]);
  });
});
