import { describe, it, expect } from 'vitest';
import { sezioneDi } from '../src/lib/sezioni.js';

describe('barra in basso', () => {
  it('assegna ogni schermata alla sua sezione', () => {
    expect(sezioneDi('/')).toBe('parchi');
    expect(sezioneDi('/parco/pnalm')).toBe('parchi');
    expect(sezioneDi('/sentiero/f2/mappa')).toBe('parchi');
    expect(sezioneDi('/nuovo')).toBe('parchi');
    expect(sezioneDi('/giri')).toBe('parchi');
    expect(sezioneDi('/giro/g1/mappa')).toBe('parchi');
    expect(sezioneDi('/avvistamenti')).toBe('parchi');
    expect(sezioneDi('/mappa')).toBe('mappa');
    expect(sezioneDi('/pianifica')).toBe('pianifica');
    expect(sezioneDi('/percorso/p1')).toBe('pianifica');
    expect(sezioneDi('/percorso-nuovo')).toBe('pianifica');
    expect(sezioneDi('/domani')).toBe('pianifica');
    expect(sezioneDi('/backup')).toBe('altro');
    expect(sezioneDi('/altro')).toBe('altro');
  });
});
