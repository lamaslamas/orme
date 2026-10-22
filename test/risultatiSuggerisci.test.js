import { describe, it, expect } from 'vitest';
import { specieDelPercorso, comuniATutti, motiviDistintivi, eInverso, unisciInversi } from '../src/lib/risultatiSuggerisci.js';

describe('specie lungo il percorso', () => {
  const s = { faunaInat: { specie: [
    { animale: 'cervo', livello: 'percorso', osservazioni: 5 },
    { animale: 'lupo', livello: 'zona', osservazioni: 90 },
    { animale: 'camoscio', livello: 'percorso', osservazioni: 12 },
  ] } };
  it('solo quelle sul percorso, le più viste prima; quelle del parco no', () => {
    expect(specieDelPercorso(s)).toEqual(['camoscio', 'cervo']);
  });
  it('il tratto con più fauna conta', () => {
    expect(specieDelPercorso(s, { migliore: { specie: ['nibbio_reale', 'cervo'] } })).toEqual(['nibbio_reale', 'cervo', 'camoscio']);
    expect(specieDelPercorso({}, null)).toEqual([]);
  });
});

describe('quello che vale per tutti', () => {
  it('comuni a tutte le liste (con un solo risultato niente)', () => {
    expect(comuniATutti([['a', 'b'], ['b', 'c'], ['b', 'a']])).toEqual(['b']);
    expect(comuniATutti([['a', 'b']])).toEqual([]);
    expect(comuniATutti([])).toEqual([]);
  });
  it('i motivi del meteo: i comuni una volta sola, nelle card solo quelli che cambiano', () => {
    const g = (...fattori) => ({ giudizio: 'attenzione', fattori: fattori.map(([chiave, livello, testo]) => ({ chiave, livello, testo })) });
    const r = motiviDistintivi([
      g(['vento', 'attenzione', 'raffiche 73'], ['fango', 'attenzione', 'fango']),
      g(['vento', 'attenzione', 'raffiche 75']),
      g(['vento', 'attenzione', 'raffiche 70'], ['panorama', 'info', 'cielo sereno']),
    ]);
    expect(r.comuni.map((m) => m.chiave)).toEqual(['vento']);
    expect(r.perVoce.map((l) => l.map((m) => m.chiave))).toEqual([['fango'], [], ['panorama']]);
  });
  it('senza meteo per qualcuno: niente comuni inventati', () => {
    expect(motiviDistintivi([null, { fattori: [{ chiave: 'vento', livello: 'attenzione', testo: 'x' }] }]).comuni).toEqual([]);
  });
});

describe('un sentiero e il suo inverso', () => {
  const a = { codici: ['536'], km: 9, inizio: [13.8, 41.7], fine: [13.9, 41.75] };
  const b = { codici: ['536A'], km: 9.1, inizio: [13.9005, 41.7502], fine: [13.8004, 41.7001] };
  it('stesso codice a meno della lettera, lunghezza uguale, estremi scambiati', () => {
    expect(eInverso(a, b)).toBe(true);
  });
  it('non lo sono: estremi no, lunghezza diversa, codice diverso o uguale', () => {
    expect(eInverso(a, { ...b, inizio: [14.2, 41.7] })).toBe(false);
    expect(eInverso(a, { ...b, km: 14 })).toBe(false);
    expect(eInverso(a, { ...b, codici: ['537A'] })).toBe(false);
    expect(eInverso(a, { ...a })).toBe(false);
  });
  it('anelli al contrario: stessa partenza', () => {
    const r1 = { codici: ['12'], km: 7, inizio: [13.8, 41.7], fine: [13.8001, 41.7001] };
    const r2 = { codici: ['12A'], km: 7, inizio: [13.8002, 41.7], fine: [13.8, 41.7002] };
    expect(eInverso(r1, r2)).toBe(true);
  });
  it('resta il primo della classifica, con «anche al contrario»', () => {
    const voci = [{ id: 'x', e: a }, { id: 'altro', e: { codici: ['9'], km: 3, inizio: [10, 40], fine: [10.1, 40] } }, { id: 'y', e: b }];
    const r = unisciInversi(voci, (v) => v.e);
    expect(r.map((v) => v.id)).toEqual(['x', 'altro']);
    expect(r[0].ancheAlContrario).toBe('536A');
  });
  it('il migliore è quello che arriva prima, anche se è l\'inverso', () => {
    const r = unisciInversi([{ id: 'y', e: b }, { id: 'x', e: a }], (v) => v.e);
    expect(r.map((v) => v.id)).toEqual(['y']);
    expect(r[0].ancheAlContrario).toBe('536');
  });
});

import { separaLuce, testoLuce } from '../src/lib/risultatiSuggerisci.js';

describe('la luce non è meteo', () => {
  const luce = (ultima, durata = 420) => ({ chiave: 'luce', livello: 'sconsigliato', testo: 'troppo lungo', tramonto: '18:05', ultimaPartenzaMin: ultima, durataMin: durata });
  const g = (...fattori) => ({ fattori });
  it('la luce comune a tutti esce dai motivi del meteo', () => {
    const comuni = [{ chiave: 'luce', livello: 'sconsigliato' }, { chiave: 'vento', livello: 'attenzione', testo: 'raffiche 70' }];
    const r = separaLuce(comuni, [g(luce(10 * 60 + 35)), g(luce(9 * 60 + 5))], { oraPartenza: '12:00' });
    expect(r.meteo.map((m) => m.chiave)).toEqual(['vento']);
    expect(r.luce).toMatchObject({ tramonto: '18:05', ultimaPartenza: '10:35', oraPartenza: '12:00', proposta: '09:00' });
  });
  it('la riga: parti entro le 10:35, con la partenza scelta', () => {
    expect(testoLuce({ tramonto: '18:05', ultimaPartenza: '10:35', oraPartenza: '12:00', proposta: '09:00' })).toBe('Partendo alle 12:00 una giornata finisce dopo il tramonto (18:05): parti entro le 10:35');
  });
  it('se le 9:00 sono troppo tardi si propone l\'ora giusta; se nemmeno le 6:00 bastano, niente pulsante', () => {
    const r = separaLuce([{ chiave: 'luce', livello: 'sconsigliato' }], [g(luce(8 * 60 + 40))], { oraPartenza: '12:00' });
    expect(r.luce.proposta).toBe('08:40');
    const nessuno = separaLuce([{ chiave: 'luce', livello: 'sconsigliato' }], [g(luce(5 * 60))], { oraPartenza: '12:00' });
    expect(nessuno.luce.proposta).toBeNull();
    expect(testoLuce(nessuno.luce)).toContain('nessun percorso si fa con la luce di quel giorno');
  });
  it('senza luce tra i motivi comuni: niente riga', () => {
    const r = separaLuce([{ chiave: 'vento', livello: 'attenzione' }], [g()], {});
    expect(r.luce).toBeNull();
    expect(r.meteo).toHaveLength(1);
    expect(testoLuce(null)).toBe('');
  });
});
