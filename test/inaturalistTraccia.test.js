import { describe, it, expect } from 'vitest';
import { riquadroTraccia, osservazioniNellaFascia, specieConsistenti, mesiMigliori } from '../src/lib/inaturalistTraccia.js';
import { parametriInat, interpretaOsservazioni } from '../src/lib/inaturalist.js';

const pezzi = [[[13.8, 41.7], [13.8, 41.71]]];

describe('iNaturalist lungo la traccia', () => {
  it('allarga il riquadro della traccia', () => {
    const [s, o, n, e] = riquadroTraccia(pezzi, 500);
    expect(s).toBeCloseTo(41.7 - 0.0045, 4);
    expect(n).toBeCloseTo(41.71 + 0.0045, 4);
    expect(e - o).toBeCloseTo(2 * 0.006, 3);
  });

  it('tiene solo le osservazioni nella fascia e conta a parte quelle sfumate', () => {
    const oss = [
      { id: 1, lat: 41.705, lon: 13.8005 }, // ~40 m
      { id: 2, lat: 41.705, lon: 13.805 }, // ~400 m
      { id: 3, lat: 41.705, lon: 13.8, sfumata: true },
    ];
    const r = osservazioniNellaFascia(oss, pezzi, 250);
    expect(r.dentro.map((o) => o.id)).toEqual([1]);
    expect(r.sfumate).toBe(1);
    expect(osservazioniNellaFascia(oss, pezzi, 500).dentro).toHaveLength(2);
  });

  it('mostra solo le specie consistenti (5 osservazioni, 3 persone)', () => {
    const o = (specie, osservatore, data) => ({ specie, nomeScientifico: specie, osservatore, data });
    const elenco = [
      ...['a', 'a', 'b', 'c', 'c'].map((p) => o('Cervo', p, '2026-09-01')),
      ...['a', 'a', 'a', 'a', 'a', 'a'].map((p) => o('Volpe', p, '2026-05-01')),
      o('Lupo', 'd', '2026-01-01'),
    ];
    const r = specieConsistenti(elenco);
    expect(r.map((s) => s.specie)).toEqual(['Cervo']);
    expect(r[0]).toMatchObject({ osservazioni: 5, persone: 3 });
  });

  it('indica i mesi migliori', () => {
    const c = Array(12).fill(0);
    c[8] = 5; c[9] = 4; c[3] = 1;
    expect(mesiMigliori(c)).toBe('apr, set–ott');
    expect(mesiMigliori(Array(12).fill(0))).toBe('');
  });

  it('cerca per gruppo e tiene solo un codice anonimo dell\'osservatore', () => {
    const p = parametriInat({ gruppo: 'Mammalia', stagione: 'tutto', anni: 0, soloVerificate: true });
    expect(p.get('iconic_taxa')).toBe('Mammalia');
    expect(p.has('taxon_id')).toBe(false);
    const [o] = interpretaOsservazioni({ results: [{ id: 1, taxon: {}, user: { id: 42, login: 'nome', name: 'Nome Cognome' } }] });
    expect(o.osservatore).toMatch(/^[0-9a-z]+$/);
    const testo = JSON.stringify(o);
    expect(testo).not.toContain('Cognome');
    expect(testo).not.toContain('"nome"');
  });
});
