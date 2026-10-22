import { describe, it, expect } from 'vitest';
import { chiaveZona, leggiLuoghiZona, salvaLuogoZona } from '../src/lib/luoghiZona.js';

const finto = () => {
  const d = {};
  return { getItem: (k) => d[k] ?? null, setItem: (k, v) => (d[k] = v) };
};

describe('paese per zona, salvato sul telefono', () => {
  it('la zona è il centro arrotondato a circa 1 km', () => {
    expect(chiaveZona([13.9312, 42.0449])).toBe('42.04,13.93');
    expect(chiaveZona([13.9349, 42.0401])).toBe('42.04,13.93');
  });
  it('salva e rilegge; dati rovinati danno un elenco vuoto', () => {
    const a = finto();
    salvaLuogoZona('42.04,13.93', 'Sulmona', a);
    expect(leggiLuoghiZona(a)).toEqual({ '42.04,13.93': 'Sulmona' });
    a.setItem('orme.luoghiZona', '{rotto');
    expect(leggiLuoghiZona(a)).toEqual({});
    a.setItem('orme.luoghiZona', JSON.stringify({ a: 'Roma', b: 5, c: '' }));
    expect(leggiLuoghiZona(a)).toEqual({ a: 'Roma' });
  });
  it('tiene le ultime 300 zone', () => {
    const a = finto();
    for (let i = 0; i < 305; i++) salvaLuogoZona(`z${i}`, `P${i}`, a);
    const t = leggiLuoghiZona(a);
    expect(Object.keys(t)).toHaveLength(300);
    expect(t.z0).toBeUndefined();
    expect(t.z304).toBe('P304');
  });
  it('senza memoria disponibile non si rompe', () => {
    expect(() => salvaLuogoZona('x', 'Y', { getItem: () => null, setItem: () => { throw new Error('pieno'); } })).not.toThrow();
  });
});
