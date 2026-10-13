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
    expect(r).toEqual({ collegate: 1, nonValidi: ['x', 'u1b'] });
    expect(percorsi[0].traccia).toEqual({ origine: 'osm', geojson: geo, dettagli: { conferma: { sentiero: 's', nome: 'S', data: 'd' } } });
    expect(percorsi[1].traccia.dettagli).toBeUndefined();
    const conNessuno = [{ id: 'n' }];
    applicaCollegamenti(conNessuno, { collegamenti: [{ uscita: 'n', nessuno: true, data: 'd' }] });
    expect(conNessuno[0].collegamento).toEqual({ nessuno: true, data: 'd' });
  });
});

import { sentieriDelleUscite } from '../src/lib/collegamenti.js';
describe('livello dei sentieri delle uscite', () => {
  it('un elemento per sentiero, con tutte le uscite che lo usano', () => {
    const g = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
    const tracce = new Map([
      ['a', { geojson: g, dettagli: { conferma: { sentiero: 's1', nome: 'S1' } } }],
      ['b', { geojson: g, dettagli: { conferma: { sentiero: 's1', nome: 'S1' } } }],
      ['c', { geojson: g, dettagli: {} }],
    ]);
    const r = sentieriDelleUscite([{ id: 'a' }, { id: 'b' }, { id: 'c', nome: 'Uscita C' }, { id: 'd' }], tracce);
    expect(r.map((x) => [x.chiave, x.nome, x.uscite.map((u) => u.id)])).toEqual([
      ['s1', 'S1', ['a', 'b']],
      ['c', 'Uscita C', ['c']],
    ]);
  });
});

import { collegamentiDelTelefono, testoFileCollegamenti, stessiCollegamenti } from '../src/lib/collegamenti.js';
describe('esporta collegamenti', () => {
  it('solo quelli scelti sul telefono, con i "nessuno"', () => {
    const tracce = new Map([
      ['a', { dettagli: { conferma: { sentiero: 's1', nome: 'S1', data: 'd1' } } }],
      ['b', { dettagli: { archivio: true, conferma: { sentiero: 's2', nome: 'S2', data: 'd2' } } }],
    ]);
    const uscite = [{ id: 'a' }, { id: 'b' }, { id: 'c', collegamento: { nessuno: true, data: 'd3' } }, { id: 'd' }, { id: 'm', manuale: { data: 'd' }, collegamento: { nessuno: true } }];
    expect(collegamentiDelTelefono(uscite, tracce)).toEqual([
      { uscita: 'a', sentiero: 's1', nome: 'S1', data: 'd1' },
      { uscita: 'c', nessuno: true, data: 'd3' },
    ]);
  });
  it('file leggibile e valido, un collegamento per riga', () => {
    const f = fileCollegamenti(null, [{ uscita: 'a', sentiero: 's1', nome: 'S1', data: 'd' }, { uscita: 'b', nessuno: true, data: 'd' }], '2026-10-13');
    const testo = testoFileCollegamenti(f);
    expect(JSON.parse(testo)).toEqual(f);
    expect(testo.split('\n').filter((r) => r.includes('"uscita"'))).toHaveLength(2);
    expect(stessiCollegamenti(f, JSON.parse(testo))).toBe(true);
    expect(stessiCollegamenti(f, { collegamenti: [] })).toBe(false);
  });
});

import { puntiDiRitrovo } from '../src/lib/collegamenti.js';
describe('punti di ritrovo', () => {
  it('uno per paese, con le coordinate migliori disponibili', () => {
    const u = (id, paese, extra = {}) => ({ id, partenza: { paese, lat: null, lon: null }, ...extra });
    const punti = puntiDiRitrovo(
      [
        u('a', 'Chiusi della Verna', { luoghi: { punti: [{ nome: 'La Beccia', lat: 43.706, lon: 11.926 }, { nome: 'Chiusi della Verna', lat: 43.707, lon: 11.931 }] } }),
        u('b', 'chiusi della verna'),
        u('c', '', { luoghi: { punti: [{ nome: 'Lago di Ponte', lat: 44.0286, lon: 11.6976 }] } }),
        u('d', 'Pescasseroli'),
        u('e', ''),
        u('f', '', { luoghi: { punti: [{ nome: "Fra' Lupo", lat: 43.71, lon: 11.93 }] } }),
      ],
      new Map([['d', { geojson: { type: 'MultiLineString', coordinates: [[[13.79, 41.8], [13.8, 41.81]]] } }]]),
    );
    expect(punti.map((p) => [p.nome, p.lat, p.lon, p.uscite.map((x) => x.id)])).toEqual([
      ['Chiusi della Verna', 43.707, 11.931, ['a', 'f', 'b']],
      ['Pescasseroli', 41.8, 13.79, ['d']],
      ['Lago di Ponte', 44.0286, 11.6976, ['c']],
    ]);
  });
});
