import { describe, it, expect } from 'vitest';
import { difficoltaDaOsm, testoDifficolta } from '../src/lib/difficolta.js';

describe('difficoltà nella scala CAI', () => {
  it('cai_scale prima di tutto, poi via ferrata, poi la SAC convertita', () => {
    expect(difficoltaDaOsm({ cai_scale: 'EE', sac_scale: 'mountain_hiking' })).toEqual({ cai: 'EE', sac: 'T2', alpinistico: false });
    expect(difficoltaDaOsm({ highway: 'via_ferrata' }).cai).toBe('EEA');
    expect(difficoltaDaOsm({ sac_scale: 'hiking' }).cai).toBe('T');
    expect(difficoltaDaOsm({ sac_scale: 'mountain_hiking' }).cai).toBe('E');
    expect(difficoltaDaOsm({ sac_scale: 'demanding_mountain_hiking' }).cai).toBe('EE');
    expect(difficoltaDaOsm({ sac_scale: 'alpine_hiking' })).toMatchObject({ cai: 'EE', alpinistico: true });
    expect(difficoltaDaOsm({ highway: 'path' })).toBeNull();
  });
  it('la SAC solo tra parentesi, mai da sola', () => {
    expect(testoDifficolta(difficoltaDaOsm({ sac_scale: 'mountain_hiking' }))).toBe('E · escursionistico (SAC T2)');
    expect(testoDifficolta(difficoltaDaOsm({ sac_scale: 'mountain_hiking' }), { breve: true })).toBe('E · escursionistico');
  });
});
