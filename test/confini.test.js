import { describe, it, expect } from 'vitest';
import { anelliDaRelazione, puntoNelPoligono, parcoDelPunto, semplifica, queryConfine, rispostaDaApiOsm } from '../src/lib/confini.js';
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

describe('confine dall\'API di OpenStreetMap (riserva)', () => {
  const nodi = [[1, 41, 13], [2, 41, 14], [3, 42, 14], [4, 42, 13]].map(([id, lat, lon]) => ({ type: 'node', id, lat, lon }));
  it('linea chiusa', () => {
    const r = rispostaDaApiOsm({ elements: [...nodi, { type: 'way', id: 9, nodes: [1, 2, 3, 4, 1] }] });
    expect(anelliDaRelazione(r, 0)[0]).toHaveLength(5);
  });
  it('relazione con più tratti', () => {
    const r = rispostaDaApiOsm({
      elements: [...nodi, { type: 'way', id: 7, nodes: [1, 2, 3] }, { type: 'way', id: 8, nodes: [3, 4, 1] }, { type: 'relation', id: 5, members: [{ type: 'way', ref: 7, role: 'outer' }, { type: 'way', ref: 8, role: 'outer' }] }],
    });
    expect(anelliDaRelazione(r, 0)).toHaveLength(1);
  });
});

describe('confine con i buchi', () => {
  const g = (pts) => pts.map(([lon, lat]) => ({ lon, lat }));
  const rel = {
    elements: [
      {
        type: 'relation',
        members: [
          { type: 'way', role: 'outer', geometry: g([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]) },
          { type: 'way', role: 'inner', geometry: g([[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]]) },
        ],
      },
    ],
  };
  it('senza ruoli solo l\'esterno; con "inner" il buco resta fuori', () => {
    expect(anelliDaRelazione(rel, 0)).toHaveLength(1);
    const anelli = anelliDaRelazione(rel, 0, ['outer', '', 'inner']);
    expect(anelli).toHaveLength(2);
    expect(puntoNelPoligono([0.2, 0.2], anelli)).toBe(true);
    expect(puntoNelPoligono([0.5, 0.5], anelli)).toBe(false);
  });
});

import { ritagliaSulConfine, quotaDentroIlConfine } from '../src/lib/confini.js';
import { ritagliaNelParco, SUFFISSO_TRATTO } from '../src/lib/fonti/osmSentieri.js';
import { candidatiSentieri } from '../src/lib/fonti/osmSentieri.js';
import { parcoDa } from '../src/datiParchi.js';

describe('ritaglio sul confine (Terra delle Gravine)', () => {
  // quadrato di circa 2,2 km di lato attorno a (13,40)
  const quadrato = [[[13, 40], [13.02, 40], [13.02, 40.02], [13, 40.02], [13, 40]]];
  // una linea verso est lungo lat 40,01, da 12,98 (fuori) a 13,06 (fuori): dentro solo i 2 km centrali
  const linea = Array.from({ length: 17 }, (_, i) => [12.98 + i * 0.005, 40.01]);
  it('quota dentro il confine, per lunghezza', () => {
    expect(quotaDentroIlConfine([linea], quadrato)).toBeCloseTo(0.25, 1);
    expect(quotaDentroIlConfine([[[14, 41], [14.01, 41]]], quadrato)).toBe(0);
  });
  it('tiene il tratto dentro più 200 m di margine, il resto no', () => {
    const { linee, ritagliata } = ritagliaSulConfine([linea], quadrato, 200);
    expect(ritagliata).toBe(true);
    const lon = linee[0].map((p) => p[0]);
    expect(Math.min(...lon)).toBeGreaterThan(12.995); // 200 m ≈ 0,0023°: il punto a 13−0,005 resta fuori
    expect(Math.min(...lon)).toBeLessThanOrEqual(13);
    expect(Math.max(...lon)).toBeLessThanOrEqual(13.0251);
  });
  it('ritagliaNelParco scarta gli itinerari con meno del 25% dentro', () => {
    expect(ritagliaNelParco([linea], quadrato, { minimoDentro: 0.4 })).toBeNull();
    expect(ritagliaNelParco([linea], quadrato, { minimoDentro: 0.2 }).linee.length).toBe(1);
  });
  it('un parco con ritaglio: nome «· tratto nel parco», traccia sul confine', () => {
    const parco = { ...parcoDa('gravine'), bbox: [39, 12, 41, 14], ritaglio: { margineM: 200, minimoDentro: 0.2 } };
    const json = { elements: [
      { type: 'relation', id: 5, tags: { route: 'hiking', name: 'Via lunga', ref: 'X1' }, members: [{ type: 'way', ref: 50, geometry: linea.map(([lon, lat]) => ({ lon, lat })) }] },
      { type: 'way', id: 50, tags: { highway: 'path' } },
    ] };
    const [c] = candidatiSentieri(json, 'gravine', parco, { anelli: quadrato });
    expect(c.nome).toBe(`Via lunga${SUFFISSO_TRATTO}`);
    expect(c.traccia.dettagli.ritagliata).toBe(true);
    expect(c.lunghezzaKm).toBeLessThan(3);
    // senza abbastanza traccia nel parco: niente
    expect(candidatiSentieri(json, 'gravine', { ...parco, ritaglio: { margineM: 200, minimoDentro: 0.6 } }, { anelli: quadrato })).toHaveLength(0);
  });
  it('Terra delle Gravine: parco regionale con confine, non nazionale', () => {
    const g = parcoDa('gravine');
    expect(g.nazionale).toBeFalsy();
    expect(g.regioni).toEqual(['Puglia']);
    expect(g.osm).toEqual({ relazione: 8221789 });
  });
});

