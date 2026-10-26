import { describe, it, expect } from 'vitest';
import { normalizzaScelte, normalizzaCerco, leggiScelte, salvaScelte, applicaScelta, CHIAVE_SCELTE } from '../src/lib/scelteSuggerisci.js';
import { SCELTE_PREDEFINITE } from '../src/lib/suggerimenti.js';

const memoria = (contenuto) => {
  const m = new Map(contenuto === undefined ? [] : [[CHIAVE_SCELTE, typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto)]]);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), dentro: () => JSON.parse(m.get(CHIAVE_SCELTE)) };
};

describe('scelte salvate in formati vecchi: si aprono sempre (come «Dove vado domani?»)', () => {
  it('cerco stringa, vuoto, mancante, strano: sempre una lista', () => {
    expect(leggiScelte(memoria({ cerco: 'fauna' })).cerco).toEqual(['fauna']);
    expect(leggiScelte(memoria({ cerco: 'fauna,bosco' })).cerco).toEqual(['fauna', 'bosco']);
    expect(leggiScelte(memoria({ cerco: '' })).cerco).toEqual([]);
    expect(leggiScelte(memoria({ cerco: null })).cerco).toEqual([]);
    expect(leggiScelte(memoria({ cerco: { a: 1 } })).cerco).toEqual([]);
    expect(leggiScelte(memoria({ cerco: ['fauna', 'inesistente', 7] })).cerco).toEqual(['fauna']);
    expect(leggiScelte(memoria({})).cerco).toEqual([]);
    expect(leggiScelte(memoria()).cerco).toEqual([]);
  });
  it('un contenuto rotto o non oggetto dà le scelte predefinite', () => {
    for (const m of [memoria('{rotto'), memoria('null'), memoria('"testo"'), memoria('[1,2]'), memoria('42')]) expect(leggiScelte(m)).toEqual(SCELTE_PREDEFINITE);
    expect(leggiScelte({ getItem: () => { throw new Error('no memoria'); } })).toEqual(SCELTE_PREDEFINITE);
  });
  it('gli altri campi hanno il tipo giusto', () => {
    const s = normalizzaScelte({ quando: 'ieri', tempo: 5, fatica: ['x'], distanza: 120, parco: null, specie: 3, lunghezza: 99, modo: 'boh', quota: 1200, senzaQuote: true });
    expect(s).toMatchObject({ quando: 'oggi', tempo: 'mezza', fatica: 'qualsiasi', distanza: '120', parco: '', specie: '3', lunghezza: '12', modo: 'percorsi', quota: '1200', senzaQuote: '' });
    expect(normalizzaScelte({ tempo: '', distanza: '' })).toMatchObject({ tempo: '', distanza: '' }); // scelte tolte: restano tolte
    expect(normalizzaScelte({ dormire: 'rifugi' }).dormire).toBeUndefined(); // il vecchio «Dove dormire» non c'è più
    expect(normalizzaScelte({ tempo: 'due' }).tempo).toBe('mezza'); // «2 giorni con notte» salvato prima
  });
  it('non condivide la lista con le scelte predefinite', () => {
    const a = normalizzaScelte({});
    a.cerco.push('fauna');
    expect(SCELTE_PREDEFINITE.cerco).toEqual([]);
    expect(normalizzaScelte({}).cerco).toEqual([]);
  });
  it('salvare rimette in forma anche le scelte in memoria', () => {
    const m = memoria();
    const scelte = { ...SCELTE_PREDEFINITE, cerco: 'fauna' };
    salvaScelte(scelte, m);
    expect(scelte.cerco).toEqual(['fauna']);
    expect(m.dentro().cerco).toEqual(['fauna']);
  });
  it('normalizzaCerco', () => {
    expect(normalizzaCerco('fauna  panorama')).toEqual(['fauna', 'panorama']);
    expect(normalizzaCerco(['fauna', 'fauna'])).toEqual(['fauna']);
    expect(normalizzaCerco(undefined)).toEqual([]);
  });
});

describe('il tocco su una voce (la causa dell\'errore: «cerco» diventava una stringa)', () => {
  it('«Cosa cerchi» accende e spegne le voci e resta una lista', () => {
    let s = normalizzaScelte({});
    s = applicaScelta(s, 'cerco', 'fauna');
    expect(s.cerco).toEqual(['fauna']);
    s = applicaScelta(s, 'cerco', 'bosco');
    expect(s.cerco).toEqual(['fauna', 'bosco']);
    s = applicaScelta(s, 'cerco', 'fauna');
    expect(s.cerco).toEqual(['bosco']);
    expect(Array.isArray(s.cerco)).toBe(true);
  });
  it('anche partendo da un valore vecchio (stringa) e senza toccare le scelte di prima', () => {
    const prima = { ...SCELTE_PREDEFINITE, cerco: 'fauna' };
    const s = applicaScelta(prima, 'cerco', 'acqua');
    expect(s.cerco).toEqual(['fauna', 'acqua']);
    expect(prima.cerco).toBe('fauna');
  });
  it('tempo, distanza e fatica si tolgono toccando di nuovo; le altre scelte prendono il valore', () => {
    let s = normalizzaScelte({ tempo: 'giornata', fatica: 'media', distanza: '60' });
    s = applicaScelta(s, 'tempo', 'giornata');
    s = applicaScelta(s, 'fatica', 'media');
    s = applicaScelta(s, 'distanza', '60');
    expect(s).toMatchObject({ tempo: '', fatica: 'qualsiasi', distanza: '' });
    s = applicaScelta(s, 'quando', 'sabato');
    expect(s.quando).toBe('sabato');
    expect(applicaScelta(s, 'tempo', 'giornata').tempo).toBe('giornata');
  });
});
