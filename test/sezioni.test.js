import { describe, it, expect } from 'vitest';
import { sezioneDi, reindirizza } from '../src/lib/sezioni.js';

describe('barra in basso', () => {
  it('assegna ogni schermata alla sua sezione', () => {
    expect(sezioneDi('/')).toBe('mappa');
    expect(sezioneDi('/sentiero/f2')).toBe('mappa');
    expect(sezioneDi('/sentiero/f2/mappa')).toBe('mappa');
    expect(sezioneDi('/miei?scheda=percorsi')).toBe('miei');
    expect(sezioneDi('/percorso/p1')).toBe('miei');
    expect(sezioneDi('/percorso-nuovo')).toBe('miei');
    expect(sezioneDi('/associazioni')).toBe('altro');
    expect(sezioneDi('/associazioni/nuova')).toBe('altro');
    expect(sezioneDi('/parchi')).toBe('altro');
    expect(sezioneDi('/parco/pnalm')).toBe('altro');
    expect(sezioneDi('/suggerisci')).toBe('mappa');
    expect(sezioneDi('/backup')).toBe('altro');
    expect(sezioneDi('/altro')).toBe('altro');
  });

  it('gli indirizzi di prima portano alle nuove sezioni', () => {
    expect(reindirizza('/intorno')).toBe('/');
    expect(reindirizza('/mappa')).toBe('/');
    expect(reindirizza('/pianifica')).toBe('/miei?scheda=percorsi');
    expect(reindirizza('/salvati')).toBe('/miei?scheda=salvati');
    // giri e avvistamenti non ci sono più: i vecchi indirizzi portano ai percorsi o alla mappa
    expect(reindirizza('/giri')).toBe('/miei?scheda=percorsi');
    expect(reindirizza('/giro/g1')).toBe('/miei?scheda=percorsi');
    expect(reindirizza('/avvistamenti')).toBe('/');
    expect(reindirizza('/domani')).toBe('/suggerisci');
    expect(reindirizza('/domani?zona=x')).toBe('/suggerisci');
    expect(reindirizza('/')).toBeNull();
  });
});
