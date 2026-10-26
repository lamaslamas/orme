import { describe, it, expect } from 'vitest';
import { creaIndice } from '../src/lib/indiceSpaziale.js';

describe('indice spaziale a griglia', () => {
  it('trova solo gli oggetti il cui riquadro si sovrappone, anche se grandi o a cavallo di più celle', () => {
    const ix = creaIndice(0.1);
    ix.aggiungi('punto', [41.805, 13.805, 41.805, 13.805]);
    ix.aggiungi('lungo', [41.7, 13.6, 41.9, 14.0]); // attraversa molte celle
    ix.aggiungi('lontano', [45, 8, 45.1, 8.1]);
    expect([...ix.nelRiquadro([41.8, 13.8, 41.81, 13.81])].sort()).toEqual(['lungo', 'punto']);
    expect([...ix.nelRiquadro([41.0, 13.0, 41.1, 13.1])]).toEqual([]);
    expect([...ix.nelRiquadro([44.9, 7.9, 45.2, 8.2])]).toEqual(['lontano']);
    expect(ix.size).toBe(3);
  });
  it('un riquadro vicino ma fuori non basta (la cella è solo un prefiltro)', () => {
    const ix = creaIndice(1);
    ix.aggiungi('a', [10.1, 10.1, 10.2, 10.2]);
    expect([...ix.nelRiquadro([10.5, 10.5, 10.9, 10.9])]).toEqual([]);
  });
  it('togliere e riaggiungere aggiorna le celle', () => {
    const ix = creaIndice(0.1);
    ix.aggiungi('a', [1, 1, 1.05, 1.05]);
    ix.togli('a');
    expect([...ix.nelRiquadro([0, 0, 2, 2])]).toEqual([]);
    ix.aggiungi('a', [1, 1, 1.05, 1.05]);
    ix.aggiungi('a', [5, 5, 5.05, 5.05]); // spostato
    expect([...ix.nelRiquadro([0, 0, 2, 2])]).toEqual([]);
    expect([...ix.nelRiquadro([4, 4, 6, 6])]).toEqual(['a']);
    expect(ix.size).toBe(1);
  });
  it('con 5000 oggetti la ricerca di una zona piccola è molto più veloce di scorrerli tutti', () => {
    const ix = creaIndice(0.1);
    const tutti = [];
    for (let i = 0; i < 5000; i++) {
      const r = [36 + Math.random() * 10, 7 + Math.random() * 11];
      tutti.push([`p${i}`, [r[0], r[1], r[0] + 0.01, r[1] + 0.01]]);
      ix.aggiungi(`p${i}`, tutti.at(-1)[1]);
    }
    const q = [41.8, 13.8, 41.9, 13.9];
    const atteso = tutti.filter(([, [s, o, n, e]]) => s <= q[2] && n >= q[0] && o <= q[3] && e >= q[1]).map(([id]) => id).sort();
    expect([...ix.nelRiquadro(q)].sort()).toEqual(atteso);
  });
});
