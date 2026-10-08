import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  concatenaLinee,
  ordinaPezzi,
  percorsoSentiero,
  invertiPercorso,
  inizioPercorso,
  finePercorso,
  unisciTappe,
} from '../src/lib/tracce.js';
import { interpretaRisposta, raggruppaPerCodice, combinaTraccia } from '../src/lib/overpass.js';
import { dislivello, lineeConQuote } from '../src/lib/quote.js';
import { stimaDurataMin } from '../src/lib/durata.js';

// 0,001° di latitudine ≈ 111 m
const p = (n, q) => (q == null ? [13.8, 41.7 + n * 0.001] : [13.8, 41.7 + n * 0.001, q]);
const linea = (...n) => n.map((x) => p(x));

describe('ricostruzione del percorso', () => {
  it('unisce tratti in disordine e girati', () => {
    // il primo tratto (2→3) dà il verso: il risultato va da 0 a 4
    const catene = concatenaLinee([linea(2, 3), linea(0, 1), linea(3, 4).reverse(), linea(1, 2)]);
    expect(catene).toHaveLength(1);
    expect(catene[0].map((x) => Math.round((x[1] - 41.7) * 1000))).toEqual([0, 1, 2, 3, 4]);
  });

  it('il primo tratto mantiene il verso', () => {
    const [c] = concatenaLinee([linea(0, 1), linea(1, 2)]);
    expect(c[0]).toEqual(p(0));
    expect(c[c.length - 1]).toEqual(p(2));
  });

  it('tiene separati i pezzi lontani e misura il salto', () => {
    const { pezzi, salti } = ordinaPezzi(concatenaLinee([linea(0, 1), linea(5, 6)]));
    expect(pezzi).toHaveLength(2);
    expect(salti[0]).toBeCloseTo(445, -1);
  });

  it('inverte il percorso', () => {
    const per = percorsoSentiero({ coordinates: [linea(0, 1, 2)] });
    const inv = invertiPercorso(per);
    expect(inizioPercorso(inv)).toEqual(finePercorso(per));
    expect(finePercorso(inv)).toEqual(inizioPercorso(per));
  });

  it('ricostruisce una traccia reale di OpenStreetMap (U1)', () => {
    const json = JSON.parse(readFileSync(new URL('./fixtures/overpass-t2-u1-i1.json', import.meta.url)));
    const g = raggruppaPerCodice(['U1'], interpretaRisposta(json));
    const per = percorsoSentiero(combinaTraccia(g.U1).geojson);
    expect(per.pezzi.length).toBeGreaterThanOrEqual(1);
    expect(per.pezzi.length).toBeLessThanOrEqual(g.U1[0].linee.length);
  });
});

describe('unione delle tappe di un giro', () => {
  const A = { etichetta: 'A', geojson: { coordinates: [linea(0, 1, 2)] } };
  const B = { etichetta: 'B', geojson: { coordinates: [linea(2, 3, 4)] } };
  const C = { etichetta: 'C', geojson: { coordinates: [linea(10, 11)] } };

  it('unisce tappe consecutive senza salti', () => {
    const r = unisciTappe([A, B]);
    expect(r.pezzi.map((x) => x.tappa)).toEqual([0, 1]);
    expect(r.salti).toEqual([]);
  });

  it('percorre una tappa al contrario', () => {
    const r = unisciTappe([A, { ...A, etichetta: 'A ritorno', alContrario: true }]);
    expect(r.salti).toEqual([]);
    expect(r.pezzi[1].linea[0]).toEqual(p(2));
  });

  it('avvisa dei salti oltre 200 m con la distanza in linea d\'aria', () => {
    const r = unisciTappe([A, C]);
    expect(r.salti).toHaveLength(1);
    expect(r.salti[0]).toMatchObject({ tipo: 'tra', da: 'A', a: 'C' });
    expect(r.salti[0].distanzaM).toBeCloseTo(890, -1);
  });

  it('non segnala salti sotto i 200 m', () => {
    // A finisce in 2, V inizia in 3,5: circa 167 m
    const vicino = { etichetta: 'V', geojson: { coordinates: [linea(3.5, 5)] } };
    expect(unisciTappe([A, vicino]).salti).toHaveLength(0);
    // con una soglia di 100 m lo stesso salto viene segnalato
    expect(unisciTappe([A, vicino], 100).salti).toHaveLength(1);
  });

  it('segnala anche i pezzi staccati dentro una stessa traccia', () => {
    const spezzata = { etichetta: 'S', geojson: { coordinates: [linea(0, 1), linea(6, 7)] } };
    const r = unisciTappe([spezzata]);
    expect(r.salti).toHaveLength(1);
    expect(r.salti[0].tipo).toBe('interno');
  });

  it('ignora le tappe senza traccia', () => {
    expect(unisciTappe([A, { etichetta: 'X', geojson: null }, B]).pezzi).toHaveLength(2);
  });
});

