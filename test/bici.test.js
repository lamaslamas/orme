import { describe, it, expect } from 'vitest';
import { completaSentiero, biciPredefinita } from '../src/lib/sentiero.js';
import {
  numeroMtb,
  riassumiTagBici,
  unisciRiassunti,
  descriviSuggerimento,
  valoriSuggeriti,
  haInformazioniBici,
} from '../src/lib/bici.js';

describe('completaSentiero', () => {
  it('aggiunge la bici "da verificare" ai sentieri vecchi senza toccare il resto', () => {
    const vecchio = { id: 'x', nome: 'X', notePersonali: 'mie note', stato: 'fatto' };
    const s = completaSentiero(vecchio);
    expect(s.bici).toEqual(biciPredefinita());
    expect(s.notePersonali).toBe('mie note');
    expect(s.stato).toBe('fatto');
    expect(vecchio.bici).toBeUndefined();
  });

  it('conserva i valori bici già presenti', () => {
    const s = completaSentiero({ id: 'x', bici: { consentita: 'si', pedalabilita: 'media', scalaMtb: 'S2', nota: 'ok' } });
    expect(s.bici).toMatchObject({ consentita: 'si', pedalabilita: 'media', scalaMtb: 'S2', nota: 'ok' });
    expect(s.bici.link).toMatch(/^https/);
  });

  it('corregge valori non validi e svuota la pedalabilità se vietata', () => {
    expect(completaSentiero({ bici: { consentita: 'forse', scalaMtb: 'S9' } }).bici).toMatchObject({
      consentita: 'da_verificare',
      scalaMtb: null,
    });
    expect(completaSentiero({ bici: { consentita: 'no', pedalabilita: 'facile', scalaMtb: 'S1' } }).bici).toMatchObject({
      pedalabilita: null,
      scalaMtb: null,
    });
  });
});

describe('suggerimento bici da OpenStreetMap', () => {
  it('legge la scala MTB nei formati di OSM', () => {
    expect(numeroMtb('2+')).toBe(2);
    expect(numeroMtb('0-')).toBe(0);
    expect(numeroMtb('')).toBeNull();
  });

  const tratti = [
    { bicycle: 'no', 'mtb:scale': '1' },
    { bicycle: 'yes', 'mtb:scale': '3' },
    { highway: 'path' },
    { bicycle: 'dismount' },
  ];

  it('riassume i tag dei tratti', () => {
    const r = riassumiTagBici(tratti);
    expect(r.tratti).toBe(4);
    expect(r.bicycle).toEqual({ si: 1, no: 1, a_spinta: 1, nonIndicato: 1 });
    expect(r.mtbScale).toEqual({ min: 1, max: 3 });
    expect(descriviSuggerimento(r)).toBe('vietata su 1 tratto su 4 · a spinta su 1 su 4 · consentita su 1 su 4 · scala MTB S1–S3');
  });

  it('propone "vietata" se anche un solo tratto lo è', () => {
    expect(valoriSuggeriti(riassumiTagBici(tratti))).toEqual({ consentita: 'no' });
  });

  it('propone "consentita" solo se tutti i tratti lo dicono', () => {
    expect(valoriSuggeriti(riassumiTagBici([{ bicycle: 'yes', 'mtb:scale': '2' }, { bicycle: 'designated' }]))).toEqual({
      consentita: 'si',
      scalaMtb: 'S2',
    });
    expect(valoriSuggeriti(riassumiTagBici([{ bicycle: 'yes' }, {}]))).toEqual({});
  });

  it('limita la scala a S5 e non propone nulla senza informazioni', () => {
    expect(valoriSuggeriti(riassumiTagBici([{ 'mtb:scale': '6' }]))).toEqual({ scalaMtb: 'S5' });
    const vuoto = riassumiTagBici([{}, {}]);
    expect(haInformazioniBici(vuoto)).toBe(false);
    expect(valoriSuggeriti(vuoto)).toEqual({});
  });

  it('unisce i riassunti di più sentieri', () => {
    const u = unisciRiassunti([riassumiTagBici([{ bicycle: 'no' }]), null, riassumiTagBici([{ 'mtb:scale': '4' }])]);
    expect(u.tratti).toBe(2);
    expect(u.bicycle.no).toBe(1);
    expect(u.mtbScale).toEqual({ min: 4, max: 4 });
    expect(unisciRiassunti([])).toBeNull();
  });
});

describe('difficoltà CAI', () => {
  it('è vuota per i sentieri vecchi e accetta solo T, E, EE, EEA', () => {
    expect(completaSentiero({ id: 'x' }).difficolta).toBeNull();
    expect(completaSentiero({ difficolta: 'EE' }).difficolta).toBe('EE');
    expect(completaSentiero({ difficolta: 'X' }).difficolta).toBeNull();
  });
});
