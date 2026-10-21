import { describe, it, expect } from 'vitest';
import { quoteDisponibili, serveScaricoQuote, chiaveQuote } from '../src/lib/quoteSalvate.js';
import { improntaTraccia } from '../src/lib/panorama.js';
import { baseAndata } from '../src/lib/andataRitorno.js';

const senzaQuote = (n, passo = 0.001) => [Array.from({ length: n }, (_, i) => [15.8 + i * passo, 40.36 + i * 0.0006])];
const conQuote = (pezzi, base) => pezzi.map((l) => l.map(([x, y], i) => [x, y, base + i * 12]));

describe('quote dopo la modifica di una traccia', () => {
  it('traccia modificata: le vecchie quote non valgono, le nuove si scaricano subito e il dislivello ricompare', () => {
    const provate = new Set();
    const vecchia = senzaQuote(30);
    const percorso = { id: 'volturino', quote: { impronta: improntaTraccia({ type: 'MultiLineString', coordinates: vecchia }), coordinates: conQuote(vecchia, 900), fonte: 'terrain' } };
    // con la traccia di prima le quote ci sono: niente da scaricare
    expect(quoteDisponibili(percorso, vecchia)).toMatchObject({ fonte: 'terrain' });
    expect(serveScaricoQuote(percorso, vecchia, provate)).toBe(false);
    // «Modifica traccia»: la traccia passa da 3,9 a 5,1 km → le quote spariscono ("Dislivello non disponibile") e serve scaricarle
    const nuova = senzaQuote(40);
    expect(quoteDisponibili(percorso, nuova)).toBeNull();
    expect(baseAndata(nuova)).toBeNull(); // senza quote niente dislivello
    expect(serveScaricoQuote(percorso, nuova, provate)).toBe(true);
    provate.add(chiaveQuote(percorso, nuova)); // tentativo fatto per questa traccia
    expect(serveScaricoQuote(percorso, nuova, provate)).toBe(false);
    // arrivano le quote nuove: salvate per la traccia nuova → dislivello e profilo tornano
    const salvato = { ...percorso, quote: { impronta: improntaTraccia({ type: 'MultiLineString', coordinates: nuova }), coordinates: conQuote(nuova, 900), fonte: 'terrain' } };
    const q = quoteDisponibili(salvato, nuova);
    expect(q.pezzi[0][0][2]).toBe(900);
    expect(baseAndata(q.pezzi).salita).toBeGreaterThan(400);
  });
  it('una seconda modifica ha di nuovo diritto alle quote (il tentativo vale per la traccia, non per il percorso)', () => {
    const provate = new Set();
    const p = { id: 'x' };
    const t1 = senzaQuote(20);
    provate.add(chiaveQuote(p, t1));
    expect(serveScaricoQuote(p, t1, provate)).toBe(false);
    expect(serveScaricoQuote(p, senzaQuote(25), provate)).toBe(true);
  });
});
