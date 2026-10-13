import { describe, it, expect } from 'vitest';
import { albaTramonto, oraItaliana, minutiItaliani } from '../src/lib/sole.js';

// riferimenti (tabelle astronomiche, ora italiana): margine di 3 minuti
const vicino = (d, atteso) => {
  const [h, m] = atteso.split(':').map(Number);
  expect(Math.abs(minutiItaliani(d) - (h * 60 + m))).toBeLessThanOrEqual(3);
};
const ROMA = [12.4964, 41.9028];

describe('alba e tramonto sul telefono', () => {
  it('Roma al solstizio d\'estate (ora legale)', () => {
    const { alba, tramonto } = albaTramonto('2026-06-21', ROMA);
    vicino(alba, '05:35');
    vicino(tramonto, '20:48');
  });
  it('Roma al solstizio d\'inverno (ora solare)', () => {
    const { alba, tramonto } = albaTramonto('2026-12-21', ROMA);
    vicino(alba, '07:33');
    vicino(tramonto, '16:42');
  });
  it('più a est tramonta prima: Pescasseroli (1,3° a est di Roma) circa 5 minuti', () => {
    const roma = albaTramonto('2026-10-14', ROMA).tramonto;
    const pescasseroli = albaTramonto('2026-10-14', [13.79, 41.8]).tramonto;
    const differenza = (roma - pescasseroli) / 60_000;
    expect(differenza).toBeGreaterThan(4);
    expect(differenza).toBeLessThan(6.5);
  });
  it('ora nel formato italiano', () => {
    expect(oraItaliana(new Date(Date.UTC(2026, 9, 14, 16, 5)))).toBe('18:05');
    expect(oraItaliana(null)).toBe('–');
  });
});
