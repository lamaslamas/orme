import { describe, it, expect } from 'vitest';
import { trattoLibero, unisciTratti, unisciTerreno, eAnello, inverti, profiloPezzi, puntoAlKm, terrenoSegnato, chiaveTratto } from '../src/lib/disegno.js';
import { inCentroAbitato } from '../src/lib/puntiUtili.js';

const A = { p: [13.8, 41.8], libero: false };
const B = { p: [13.81, 41.8], libero: false };
const C = { p: [13.81, 41.81], libero: true };

describe('modalità disegno: punti e tratti', () => {
  it('la chiave di un tratto', () => {
    expect(chiaveTratto(A, C, true)).toBe('13.8,41.8>13.81,41.81:libero');
  });

  it('mano libera: linea dritta con un punto ogni 25 m', () => {
    const t = trattoLibero(A, B); // circa 830 m
    expect(t.libero).toBe(true);
    expect(t.coordinate[0]).toEqual(A.p);
    expect(t.coordinate.at(-1)).toEqual(B.p);
    expect(t.coordinate.length).toBeGreaterThan(30);
  });

  it('tratti in fila: una linea sola e il terreno con le distanze giuste', () => {
    const t1 = { coordinate: [[0, 0], [0.01, 0]], terreno: [{ daM: 0, aM: 1112, tag: { highway: 'path' } }] };
    const t2 = { coordinate: [[0.01, 0], [0.02, 0]], terreno: [{ daM: 0, aM: 1112, tag: { highway: 'track' } }] };
    expect(unisciTratti([t1, t2])).toEqual([[0, 0], [0.01, 0], [0.02, 0]]);
    const terreno = unisciTerreno([t1, t2]);
    expect(terreno[1].daM).toBeCloseTo(1112, -1);
    expect(terreno[1].tag.highway).toBe('track');
  });

  it('anello e inversione', () => {
    const anello = [A, B, C, { p: [...A.p], libero: false }];
    expect(eAnello(anello)).toBe(true);
    // A→B agganciato, B→C a mano libera: al contrario C→B a mano libera, B→A agganciato
    expect(inverti([A, B, C])).toEqual([{ p: C.p, libero: false }, { p: B.p, libero: true }, { p: A.p, libero: false }]);
  });

  it('profilo per la barra e punto al km toccato', () => {
    const pezzi = [Array.from({ length: 1000 }, (_, i) => [13.8 + i * 0.0001, 41.8, 1000 + i])];
    const serie = profiloPezzi(pezzi, 100);
    expect(serie.length).toBeLessThanOrEqual(101);
    expect(serie[0].z).toBe(1000);
    expect(serie.at(-1).z).toBe(1999);
    expect(puntoAlKm(serie, 4).km).toBeCloseTo(4, 0);
  });

  it('segnato secondo i tag di BRouter', () => {
    expect(terrenoSegnato({ highway: 'path', route_hiking_lwn: 'yes' })).toBe(true);
    expect(terrenoSegnato({ highway: 'path' })).toBe(false);
  });
});

describe('fontanelle in paese', () => {
  const f = (id, lat, lon) => ({ id, tipo: 'fontanella', lat, lon });
  const paese = [f('a', 41.8, 13.8), f('b', 41.8005, 13.8), f('c', 41.8, 13.8008), f('d', 41.801, 13.801)];
  it('con altre tre fontanelle entro 300 m è in paese; una sorgente mai', () => {
    expect(inCentroAbitato(paese[0], paese)).toBe(true);
    expect(inCentroAbitato(f('x', 41.85, 13.85), paese)).toBe(false);
    expect(inCentroAbitato({ id: 's', tipo: 'fonte', lat: 41.8, lon: 13.8 }, paese)).toBe(false);
  });
});

import { scalaProfilo } from '../src/lib/disegno.js';
describe('profilo: scala verticale di almeno 100 m', () => {
  it('un percorso quasi piano si vede piano, con il tratto al centro', () => {
    expect(scalaProfilo(1090, 1105)).toEqual({ basso: 1047.5, alto: 1147.5 });
    expect(scalaProfilo(5, 5)).toEqual({ basso: -45, alto: 55 });
  });
  it('con più di 100 m di dislivello la scala è quella vera', () => {
    expect(scalaProfilo(1000, 1800)).toEqual({ basso: 1000, alto: 1800 });
    expect(scalaProfilo(1000, 1100)).toEqual({ basso: 1000, alto: 1100 });
  });
});
