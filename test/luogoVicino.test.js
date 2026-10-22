import { describe, it, expect } from 'vitest';
import { urlLuogoVicino, luogoVicinoDallaRisposta } from '../src/lib/cercaLuogo.js';

describe('paese più vicino', () => {
  it('ricerca inversa a livello di paese, in italiano', () => {
    const u = new URL(urlLuogoVicino(13.9, 42.05));
    expect(u.pathname).toBe('/reverse');
    expect(u.searchParams.get('zoom')).toBe('10');
    expect(u.searchParams.get('lat')).toBe('42.0500');
  });
  it('sceglie città, paese o frazione; null se manca', () => {
    expect(luogoVicinoDallaRisposta({ address: { village: 'Introdacqua', county: 'L\'Aquila' } })).toBe('Introdacqua');
    expect(luogoVicinoDallaRisposta({ address: { town: 'Sulmona', village: 'X' } })).toBe('Sulmona');
    expect(luogoVicinoDallaRisposta({})).toBeNull();
  });
});
