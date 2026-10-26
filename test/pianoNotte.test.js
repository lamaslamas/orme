import { describe, it, expect } from 'vitest';
import { pianoNotte, testoGiornate, MOTIVI_NOTTE } from '../src/lib/pianoNotte.js';

// 44 km verso est a 41,8° N, un punto ogni 0,5 km circa (0,006° ≈ 0,5 km), senza quote: in dicembre non sta in una giornata di luce
const linea = Array.from({ length: 89 }, (_, i) => [13.6 + i * 0.006, 41.8]);
const pezzi = [linea];
const geojson = { type: 'MultiLineString', coordinates: pezzi };
// un rifugio sulla traccia a metà del cammino (km ~22)
const rifugio = { id: 'n1', tipo: 'rifugio', nome: 'Rifugio di prova', lon: 13.6 + 44 * 0.006, lat: 41.8 };
const base = { pezzi, anello: false, modo: 'andata', data: '2026-12-20', partenzaMin: 8 * 60, dormire: 'qualsiasi', geojson, misure: { durataMin: 660, salita: null } };

describe('piano con la notte, uguale per Suggerisci e «Su più giorni»', () => {
  it('con un rifugio a metà c\'è un piano in due giornate e la stessa frase', () => {
    const r = pianoNotte({ ...base, punti: [rifugio] });
    expect(r.motivo).toBeUndefined();
    expect(r.etichetta).toContain('Rifugio di prova');
    const frase = testoGiornate(r.piano);
    expect(frase).toMatch(/^Giorno 1: 08:00–/);
    expect(frase).toContain('notte: ');
    expect(frase).toContain('Giorno 2: ');
  });
  it('senza posti per dormire: nessun posto; troppo breve: basta un giorno', () => {
    expect(pianoNotte({ ...base, punti: [] }).motivo).toBe('nessun-posto');
    const corto = [Array.from({ length: 9 }, (_, i) => [13.6 + i * 0.006, 41.8])];
    expect(pianoNotte({ ...base, pezzi: corto, geojson: { type: 'MultiLineString', coordinates: corto }, misure: null, punti: [rifugio] }).motivo).toBe('breve');
  });
  it('senza punti o traccia: mancano i dati; ogni motivo ha la sua frase', () => {
    expect(pianoNotte({ ...base, punti: null }).motivo).toBe('senza-dati');
    for (const m of ['breve', 'troppo-lungo', 'nessun-posto', 'luce', 'senza-dati']) expect(MOTIVI_NOTTE[m]).toBeTruthy();
  });
});
