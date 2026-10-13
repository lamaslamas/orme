import { describe, it, expect } from 'vitest';
import { senzaTracciaNellaZona, testoRiassunto } from '../src/lib/elencoZona.js';

const vista = [41.7, 13.7, 41.9, 13.9];
const riquadri = { pnalm: [41.5, 13.5, 42.0, 14.2], pollino: [39.7, 15.8, 40.2, 16.5] };
const riquadroParco = (id) => riquadri[id] ?? null;
const s = (id, parco, lat = null, lon = null) => ({ id, parco, parchi: [parco], partenza: { lat, lon } });

describe('elenco della zona', () => {
  it('senza traccia: solo la zona inquadrata (partenza o parco visibile)', () => {
    const tutti = [s('a', 'pnalm', 41.8, 13.8), s('b', 'pnalm', 41.95, 14.1), s('c', 'pnalm'), s('d', 'pollino')];
    expect(senzaTracciaNellaZona(tutti, vista, { riquadroParco }).map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('con un parco scelto: tutti quelli del parco', () => {
    const tutti = [s('a', 'pnalm', 41.8, 13.8), s('b', 'pnalm', 41.95, 14.1), s('d', 'pollino')];
    expect(senzaTracciaNellaZona(tutti, vista, { parco: 'pnalm', riquadroParco }).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('frase dei filtri chiara', () => {
    expect(testoRiassunto(17, true)).toBe('17 percorsi con i filtri attivi');
    expect(testoRiassunto(733, false)).toBe('733 percorsi sulla mappa');
    expect(testoRiassunto(1, true)).toBe('1 percorso con i filtri attivi');
  });
});
