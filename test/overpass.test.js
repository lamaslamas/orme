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
