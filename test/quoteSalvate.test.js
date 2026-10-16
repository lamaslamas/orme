import { describe, it, expect } from 'vitest';
import { conQuoteSalvate, quotePerSalvare, quoteDellaScheda } from '../src/lib/quoteSalvate.js';

const senza = [[[13.7, 41.8], [13.71, 41.81]], [[13.72, 41.82]]];
const salvate = { impronta: 'abc', fonte: 'tinitaly', z: [1000, 1010.5, 1020] };

describe('quote scaricate e salvate a parte', () => {
  it('si rimettono nei punti, nell\'ordine, senza toccare lon e lat', () => {
    const r = conQuoteSalvate(senza, salvate, 'abc');
    expect(r).toEqual([[[13.7, 41.8, 1000], [13.71, 41.81, 1010.5]], [[13.72, 41.82, 1020]]]);
    expect(senza[0][0]).toHaveLength(2); // l'originale non cambia
  });
  it('non valgono per un\'altra traccia (impronta diversa), con un numero di punti diverso o con buchi', () => {
    expect(conQuoteSalvate(senza, salvate, 'xyz')).toBeNull();
    expect(conQuoteSalvate(senza, { ...salvate, z: [1, 2] }, 'abc')).toBeNull();
    expect(conQuoteSalvate(senza, { ...salvate, z: [1, null, 3] }, 'abc')).toBeNull();
    expect(conQuoteSalvate(senza, undefined, 'abc')).toBeNull();
  });
  it('quotePerSalvare: elenco arrotondato, null senza tutte le quote', () => {
    expect(quotePerSalvare([[[1, 2, 100.04], [1, 2, 100.06]]])).toEqual([100, 100.1]);
    expect(quotePerSalvare(senza)).toBeNull();
  });
  it('quoteDellaScheda: prima quelle della traccia, poi quelle scaricate, altrimenti null', () => {
    const con = [[[13.7, 41.8, 900], [13.71, 41.81, 950]]];
    expect(quoteDellaScheda(con, salvate, 'abc')).toEqual({ pezzi: con, fonte: 'traccia' });
    expect(quoteDellaScheda(senza, salvate, 'abc').fonte).toBe('tinitaly');
    expect(quoteDellaScheda(senza, undefined, 'abc')).toBeNull();
  });
});
