import { describe, it, expect } from 'vitest';
import { raggruppaPerSpecie, dataBreve } from '../src/lib/osservazioniPerSpecie.js';

const o = (specie, sci, data) => ({ specie, nomeScientifico: sci, data });
describe('osservazioni per specie', () => {
  it('raggruppa, ordina per numero e dà l\'ultima data', () => {
    const r = raggruppaPerSpecie([o('Volpe', 'Vulpes vulpes', '2026-07-12'), o('Cervo', 'Cervus elaphus', '2025-01-01'), o('Volpe', 'Vulpes vulpes', '2024-05-05'), o('Volpe', 'Vulpes vulpes', '2026-01-02')]);
    expect(r.map((g) => [g.nome, g.n, g.ultima])).toEqual([['Volpe', 3, '2026-07-12'], ['Cervo', 1, '2025-01-01']]);
    expect(r[0].oss[0].data).toBe('2026-07-12'); // la più recente per prima
  });
  it('senza date non si rompe', () => {
    expect(raggruppaPerSpecie([o('Lupo', 'Canis lupus', null)])[0].ultima).toBeNull();
    expect(dataBreve('2026-07-12')).toBe('12/07/2026');
    expect(dataBreve(null)).toBe('data non indicata');
  });
});
