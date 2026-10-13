import { describe, it, expect } from 'vitest';
import { sezioneDi, reindirizza } from '../src/lib/sezioni.js';

describe('barra in basso', () => {
  it('assegna ogni schermata alla sua sezione', () => {
    expect(sezioneDi('/')).toBe('mappa');
    expect(sezioneDi('/sentiero/f2')).toBe('mappa');
    expect(sezioneDi('/sentiero/f2/mappa')).toBe('mappa');
    expect(sezioneDi('/miei?scheda=giri')).toBe('miei');
    expect(sezioneDi('/percorso/p1')).toBe('miei');
    expect(sezioneDi('/percorso-nuovo')).toBe('miei');
    expect(sezioneDi('/giro/g1/mappa')).toBe('miei');
    expect(sezioneDi('/giro-nuovo')).toBe('miei');
    expect(sezioneDi('/associazioni')).toBe('associazioni');
    expect(sezioneDi('/parchi')).toBe('altro');
    expect(sezioneDi('/parco/pnalm')).toBe('altro');
    expect(sezioneDi('/avvistamenti')).toBe('altro');
    expect(sezioneDi('/domani')).toBe('altro');
    expect(sezioneDi('/backup')).toBe('altro');
    expect(sezioneDi('/altro')).toBe('altro');
  });

  it('gli indirizzi di prima portano alle nuove sezioni', () => {
    expect(reindirizza('/intorno')).toBe('/');
    expect(reindirizza('/mappa')).toBe('/');
    expect(reindirizza('/pianifica')).toBe('/miei?scheda=percorsi');
    expect(reindirizza('/salvati')).toBe('/miei?scheda=salvati');
    expect(reindirizza('/giri')).toBe('/miei?scheda=giri');
    expect(reindirizza('/giro/g1')).toBeNull();
    expect(reindirizza('/')).toBeNull();
  });
});
