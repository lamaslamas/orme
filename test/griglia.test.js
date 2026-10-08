import { describe, it, expect } from 'vitest';
import { celleDaTile, rapportoSforzo, classifica, tilePerRiquadro } from '../src/lib/griglia.js';

// griglia 4×4 con due celle: "!" (chiave a) in alto a sinistra 2×2, "#" (chiave b) in basso a destra
const utf = (conteggioA, conteggioB) => ({
  grid: ['!!  ', '!!  ', '   #', '    '],
  keys: ['', 'a', 'b'],
  data: { a: { cellCount: conteggioA }, b: { cellCount: conteggioB } },
});

describe('griglia iNaturalist', () => {
  it('ricava le celle con estensione e conteggio', () => {
    const celle = celleDaTile(0, 0, 0, utf(5, 1));
    const a = celle.find((c) => c.conteggio === 5);
    expect(a.chiave).toBe('0/0/0/0/0');
    // metà sinistra in alto del mondo: ovest -180, est 0
    expect(a.limiti[1]).toBeCloseTo(-180);
    expect(a.limiti[3]).toBeCloseTo(0);
    expect(a.limiti[2]).toBeGreaterThan(a.limiti[0]);
  });

  it('calcola il rapporto solo dove i dati bastano', () => {
    const specie = celleDaTile(0, 0, 0, { ...utf(3, 0), grid: ['!!  ', '!!  ', '    ', '    '] });
    const tutte = celleDaTile(0, 0, 0, utf(30, 5));
    const r = rapportoSforzo(specie, tutte, 20);
    const a = r.find((c) => c.tutte === 30);
    const b = r.find((c) => c.tutte === 5);
    expect(a.indice).toBeCloseTo(0.1);
    expect(b.indice).toBeNull();
  });

  it('classifica in quartili, con zero e dati insufficienti a parte', () => {
    const celle = [0.01, 0.02, 0.03, 0.04, 0, null].map((indice, i) => ({ chiave: String(i), indice }));
    const c = classifica(celle).map((x) => x.classe);
    expect(c).toEqual([1, 2, 3, 4, 0, null]);
  });

  it('trova le tile che coprono il riquadro', () => {
    expect(tilePerRiquadro([41.6, 13.6, 42.0, 14.1], 10)).toEqual(expect.arrayContaining([[550, 380]]));
    expect(tilePerRiquadro([-10, -10, 10, 10], 1)).toHaveLength(4);
  });
});
