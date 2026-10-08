import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  costruisciQuery,
  interpretaRisposta,
  raggruppaPerCodice,
  combinaTraccia,
  interrogaOverpass,
  normalizzaCodice,
} from '../src/lib/overpass.js';

const risposta = JSON.parse(readFileSync(new URL('./fixtures/overpass-t2-u1-i1.json', import.meta.url)));

describe('ricerca su OpenStreetMap', () => {
  it('costruisce una query con i codici e il confine del Parco', () => {
    const q = costruisciQuery(['F10', 'B4']);
    expect(q).toContain('"route"="hiking"');
    expect(q).toContain('(F10|B4)');
    expect(q).toContain('area(id:3608426003)');
    expect(q).toContain('out geom');
    expect(() => costruisciQuery([])).toThrow();
  });

  it('accetta anche codici scritti "PNALM F10"', () => {
    expect(normalizzaCodice('PNALM F10')).toBe('F10');
    expect(normalizzaCodice('f10')).toBe('F10');
  });

  it('interpreta una risposta reale di Overpass', () => {
    const gruppi = raggruppaPerCodice(['T2', 'U1', 'I1'], interpretaRisposta(risposta));
    expect(gruppi.T2).toHaveLength(1);
    expect(gruppi.U1).toHaveLength(1);
    expect(gruppi.I1[0].da).toBe('Civitella Alfedena');
    for (const linea of gruppi.I1[0].linee) {
      for (const [lon, lat] of linea) {
        expect(lon).toBeGreaterThan(13.5);
        expect(lat).toBeGreaterThan(41.5);
      }
    }
  });

  it('segnala i codici senza risultati', () => {
    const gruppi = raggruppaPerCodice(['T2', 'B5'], interpretaRisposta(risposta));
    expect(gruppi.B5).toEqual([]);
  });

  it('combina più relazioni in una traccia', () => {
    const gruppi = raggruppaPerCodice(['T2', 'U1'], interpretaRisposta(risposta));
    const traccia = combinaTraccia([gruppi.T2[0], gruppi.U1[0]]);
    expect(traccia.geojson.type).toBe('MultiLineString');
    expect(traccia.geojson.coordinates).toHaveLength(4);
    expect(traccia.dettagli.relazioniOsm).toEqual([9727094, 9727112]);
  });

  it('passa al server successivo se il primo non risponde', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 504 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ elements: [] }) });
    const json = await interrogaOverpass('q', { server: ['a', 'b'], fetchFn });
    expect(json).toEqual({ elements: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('dà un errore comprensibile se nessun server risponde', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(interrogaOverpass('q', { server: ['a'], fetchFn })).rejects.toThrow('OpenStreetMap non risponde');
  });
});

describe('tag bici dei tratti', () => {
  it('la query chiede anche i tag delle way', () => {
    expect(costruisciQuery(['F10'])).toContain('way(r);\nout tags;');
  });

  it('riassume i tag bici per ogni sentiero e li unisce nella traccia', () => {
    const json = {
      elements: [
        {
          type: 'relation', id: 1, tags: { ref: 'B4' },
          members: [
            { type: 'way', ref: 10, geometry: [{ lat: 41.8, lon: 13.7 }, { lat: 41.81, lon: 13.71 }] },
            { type: 'way', ref: 11, geometry: [{ lat: 41.81, lon: 13.71 }, { lat: 41.82, lon: 13.72 }] },
          ],
        },
        {
          type: 'relation', id: 2, tags: { ref: 'B5' },
          members: [{ type: 'way', ref: 12, geometry: [{ lat: 41.82, lon: 13.72 }, { lat: 41.83, lon: 13.73 }] }],
        },
        { type: 'way', id: 10, tags: { bicycle: 'no', 'mtb:scale': '2' } },
        { type: 'way', id: 11, tags: { highway: 'path' } },
        { type: 'way', id: 12, tags: { bicycle: 'yes', 'mtb:scale': '4' } },
      ],
    };
    const [b4, b5] = interpretaRisposta(json);
    expect(b4.suggerimentoBici.bicycle).toMatchObject({ no: 1, nonIndicato: 1 });
    expect(b5.suggerimentoBici.mtbScale).toEqual({ min: 4, max: 4 });
    const traccia = combinaTraccia([b4, b5]);
    expect(traccia.dettagli.suggerimentoBici.tratti).toBe(3);
    expect(traccia.dettagli.suggerimentoBici.mtbScale).toEqual({ min: 2, max: 4 });
  });

  it('senza tag dei tratti non dà suggerimenti', () => {
    const [c] = interpretaRisposta({
      elements: [{ type: 'relation', id: 1, tags: { ref: 'X' }, members: [{ type: 'way', ref: 5, geometry: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] }] }],
    });
    expect(c.suggerimentoBici).toBeNull();
  });
});

import { interpretaElenco, sentieroDaRelazione, nomeRelazione, queryElencoParco, queryGeometrie } from '../src/lib/overpass.js';

describe('importazione dei sentieri di un parco', () => {
  const json = {
    elements: [
      { type: 'relation', id: 3, tags: { ref: '10', name: 'Anello del Lago', distance: '7,5' } },
      { type: 'relation', id: 1, tags: { ref: 'CAI 2', from: 'Stia', to: 'Falterona' } },
      { type: 'relation', id: 2, tags: { name: 'Via dei Legni' } },
    ],
  };

  it('elenca i sentieri in ordine di codice', () => {
    const elenco = interpretaElenco(json);
    expect(elenco.map((r) => r.idOsm)).toEqual([1, 3, 2]);
    expect(elenco[0].ref).toBe('2');
    expect(elenco[1].km).toBe(7.5);
  });

  it('dà un nome anche ai sentieri che non lo hanno', () => {
    const [due] = interpretaElenco(json);
    expect(nomeRelazione(due)).toBe('Stia – Falterona');
    expect(nomeRelazione({ idOsm: 9, ref: '', nome: '', da: '', a: '' })).toBe('Sentiero OSM 9');
  });

  it('crea un sentiero da verificare nel parco giusto', () => {
    const s = sentieroDaRelazione(interpretaElenco(json)[1], 'foreste-casentinesi');
    expect(s).toMatchObject({ parco: 'foreste-casentinesi', codici: ['10'], nome: 'Anello del Lago', lunghezzaKm: 7.5, daVerificare: true });
    expect(s.escursione.url).toBe('https://www.openstreetmap.org/relation/3');
    expect(s.accesso.link).toContain('parcoforestecasentinesi');
  });

  it('costruisce le query per il parco e per le geometrie', () => {
    expect(queryElencoParco('appennino-lucano')).toContain('area(id:3606274746)');
    expect(queryGeometrie([1, 2])).toContain('rel(id:1,2)');
  });
});

describe('risposte incomplete di Overpass', () => {
  it('un avviso di errore nella risposta conta come server che non risponde', async () => {
    const { interrogaOverpass } = await import('../src/lib/overpass.js');
    const fetchFn = async () => ({ ok: true, json: async () => ({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3' }) });
    await expect(interrogaOverpass('x', { server: ['a', 'b'], fetchFn })).rejects.toThrow(/non risponde/);
  });
});