describe('dislivello', () => {
  it('somma salite e discese', () => {
    const l = [p(0, 1000), p(1, 1100), p(2, 1050), p(3, 1200)];
    expect(dislivello([l])).toEqual({ salita: 250, discesa: 50 });
  });

  it('ignora le piccole oscillazioni', () => {
    const l = [p(0, 1000), p(1, 1002), p(2, 999), p(3, 1003), p(4, 1000)];
    expect(dislivello([l])).toEqual({ salita: 0, discesa: 0 });
  });

  it('il bilancio torna con la differenza tra quota finale e iniziale', () => {
    const l = [p(0, 1000), p(1, 1003), p(2, 1060), p(3, 1058), p(4, 1061)];
    const d = dislivello([l]);
    expect(d.salita - d.discesa).toBe(61);
  });

  it('è null se manca anche una sola quota', () => {
    expect(dislivello([[p(0, 1000), p(1)]])).toBeNull();
    expect(dislivello([])).toBeNull();
    expect(lineeConQuote([[p(0, 1)]])).toBe(true);
  });
});

describe('durata (metodo CAI / DIN 33466)', () => {
  it('in piano: 4 km/h', () => {
    expect(stimaDurataMin(8, { salita: 0, discesa: 0 })).toBe(120);
  });

  it('salita dominante: 600 m e 4 km', () => {
    // dislivello 2 h, distanza 1 h -> 2 h + 0,5 h
    expect(stimaDurataMin(4, { salita: 600, discesa: 0 })).toBe(150);
  });

  it('salita e discesa', () => {
    // 12 km = 3 h; 900/300 + 900/500 = 4,8 h -> 4,8 + 1,5 = 6,3 h
    expect(stimaDurataMin(12, { salita: 900, discesa: 900 })).toBe(378);
  });

  it('senza dislivello usa solo la distanza', () => {
    expect(stimaDurataMin(6, null)).toBe(90);
    expect(stimaDurataMin(NaN, null)).toBeNull();
  });
});

import { estremiTraccia, frecceLungoPercorso, invertiGeojson } from '../src/lib/tracce.js';
import { direzioneGradi } from '../src/lib/geo.js';

