// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { impostaRitmo, rileggiRitmo, ritmoScelto, fattoreRitmo, testoRitmo } from '../src/lib/ritmo.js';
import { stimaDurataMin } from '../src/lib/durata.js';
import { profiloTempi, finiGiornata } from '../src/lib/lungoIlPercorso.js';

beforeEach(() => {
  localStorage.clear();
  rileggiRitmo();
});
const pezzi = [[[13, 42, 1000], [13.04, 42, 1000], [13.08, 42, 1000]]]; // ~6,6 km in piano

describe('ritmo di cammino', () => {
  it('senza soste è il CAI puro; con soste +25%, fotografico +75%; si ricorda', () => {
    expect(ritmoScelto()).toBe('senza');
    const base = stimaDurataMin(8, null); // 120 min
    expect(base).toBe(120);
    impostaRitmo('soste');
    expect(stimaDurataMin(8, null)).toBe(150);
    impostaRitmo('fotografico');
    expect(stimaDurataMin(8, null)).toBe(210);
    expect(testoRitmo()).toMatch(/fotografico/i);
    expect(localStorage.getItem('orme.ritmo')).toBe('fotografico');
    expect(rileggiRitmo()).toBe('fotografico');
  });
  it('il profilo dei tempi e il punto di fine giornata seguono il ritmo', () => {
    const km = profiloTempi(pezzi).km.at(-1);
    const normale = profiloTempi(pezzi).min.at(-1);
    impostaRitmo('fotografico');
    const lento = profiloTempi(pezzi).min.at(-1);
    expect(lento).toBeCloseTo(normale * 1.75, 5);
    // con 2 h al giorno si arriva meno lontano: il primo fine giornata cade a meno km
    const serie = profiloTempi(pezzi);
    impostaRitmo('senza');
    const serieNormale = profiloTempi(pezzi);
    const fineLento = finiGiornata(serie, 2)[0]?.km;
    const fineNormale = finiGiornata(serieNormale, 2)[0]?.km;
    expect(fattoreRitmo()).toBe(1);
    if (fineLento != null && fineNormale != null) expect(fineLento).toBeLessThan(fineNormale);
    expect(km).toBeGreaterThan(6);
  });
});
