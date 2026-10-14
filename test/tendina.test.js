import { describe, it, expect } from 'vitest';
import { posizioneFinale, altezzeTendina } from '../src/lib/tendina.js';

const altezze = { meta: 300, aperta: 600 };
describe('tendina a tre posizioni', () => {
  it('la posizione più vicina quando si stacca piano', () => {
    expect(posizioneFinale({ altezza: 320, altezze })).toBe('meta');
    expect(posizioneFinale({ altezza: 500, altezze })).toBe('aperta');
    expect(posizioneFinale({ altezza: 120, altezze })).toBe('chiusa');
  });
  it('una spinta veloce in giù chiude; dall\'alto scende a metà', () => {
    expect(posizioneFinale({ altezza: 280, velocita: 1, altezze })).toBe('chiusa');
    expect(posizioneFinale({ altezza: 560, velocita: 1, altezze })).toBe('meta');
  });
  it('una spinta veloce in su apre', () => {
    expect(posizioneFinale({ altezza: 320, velocita: -1, altezze })).toBe('aperta');
  });
  it('altezze dallo spazio disponibile', () => {
    expect(altezzeTendina(700)).toEqual({ meta: 336, aperta: 692 });
  });
});

import { chiudereFinestra } from '../src/lib/tendina.js';
describe('finestre trascinabili', () => {
  it('si chiudono oltre un terzo o con una spinta in giù', () => {
    expect(chiudereFinestra({ spostamento: 200, altezza: 500 })).toBe(true);
    expect(chiudereFinestra({ spostamento: 100, altezza: 500 })).toBe(false);
    expect(chiudereFinestra({ spostamento: 40, altezza: 500, velocita: 1 })).toBe(true);
    expect(chiudereFinestra({ spostamento: 300, altezza: 500, velocita: -1 })).toBe(false);
  });
});