describe('partenza, arrivo e verso', () => {
  it('calcola la direzione', () => {
    expect(direzioneGradi([13.8, 41.7], [13.8, 41.8])).toBeCloseTo(0, 0);
    expect(direzioneGradi([13.8, 41.7], [13.9, 41.7])).toBeCloseTo(90, 0);
    expect(direzioneGradi([13.8, 41.7], [13.8, 41.6])).toBeCloseTo(180, 0);
  });

  it('trova partenza e arrivo anche con tratti in disordine', () => {
    // il tratto 0→2 si attacca prima del tratto 2→3: il percorso va da 0 a 3
    const e = estremiTraccia({ coordinates: [linea(2, 3), linea(0, 1, 2)] });
    expect(e.inizio).toEqual(p(0));
    expect(e.fine).toEqual(p(3));
    expect(e.anello).toBe(false);
  });

  it('riconosce un anello', () => {
    const anello = [[13.8, 41.7], [13.81, 41.7], [13.81, 41.71], [13.8, 41.7005]];
    expect(estremiTraccia({ coordinates: [anello] }).anello).toBe(true);
    expect(estremiTraccia({ coordinates: [] })).toBeNull();
  });

  it('distribuisce le frecce lungo il percorso con la direzione giusta', () => {
    const f = frecceLungoPercorso([linea(0, 10)], 4);
    expect(f).toHaveLength(4);
    expect(f[0].direzione).toBeCloseTo(0, 0);
    expect(f[0].punto[1]).toBeCloseTo(41.702, 3);
    expect(f[3].punto[1]).toBeCloseTo(41.708, 3);
    expect(frecceLungoPercorso([], 4)).toEqual([]);
  });

  it('inverte partenza e arrivo', () => {
    const g = { type: 'MultiLineString', coordinates: [linea(0, 1), linea(1, 2)] };
    const inv = invertiGeojson(g);
    const e = estremiTraccia(inv);
    expect(e.inizio).toEqual(p(2));
    expect(e.fine).toEqual(p(0));
    expect(g.coordinates[0][0]).toEqual(p(0));
  });
});

describe('frecce sui tornanti', () => {
  it('indicano il verso generale e non quello della singola curva', () => {
    // zig-zag verso nord: ogni tratto va a nord-est o a nord-ovest di circa 45°
    const zigzag = [];
    for (let i = 0; i <= 40; i++) zigzag.push([13.8 + (i % 2) * 0.0003, 41.7 + i * 0.0003]);
    const f = frecceLungoPercorso([zigzag], 5);
    for (const freccia of f) {
      const d = freccia.direzione > 180 ? freccia.direzione - 360 : freccia.direzione;
      expect(Math.abs(d)).toBeLessThan(25);
    }
  });
});

import { statoTraccia, sceltaAutomatica } from '../src/lib/tracce.js';

describe('stato della traccia', () => {
  const linea = { type: 'MultiLineString', coordinates: [[[13.8, 41.7], [13.8, 41.71]]] };
  it('senza traccia: serve un GPX solo se non ci sono codici da cercare', () => {
    expect(statoTraccia({ codici: ['F2'] }, null)).toMatchObject({ tipo: 'nessuna', serveGpx: false });
    expect(statoTraccia({ codici: [] }, null)).toMatchObject({ tipo: 'nessuna', serveGpx: true });
  });
  it('parziale se su OSM mancano dei codici', () => {
    const t = { origine: 'osm', geojson: linea, dettagli: { codici: ['B4'], mancanti: ['B5'] } };
    expect(statoTraccia({ codici: ['B5', 'B4'] }, t)).toEqual({ tipo: 'parziale', mancanti: ['B5'], serveGpx: true });
    // tracce vecchie senza "mancanti": si deduce dai codici trovati
    const vecchia = { origine: 'osm', geojson: linea, dettagli: { codici: ['T2'] } };
    expect(statoTraccia({ codici: ['T2', 'U1'] }, vecchia).mancanti).toEqual(['U1']);
  });
  it('completa con un GPX mio o con tutti i codici', () => {
    expect(statoTraccia({ codici: ['B5', 'B4'] }, { origine: 'gpx', geojson: linea }).tipo).toBe('completa');
    expect(statoTraccia({ codici: ['F2'] }, { origine: 'osm', geojson: linea, dettagli: { codici: ['F2'], mancanti: [] } }).tipo).toBe('completa');
  });
  it('sceglie in automatico solo i codici senza ambiguità', () => {
    const r = sceltaAutomatica(['A', 'B', 'C'], { A: [{ id: 1 }], B: [], C: [{ id: 2 }, { id: 3 }] });
    expect(r.scelti).toEqual([{ id: 1 }]);
    expect(r.mancanti).toEqual(['B']);
    expect(r.ambigui).toEqual(['C']);
  });
});
