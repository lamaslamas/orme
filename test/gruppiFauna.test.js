import { describe, it, expect } from 'vitest';
import { testoGruppi, leggiGruppiSalvati, leggiSoloRare, salvaSoloRare, taxaDeiGruppi, conMinacciate } from '../src/lib/gruppiFauna.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe('Fauna: tutti gli animali selvatici o solo rare', () => {
  it('di base tutti gli animali selvatici; «Solo rare» si ricorda', () => {
    const m = memoria();
    expect(leggiSoloRare(m)).toBe(false);
    expect(leggiGruppiSalvati(m)).toEqual(['selvatici']);
    salvaSoloRare(true, m);
    expect(leggiSoloRare(m)).toBe(true);
    expect(leggiGruppiSalvati(m)).toEqual(['rare']);
    salvaSoloRare(false, m);
    expect(leggiGruppiSalvati(m)).toEqual(['selvatici']);
    expect(leggiGruppiSalvati(null)).toEqual(['selvatici']);
  });
  it('tutti: mammiferi, uccelli, rettili e anfibi su iNaturalist e GBIF; rare: nessuna classe, solo le minacciate', () => {
    expect(taxaDeiGruppi({ gruppi: ['selvatici'] }, 'inat')).toEqual([40151, 3, 26036, 20978]);
    expect(taxaDeiGruppi({ gruppi: ['selvatici'] }, 'gbif')).toEqual([359, 212, 358, 131]);
    expect(taxaDeiGruppi({ gruppi: ['rare'] }, 'inat')).toEqual([]);
    expect(conMinacciate({ gruppi: ['rare'] })).toBe(true);
    expect(conMinacciate({ gruppi: ['selvatici'] })).toBe(false);
    expect(conMinacciate({})).toBe(false); // senza scelta: tutti gli animali
  });
  it('la scritta sopra la scala', () => {
    expect(testoGruppi(['selvatici'])).toBe('Tutti gli animali');
    expect(testoGruppi(['rare'])).toBe('Solo rare');
    expect(testoGruppi(['selvatici'], 5)).toBe('Tutti gli animali · 5 nascoste');
    expect(testoGruppi(['rare'], 1)).toBe('Solo rare · 1 nascosta');
    expect(testoGruppi([])).toBe('Nessun gruppo scelto');
    expect(testoGruppi(['xx'])).toBe('Nessun gruppo scelto');
  });
});
