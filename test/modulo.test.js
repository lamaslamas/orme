import { describe, it, expect } from 'vitest';
import { leggiCodici, sentieroDaModulo } from '../src/lib/modulo.js';
import { creaId } from '../src/lib/formato.js';

describe('modulo sentiero', () => {
  it('legge i codici in molti formati', () => {
    expect(leggiCodici('F10')).toEqual(['F10']);
    expect(leggiCodici('t2 + u1')).toEqual(['T2', 'U1']);
    expect(leggiCodici('L1, M1,N1 L1')).toEqual(['L1', 'M1', 'N1']);
    expect(leggiCodici('')).toEqual([]);
  });

  it('richiede il nome', () => {
    expect(() => sentieroDaModulo({ nome: '  ' })).toThrow('nome');
  });

  it('converte numeri con la virgola e la durata in minuti', () => {
    const s = sentieroDaModulo({ nome: 'X', lunghezzaKm: '7,5', dislivelloM: '450', durataOre: '3', durataMin: '30' });
    expect(s.lunghezzaKm).toBe(7.5);
    expect(s.dislivelloM).toBe(450);
    expect(s.durataMin).toBe(210);
  });

  it('lascia vuoti i campi numerici non compilati', () => {
    const s = sentieroDaModulo({ nome: 'X' });
    expect(s.lunghezzaKm).toBeNull();
    expect(s.durataMin).toBeNull();
    expect(s.partenza.lat).toBeNull();
    expect(s.accesso.tipo).toBe('nessuno');
    expect(s.accesso.link).toMatch(/^https:\/\//);
  });

  it('rifiuta valori impossibili', () => {
    expect(() => sentieroDaModulo({ nome: 'X', lunghezzaKm: 'tanti' })).toThrow('Lunghezza');
    expect(() => sentieroDaModulo({ nome: 'X', lat: '41.8' })).toThrow('longitudine');
    expect(() => sentieroDaModulo({ nome: 'X', durataMin: '75' })).toThrow('minuti');
  });

  it('tiene solo animali conosciuti e conserva id e creato', () => {
    const s = sentieroDaModulo({ nome: 'X', animali: ['orso', 'drago'] }, { id: 'abc', creato: '2026-01-01' });
    expect(s.animali).toEqual(['orso']);
    expect(s.id).toBe('abc');
    expect(s.creato).toBe('2026-01-01');
  });

  it('crea id leggibili', () => {
    expect(creaId(['F10'], 'Pianezza – Monte Marsicano')).toBe('f10-pianezza-monte-marsicano');
    expect(creaId([], 'Città Sant’Àngelo')).toBe('citta-sant-angelo');
  });
});

describe('modulo: bici', () => {
  it('salva consentita, pedalabilità e scala', () => {
    const s = sentieroDaModulo({ nome: 'X', biciConsentita: 'si', pedalabilita: 'media', scalaMtb: 'S2', biciNota: ' nota ' });
    expect(s.bici).toMatchObject({ consentita: 'si', pedalabilita: 'media', scalaMtb: 'S2', nota: 'nota' });
  });
  it('svuota la pedalabilità se la bici è vietata', () => {
    const s = sentieroDaModulo({ nome: 'X', biciConsentita: 'no', pedalabilita: 'facile', scalaMtb: 'S1' });
    expect(s.bici.pedalabilita).toBeNull();
    expect(s.bici.scalaMtb).toBeNull();
  });
  it('usa "da verificare" se manca o non è valida', () => {
    expect(sentieroDaModulo({ nome: 'X' }).bici.consentita).toBe('da_verificare');
    expect(sentieroDaModulo({ nome: 'X', biciConsentita: 'boh', scalaMtb: 'S7' }).bici).toMatchObject({
      consentita: 'da_verificare',
      scalaMtb: null,
    });
  });
});

describe('modulo: difficoltà', () => {
  it('salva la difficoltà se valida', () => {
    expect(sentieroDaModulo({ nome: 'X', difficolta: 'E' }).difficolta).toBe('E');
    expect(sentieroDaModulo({ nome: 'X', difficolta: '' }).difficolta).toBeNull();
  });
});
