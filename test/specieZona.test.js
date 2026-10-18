import { describe, it, expect } from 'vitest';
import { specieDellaZonaPerOsservatori, puntiSpecieZona, nomeItalianoDaRisposta } from '../src/lib/specieZona.js';

const o = (sci, persona, data, extra = {}) => ({ nomeScientifico: sci, specie: sci, animale: null, data, osservatore: persona, lat: 40, lon: 18, sfumata: false, ...extra });
const traccia = { type: 'MultiLineString', coordinates: [[[18, 40], [18.02, 40]]] };

describe('specie più segnalate nella zona', () => {
  it('ordina per osservatori diversi nel mese, non per osservazioni', () => {
    const oss = [
      ...['a', 'a', 'a', 'a', 'a'].map((p) => o('Egretta garzetta', p, '2025-10-02')), // 5 osservazioni, 1 persona
      ...['b', 'c', 'd'].map((p) => o('Ardea cinerea', p, '2025-10-05')),
      ...['b', 'c', 'd', 'e'].map((p) => o('Hystrix cristata', p, '2025-10-09')),
    ];
    const r = specieDellaZonaPerOsservatori(oss, 10);
    expect(r.map((x) => x.chiave)).toEqual(['Hystrix cristata', 'Ardea cinerea']); // la garzetta ha una sola persona: fuori
    expect(r[0]).toMatchObject({ persone: 4, osservazioni: 4, ultimoAnno: 2025 });
  });
  it('conta solo il mese scelto e quelli accanto, e toglie i domestici', () => {
    const oss = [...['a', 'b', 'c'].map((p) => o('Ardea cinerea', p, '2025-03-05')), ...['a', 'b', 'c'].map((p) => o('Canis familiaris', p, '2025-10-05'))];
    expect(specieDellaZonaPerOsservatori(oss, 10)).toEqual([]);
    expect(specieDellaZonaPerOsservatori(oss, 4, { raggioMesi: 1 }).map((x) => x.chiave)).toEqual(['Ardea cinerea']);
  });
  it('una specie fissa di Orme prende il nome italiano', () => {
    const oss = ['a', 'b', 'c'].map((p) => o('Cervus elaphus', p, '2025-10-05', { animale: 'cervo' }));
    expect(specieDellaZonaPerOsservatori(oss, 10)[0]).toMatchObject({ nome: 'Cervo', animale: 'cervo' });
  });
});

describe('percorso e specie della zona', () => {
  const vicine = (sci, n, data) => Array.from({ length: n }, (_, i) => o(sci, `p${i}`, data, { lat: 40.0005 }));
  it('punti con gli stessi criteri delle specie fisse: osservatori diversi, doppio lungo il percorso', () => {
    const r = puntiSpecieZona(vicine('Egretta garzetta', 6, '2025-10-02'), traccia, 'Egretta garzetta', 10, { nome: 'Garzetta' });
    expect(r).toMatchObject({ dove: 'percorso', persone: 6, nomeSpecie: 'Garzetta', nome: 'segnalato' });
    expect(r.punti).toBe(7.2); // 6 osservazioni × 0,6 × 2
  });
  it('fuori stagione null; ma con più mesi vicini sì', () => {
    const oss = vicine('Egretta garzetta', 4, '2025-06-02');
    expect(puntiSpecieZona(oss, traccia, 'Egretta garzetta', 10)).toBeNull();
    expect(puntiSpecieZona(oss, traccia, 'Egretta garzetta', 10, { raggioMesi: 4 })).not.toBeNull();
  });
  it('lontano più di 5 km: niente', () => {
    const lontane = Array.from({ length: 4 }, (_, i) => o('Egretta garzetta', `p${i}`, '2025-10-02', { lat: 40.2 }));
    expect(puntiSpecieZona(lontane, traccia, 'Egretta garzetta', 10)).toBeNull();
  });
});

describe('nomi italiani', () => {
  it('prende il nome comune solo se la specie è quella cercata', () => {
    const json = { results: [{ name: 'Egretta garzetta', preferred_common_name: 'garzetta' }, { name: 'Egretta thula', preferred_common_name: 'Snowy Egret' }] };
    expect(nomeItalianoDaRisposta(json, 'Egretta garzetta')).toBe('Garzetta');
    expect(nomeItalianoDaRisposta(json, 'Ardea alba')).toBeNull();
  });
});
