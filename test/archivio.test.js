import { describe, it, expect } from 'vitest';
import { unisciTreVie, recordDaSentiero, tracciaDaArchivio, pianoSincronizzazione, controllaArchivio } from '../src/lib/archivio.js';

const base = { id: 'a', nome: 'Vecchio nome', accesso: { tipo: 'libero', nota: 'vecchia' }, codici: ['B5'] };

describe('unione a tre vie', () => {
  it('aggiorna i campi che non ho toccato, anche dentro gli oggetti', () => {
    const mio = { ...base, accesso: { tipo: 'libero', nota: 'scritta da me' }, notePersonali: 'mie', stato: 'fatto' };
    const nuovo = { id: 'a', nome: 'Nome nuovo', accesso: { tipo: 'guida', nota: 'nuova' }, codici: ['C5'], fonti: ['x'] };
    const r = unisciTreVie(base, mio, nuovo);
    expect(r.nome).toBe('Nome nuovo');
    expect(r.codici).toEqual(['C5']);
    expect(r.accesso).toEqual({ tipo: 'guida', nota: 'scritta da me' });
    expect(r.fonti).toEqual(['x']);
    expect(r.notePersonali).toBe('mie');
    expect(r.stato).toBe('fatto');
  });

  it('senza versione precedente non sovrascrive i valori diversi dai miei', () => {
    const r = unisciTreVie(null, { id: 'a', nome: 'Mio' }, { id: 'a', nome: 'Archivio', zona: 'Z' });
    expect(r.nome).toBe('Mio');
    expect(r.zona).toBe('Z');
  });

  it('i campi personali non arrivano mai dall\'archivio', () => {
    expect(recordDaSentiero({ id: 'a', stato: 'fatto', notePersonali: 'x', nome: 'N' })).toEqual({ id: 'a', nome: 'N' });
    const r = unisciTreVie({}, { id: 'a', stato: 'fatto' }, { id: 'a', stato: 'da_fare' });
    expect(r.stato).toBe('fatto');
  });
});

describe('tracce', () => {
  const g = (x) => ({ type: 'MultiLineString', coordinates: [[[x, 41], [x, 41.01]]] });
  it('non sostituisce mai un mio GPX', () => {
    expect(tracciaDaArchivio({ origine: 'gpx', geojson: g(1) }, { geojson: g(2), dettagli: {} })).toBe(false);
    expect(tracciaDaArchivio(undefined, { geojson: g(2) })).toBe(true);
    expect(tracciaDaArchivio({ geojson: g(1), dettagli: { iniziale: true } }, { geojson: g(2), dettagli: {} })).toBe(true);
  });
});

describe('piano di sincronizzazione', () => {
  it('aggiunge i nuovi, aggiorna i cambiati e lascia stare gli uguali', () => {
    const archivio = {
      app: 'orme-archivio',
      percorsi: [
        { id: 'a', nome: 'A2', traccia: { origine: 'osm', geojson: { type: 'MultiLineString', coordinates: [[[1, 1], [2, 2]]] } } },
        { id: 'b', nome: 'B' },
        { id: 'c', nome: 'C' },
      ],
    };
    const miei = new Map([
      ['a', { id: 'a', nome: 'A', stato: 'fatto' }],
      ['c', { id: 'c', nome: 'C', notePersonali: 'x' }],
    ]);
    const basi = new Map([['a', { id: 'a', nome: 'A' }], ['c', { id: 'c', nome: 'C' }]]);
    const piano = pianoSincronizzazione(archivio, { miei, basi, tracce: new Map() });
    expect(piano.sentieri.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(piano.sentieri.find((s) => s.id === 'a')).toMatchObject({ nome: 'A2', stato: 'fatto' });
    expect(piano.tracce.map((t) => t.sentieroId)).toEqual(['a']);
    expect(piano.tracce[0].dettagli.archivio).toBe(true);
    expect(piano.basi.map((b) => b.id).sort()).toEqual(['a', 'b']);
  });

  it('rifiuta file che non sono l\'archivio', () => {
    expect(() => controllaArchivio({ app: 'altro' })).toThrow();
    expect(() => controllaArchivio({ app: 'orme-archivio', percorsi: [{ id: 'x' }] })).toThrow('senza id o nome');
  });
});
