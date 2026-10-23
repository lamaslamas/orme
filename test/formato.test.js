import { describe, it, expect } from 'vitest';
import { testoSalitaMax } from '../src/lib/formato.js';
describe('salita e quota massima, uguali ovunque', () => {
  it('«+343 m · max 1.642 m»; se manca un dato non scrive niente per quello', () => {
    expect(testoSalitaMax(343, 1642)).toBe('+343 m · max 1.642 m');
    expect(testoSalitaMax(343, null)).toBe('+343 m');
    expect(testoSalitaMax(null, 1642)).toBe('max 1.642 m');
    expect(testoSalitaMax(null, null)).toBe('');
    expect(testoSalitaMax(undefined, NaN)).toBe('');
  });
});
