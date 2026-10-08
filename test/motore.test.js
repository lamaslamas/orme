import { describe, it, expect } from 'vitest';
import { preparaPercorsi, filtraPercorsi, nelIntervallo } from '../src/lib/motore.js';
import { FILTRI_VUOTI } from '../src/lib/filtri.js';

const f = (x) => ({ ...FILTRI_VUOTI, ...x });
const sentieri = [
  { id: 'a', nome: 'A', codici: ['A1'], lunghezzaKm: 4, dislivelloM: 200, durataMin: 90, animali: ['cervo'], bici: { consentita: 'si', scalaMtb: 'S1' } },
  { id: 'b', nome: 'B', codici: ['B1'], lunghezzaKm: 12, dislivelloM: 900, durataMin: 300, animali: ['lupo'], bici: { consentita: 'no' } },
  { id: 'c', nome: 'C', lunghezzaKm: null, animali: ['cervo'], bici: { consentita: 'da_verificare' } },
];
const p = preparaPercorsi(sentieri, new Map());
const ids = (r) => r.map((x) => x.sentiero.id);

describe('motore di filtraggio', () => {
  it('intervalli numerici, con i valori ignoti esclusi solo se si filtra', () => {
    expect(nelIntervallo(4, '0-5')).toBe(true);
    expect(nelIntervallo(5, '0-5')).toBe(false);
    expect(nelIntervallo(20, '15-')).toBe(true);
    expect(nelIntervallo(null, '')).toBe(true);
    expect(nelIntervallo(null, '0-5')).toBe(false);
  });

  it('filtra per distanza, dislivello e durata', () => {
    expect(ids(filtraPercorsi(p, f({ distanza: '10-15' })))).toEqual(['b']);
    expect(ids(filtraPercorsi(p, f({ dislivello: '0-300' })))).toEqual(['a']);
    expect(ids(filtraPercorsi(p, f({ durata: '240-360' })))).toEqual(['b']);
  });

  it('in modalità bici nasconde i non percorribili; "solo percorribili" toglie anche i da verificare', () => {
    expect(ids(filtraPercorsi(p, f({}), 'trekking'))).toEqual(['a', 'b', 'c']);
    expect(ids(filtraPercorsi(p, f({}), 'mtb'))).toEqual(['a', 'c']);
    expect(ids(filtraPercorsi(p, f({ soloBici: 'si' }), 'mtb'))).toEqual(['a']);
  });

  it('combina con i filtri di sempre (animale)', () => {
    expect(ids(filtraPercorsi(p, f({ animale: 'cervo' }), 'mtb'))).toEqual(['a', 'c']);
  });
});