import { ritagliaCatena, PONTE_MAX_M } from '../src/lib/confini.js';
import { candidatiMtb } from '../src/lib/fonti/osmMtb.js';

describe('ritaglio di un itinerario lungo: ponti fuori dall\'area e parti', () => {
  // punti ogni 0,005° di longitudine (≈ 430 m a 40° N) lungo lat 40; «dentro» = lon tra 13,00 e 13,05 o tra una seconda area
  const fila = (da, a) => Array.from({ length: Math.round((a - da) / 0.005) + 1 }, (_, i) => [da + i * 0.005, 40]);
  const area = (areeLon) => ([lon]) => areeLon.some(([a, b]) => lon >= a - 1e-9 && lon <= b + 1e-9);
  it('toglie solo le parti iniziali e finali fuori', () => {
    const r = ritagliaCatena([fila(12.95, 13.1)], area([[13.0, 13.05]]));
    expect(r.parti).toHaveLength(1);
    expect(r.parti[0][0][0][0]).toBeCloseTo(13.0, 5);
    expect(r.parti[0][0].at(-1)[0]).toBeCloseTo(13.05, 5);
    expect(r.ritagliata).toBe(true);
  });
  it('un tratto fuori in mezzo più corto di 3 km resta nella traccia', () => {
    // dentro 13,00–13,03, fuori 13,03–13,06 (≈ 2,6 km), dentro 13,06–13,09
    const r = ritagliaCatena([fila(13.0, 13.09)], area([[13.0, 13.03], [13.06, 13.09]]));
    expect(r.parti).toHaveLength(1);
    expect(r.parti[0].flat().length).toBe(fila(13.0, 13.09).length);
  });
  it('un tratto fuori più lungo di 3 km divide l\'itinerario in due parti', () => {
    // fuori 13,02–13,08 (≈ 5,1 km)
    const r = ritagliaCatena([fila(13.0, 13.1)], area([[13.0, 13.02], [13.08, 13.1]]));
    expect(PONTE_MAX_M).toBe(3000);
    expect(r.parti).toHaveLength(2);
    expect(r.parti[0][0].at(-1)[0]).toBeCloseTo(13.02, 5);
    expect(r.parti[1][0][0][0]).toBeCloseTo(13.08, 5);
  });
  it('i buchi veri (pezzi non collegati) restano nella traccia: li giudica la regola delle tracce incomplete', () => {
    const a = fila(13.0, 13.02);
    const b = fila(13.04, 13.06); // buco di ≈ 1,7 km tra 13,02 e 13,04, tutto dentro l'area
    const r = ritagliaCatena([a, b], area([[13.0, 13.06]]));
    expect(r.parti).toHaveLength(1);
    expect(r.parti[0]).toHaveLength(2); // due linee: il salto non si riempie
    expect(r.ritagliata).toBe(false);
  });
  it('tutto fuori: nessuna parte', () => {
    expect(ritagliaCatena([fila(12.0, 12.1)], area([[13, 14]])).parti).toEqual([]);
  });
  it('MTB e sentieri di un parco con bbox: un itinerario che esce e rientra si divide in parti con id e indirizzi distinti', () => {
    const parco = { id: 'x', nome: 'X', bbox: [39.9, 12.9, 40.1, 13.1] };
    const geom = fila(12.95, 13.05).concat(fila(13.5, 13.6), fila(13.0, 13.05)).map(([lon, lat]) => ({ lon, lat }));
    const json = { elements: [{ type: 'relation', id: 7, tags: { route: 'mtb', name: 'Giro' }, members: [{ type: 'way', ref: 70, geometry: geom }] }] };
    const r = candidatiMtb(json, 'x', parco);
    expect(r.map((c) => c.id)).toEqual(['osm-mtb-7', 'osm-mtb-7-2']);
    expect(r[1].url).toContain('#parte-2');
    expect(r.map((c) => c.nome)).toEqual(['Giro (MTB) · tratto 1', 'Giro (MTB) · tratto 2']);
  });
});
