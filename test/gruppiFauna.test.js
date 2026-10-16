import { describe, it, expect } from 'vitest';
import { testoGruppi, leggiGruppiSalvati, salvaGruppiSalvati } from '../src/lib/gruppiFauna.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe('gruppi della fauna, uguali in tutte le mappe', () => {
  it('di base tutti i gruppi; la scelta si ricorda', () => {
    const m = memoria();
    expect(leggiGruppiSalvati(m)).toEqual(['rapaci', 'acqua', 'mammiferi', 'rare']);
    salvaGruppiSalvati(['rapaci'], m);
    expect(leggiGruppiSalvati(m)).toEqual(['rapaci']);
    salvaGruppiSalvati([], m);
    expect(leggiGruppiSalvati(m)).toEqual([]); // nessun gruppo: scelta valida, non "tutti"
    expect(leggiGruppiSalvati(null)).toHaveLength(4);
  });
  it('la scritta sopra la scala', () => {
    expect(testoGruppi(['rapaci', 'acqua', 'mammiferi', 'rare'])).toBe('Tutti gli animali');
    expect(testoGruppi(['mammiferi', 'rapaci'])).toBe('Rapaci, Mammiferi');
    expect(testoGruppi(['rapaci'])).toBe('Rapaci');
    expect(testoGruppi([])).toBe('Nessun gruppo scelto');
    expect(testoGruppi(['xx'])).toBe('Nessun gruppo scelto');
  });
});
