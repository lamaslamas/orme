import { describe, it, expect } from 'vitest';
import { stessoRitrovo, conStessoRitrovo, statoCollegamenti, fileCollegamenti, applicaCollegamenti, collegamentoDi } from '../src/lib/collegamenti.js';

const uscita = (id, paese, punti = []) => ({ id, nome: id, partenza: { paese, lat: null, lon: null }, luoghi: { punti }, escursione: { nomeUscita: `Uscita ${id}` } });

describe('collegamenti tra uscite e sentieri', () => {
  it('stesso ritrovo: stesso paese o luogo entro 1 km', () => {
    expect(stessoRitrovo(uscita('a', 'Chiusi della Verna'), uscita('b', 'chiusi della verna'))).toBe(true);
    expect(stessoRitrovo(uscita('a', '', [{ nome: 'X', lat: 43.7, lon: 11.9 }]), uscita('b', '', [{ nome: 'Y', lat: 43.705, lon: 11.9 }]))).toBe(true);
    expect(stessoRitrovo(uscita('a', '', [{ nome: 'X', lat: 43.7, lon: 11.9 }]), uscita('b', '', [{ nome: 'Y', lat: 43.8, lon: 11.9 }]))).toBe(false);
    expect(stessoRitrovo(uscita('a', ''), uscita('b', ''))).toBe(false);
  });
  it('il sentiero scelto per un\'uscita con lo stesso ritrovo va in testa', () => {
    const candidati = [
      { id: 's1', nome: 'Sentiero 1', codici: [], motivi: ['nomina Pratalino'] },
      { id: 's2', nome: 'Sentiero 2', codici: [], motivi: ['passa da La Beccia'] },
    ];
    const collegati = [{ uscita: uscita('b', 'Chiusi della Verna'), sentiero: { id: 's2', nome: 'Sentiero 2' } }];
    const r = conStessoRitrovo(uscita('a', 'Chiusi della Verna'), candidati, collegati);
    expect(r.map((c) => c.id)).toEqual(['s2', 's1']);
    expect(r[0].motivi[0]).toBe('stesso ritrovo di «Uscita b»');
    // anche se non era tra i candidati
    const r2 = conStessoRitrovo(uscita('a', 'Chiusi della Verna'), candidati, [{ uscita: uscita('b', 'Chiusi della Verna'), sentiero: { id: 's9', nome: 'Sentiero 9' } }]);
    expect(r2.map((c) => c.id)).toEqual(['s9', 's1', 's2']);
    expect(candidati[1].motivi).toHaveLength(1); // i candidati di partenza non cambiano
  });
  it('riepilogo: da collegare, collegate, senza sentiero adatto', () => {
    const u = [uscita('a', ''), uscita('b', ''), { ...uscita('c', ''), collegamento: { nessuno: true } }];
    const st = statoCollegamenti(u, new Map([['b', { geojson: {} }]]));
    expect([st.daCollegare, st.collegate, st.nessuno].map((x) => x.map((s) => s.id))).toEqual([['a'], ['b'], ['c']]);
  });
  it('collegamento dalla traccia scelta', () => {
    expect(collegamentoDi({ id: 'u' }, { dettagli: { conferma: { sentiero: 's', nome: 'S', data: '2026-10-13' } } })).toEqual({ uscita: 'u', sentiero: 's', nome: 'S', data: '2026-10-13' });
    expect(collegamentoDi({ id: 'u' }, { dettagli: {} })).toBeNull();
  });
  it('file da esportare: unisce, i nuovi vincono, "nessuno" non cancella un sentiero', () => {
    const prima = { collegamenti: [{ uscita: 'b', sentiero: 's1', nome: 'S1', data: '2026-01-01' }, { uscita: 'c', sentiero: 's3', nome: 'S3', data: '2026-01-01' }] };
    const f = fileCollegamenti(prima, [{ uscita: 'a', sentiero: 's2', nome: 'S2', data: '2026-10-13' }, { uscita: 'c', nessuno: true }, { uscita: 'b', sentiero: 's4', nome: 'S4' }], '2026-10-13');
    expect(f.collegamenti).toEqual([
      { uscita: 'a', sentiero: 's2', nome: 'S2', data: '2026-10-13' },
      { uscita: 'b', sentiero: 's4', nome: 'S4', data: '2026-10-13' },
      { uscita: 'c', sentiero: 's3', nome: 'S3', data: '2026-01-01' },
    ]);
  });
  it('robot: l\'uscita prende la traccia del sentiero, mai al posto di una sua', () => {
    const geo = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
    const percorsi = [{ id: 'u1' }, { id: 'u2', traccia: { geojson: { type: 'LineString', coordinates: [] } } }, { id: 's', nome: 'S', traccia: { origine: 'osm', geojson: geo } }];
    const r = applicaCollegamenti(percorsi, { collegamenti: [{ uscita: 'u1', sentiero: 's', data: 'd' }, { uscita: 'u2', sentiero: 's' }, { uscita: 'x', sentiero: 's' }, { uscita: 'u1b', nessuno: true }] });
    expect(r).toEqual({ collegate: 1, nonValidi: ['x'] });
    expect(percorsi[0].traccia).toEqual({ origine: 'osm', geojson: geo, dettagli: { conferma: { sentiero: 's', nome: 'S', data: 'd' } } });
    expect(percorsi[1].traccia.dettagli).toBeUndefined();
  });
});
