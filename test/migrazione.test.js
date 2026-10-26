import { describe, it, expect } from 'vitest';
import { giroInPercorso, giriDaConvertire, idPercorsoDaGiro, nomeFileBackupCompleto } from '../src/lib/migrazione.js';

// due sentieri che si toccano: A da (13,41) a (13.01,41), B da (13.01,41) a (13.02,41)
const sentieri = new Map([['a', { id: 'a', nome: 'A' }], ['b', { id: 'b', nome: 'B' }]]);
const tracce = new Map([
  ['a', { sentieroId: 'a', geojson: { type: 'MultiLineString', coordinates: [[[13, 41], [13.01, 41]]] } }],
  ['b', { sentieroId: 'b', geojson: { type: 'MultiLineString', coordinates: [[[13.01, 41], [13.02, 41]]] } }],
]);

describe('i giri diventano percorsi miei', () => {
  const giro = { id: 'g1', nome: 'Il mio giro', notePersonali: 'bello', stato: 'fatto', dataPercorso: '2026-09-01', tappe: [{ sentieroId: 'a' }, { sentieroId: 'b' }] };
  it('il percorso ha il nome, le note e la traccia unita', () => {
    const p = giroInPercorso(giro, sentieri, tracce, '2026-10-26T10:00:00.000Z');
    expect(p).toMatchObject({ id: 'percorso-giro-g1', nome: 'Il mio giro', origine: 'disegnato' });
    expect(p.note).toContain('bello');
    expect(p.note).toContain('Fatto il 2026-09-01');
    expect(p.geojson.coordinates.flat().length).toBeGreaterThanOrEqual(3);
  });
  it('un giro senza nessuna traccia non diventa un percorso; tappe mancanti sono segnalate', () => {
    expect(giroInPercorso({ id: 'g2', nome: 'x', tappe: [{ sentieroId: 'zz' }] }, sentieri, tracce)).toBeNull();
    const parziale = giroInPercorso({ id: 'g3', nome: 'x', tappe: [{ sentieroId: 'a' }, { sentieroId: 'zz' }] }, sentieri, tracce);
    expect(parziale.note).toContain('Mancano 1 tappe');
  });
  it('non si converte due volte', () => {
    expect(giriDaConvertire([giro], sentieri, tracce, new Set([idPercorsoDaGiro(giro)]))).toEqual([]);
    expect(giriDaConvertire([giro], sentieri, tracce)).toHaveLength(1);
  });
  it('file del backup completo col giorno', () => {
    expect(nomeFileBackupCompleto(new Date('2026-10-26T10:00:00Z'))).toBe('orme-backup-completo-2026-10-26.json');
  });
});
