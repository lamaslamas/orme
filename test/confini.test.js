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
      expect(queryConfine(p.osm)).toContain(p.osm.way ? `way(${p.osm.way})` : `rel(${p.osm.relazione})`);
    }
  });

  it('la ricerca dei sentieri usa il confine del parco giusto', () => {
    expect(costruisciQuery(['00'], 'foreste-casentinesi')).toContain('area(id:3601691471)');
    expect(costruisciQuery(['F10'])).toContain('area(id:3608426003)');
  });
});

describe('confine fatto da una sola linea chiusa (es. Pollino)', () => {
  it('legge la way e calcola l\'area Overpass giusta', async () => {
    const { areaParco } = await import('../src/lib/overpass.js');
    const json = { elements: [{ type: 'way', id: 1, geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 0, lon: 0 }] }] };
    expect(anelliDaRelazione(json, 0)).toEqual([[[0, 0], [1, 0], [1, 1], [0, 0]]]);
    expect(areaParco({ osm: { way: 33911573 } })).toBe(2433911573);
    expect(areaParco({ osm: { relazione: 8426003 } })).toBe(3608426003);
  });
});

describe('ricerche nel Pollino', () => {
  it('usano il riquadro del parco perché Overpass non ha l\'area', async () => {
    const { costruisciQuery, queryElencoParco } = await import('../src/lib/overpass.js');
    const { queryMtbParco } = await import('../src/lib/fonti/osmMtb.js');
    for (const q of [costruisciQuery(['901'], 'pollino'), queryElencoParco('pollino'), queryMtbParco('pollino')]) {
      expect(q).toContain('(39.61,15.82,40.23,16.44)');
      expect(q).not.toContain('area(');
    }
    expect(queryMtbParco('pnalm')).toContain('rel["route"="mtb"](area.parco)');
  });
});
