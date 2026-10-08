import { describe, it, expect } from 'vitest';
import { sezioneDi } from '../src/lib/sezioni.js';

describe('barra in basso', () => {
  it('assegna ogni schermata alla sua sezione', () => {
    expect(sezioneDi('/')).toBe('esplora');
    expect(sezioneDi('/sentiero/f2/mappa')).toBe('esplora');
    expect(sezioneDi('/nuovo')).toBe('esplora');
    expect(sezioneDi('/mappa')).toBe('mappa');
    expect(sezioneDi('/giri')).toBe('giri');
    expect(sezioneDi('/giro/g1/mappa')).toBe('giri');
    expect(sezioneDi('/giro-nuovo')).toBe('giri');
    expect(sezioneDi('/backup')).toBe('altro');
    expect(sezioneDi('/altro')).toBe('altro');
  });
});
