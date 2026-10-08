import { describe, it, expect } from 'vitest';
import { anelliDaRelazione, puntoNelPoligono, parcoDelPunto, semplifica, queryConfine } from '../src/lib/confini.js';
import { costruisciQuery } from '../src/lib/overpass.js';
import { PARCHI } from '../src/datiParchi.js';

// quadrato 0..1 spezzato in due tratti, uno dei quali girato
const g = (pts) => pts.map(([lon, lat]) => ({ lon, lat }));
const relazione = {
  elements: [
    {
      type: 'relation',
      id: 1,
      members: [
        { type: 'way', role: 'outer', geometry: g([[0, 0], [1, 0], [1, 1]]) },
        { type: 'way', role: 'outer', geometry: g([[0, 0], [0, 1], [1, 1]]) },
        { type: 'node', role: 'label' },
      ],
    },
  ],
};

describe('confini dei parchi', () => {
  it('ricostruisce l\'anello anche con tratti girati', () => {
    const anelli = anelliDaRelazione(relazione, 0);
    expect(anelli).toHaveLength(1);
    expect(anelli[0].length).toBeGreaterThanOrEqual(4);
  });

  it('riconosce i punti dentro e fuori', () => {
    const anelli = anelliDaRelazione(relazione, 0);
    expect(puntoNelPoligono([0.5, 0.5], anelli)).toBe(true);
    expect(puntoNelPoligono([1.5, 0.5], anelli)).toBe(false);
  });

  it('trova il parco di un punto', () => {
    const confini = [{ parco: 'a', anelli: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }];
    expect(parcoDelPunto([0.2, 0.2], confini)).toBe('a');
    expect(parcoDelPunto([2, 2], confini)).toBeNull();
  });

  it('semplifica una linea quasi dritta', () => {
    const linea = Array.from({ length: 100 }, (_, i) => [i / 100, (i % 2) * 0.00001]);
    expect(semplifica(linea, 0.001).length).toBe(2);
  });

  it('ogni parco ha confine, riquadro e centro coerenti', () => {
    for (const p of PARCHI) {
      const [s, o, n, e] = p.bbox;
      expect(s).toBeLessThan(n);
      expect(o).toBeLessThan(e);
      expect(p.centro[0]).toBeGreaterThan(s);
      expect(p.centro[0]).toBeLessThan(n);
      expect(queryConfine(p.osm.relazione)).toContain(`rel(${p.osm.relazione})`);
    }
  });

  it('la ricerca dei sentieri usa il confine del parco giusto', () => {
    expect(costruisciQuery(['00'], 'foreste-casentinesi')).toContain('area(id:3601691471)');
    expect(costruisciQuery(['F10'])).toContain('area(id:3608426003)');
  });
});
