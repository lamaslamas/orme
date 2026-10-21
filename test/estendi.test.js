// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  trattiDaPezzi, invertiTratti, trovaContatti, opzioniAggiunta, candidatiEstendi, raggruppaParti, nomeProposto,
  stimaDislivello, totali, kmDeiTratti, tagliaTratti, geojsonDaTratti, etichettaSentiero,
} from '../src/lib/estendi.js';

const L = (...pt) => pt; // linea [[lon, lat]…]
// 0,001° di longitudine a 40° di latitudine ≈ 85 m
const base = trattiDaPezzi([L([15, 40], [15.02, 40])], 'base'); // circa 1,7 km
const km = (x) => Math.round(x * 10) / 10;

describe('contatti', () => {
  it('un sentiero che parte dall\'arrivo: un solo ramo, il percorso resta intero', () => {
    const c = trovaContatti(base, [L([15.0205, 40.0002], [15.04, 40])], 'a');
    expect(c).toHaveLength(1);
    expect(c[0].rami.map((r) => r.lato)).toEqual(['dopo']);
    const o = opzioniAggiunta(base, c[0]);
    expect(o.map((x) => x.tieni)).toEqual(['inizio']);
    expect(km(kmDeiTratti(o[0].tratti))).toBe(3.4);
    expect(o[0].tagliatiKm).toBeLessThan(0.06);
  });
  it('estremo entro 50 m sì, oltre no', () => {
    expect(trovaContatti(base, [L([15.0204, 40], [15.04, 40])], 'a')).toHaveLength(1); // 34 m
    expect(trovaContatti(base, [L([15.0215, 40], [15.04, 40])], 'a')).toHaveLength(0); // 128 m
  });
  it('un incrocio a metà: due lati del ramo e due del percorso', () => {
    const c = trovaContatti(base, [L([15.01, 39.99], [15.01, 40.01])], 'b');
    expect(c).toHaveLength(1);
    expect(c[0].rami.map((r) => r.lato).sort()).toEqual(['dopo', 'prima']);
    const o = opzioniAggiunta(base, c[0]);
    expect(o).toHaveLength(4);
    const dopoInizio = o.find((x) => x.id === 'dopo-inizio');
    // si tiene la partenza fino all'incrocio (0,85 km) e si aggiunge il ramo nord (1,1 km), circa 2 km in tutto; la coda di 0,85 km si taglia
    expect(km(kmDeiTratti(dopoInizio.tratti))).toBe(2);
    expect(km(dopoInizio.tagliatiKm)).toBe(0.9);
  });
  it('un sentiero che parte da un punto del percorso: T', () => {
    const c = trovaContatti(base, [L([15.01, 40.0003], [15.01, 40.01])], 't');
    expect(c).toHaveLength(1);
    expect(c[0].rami.map((r) => r.lato)).toEqual(['dopo']);
  });
  it('sovrapposto per un pezzo: si esce dai due capi dell\'incontro', () => {
    const c = trovaContatti(base, [L([14.99, 40.002], [15.005, 40.0001], [15.015, 40.0001], [15.03, 40.002])], 's');
    expect(c.length).toBe(2);
    expect(c.map((x) => x.rami[0].lato).sort()).toEqual(['dopo', 'prima']);
  });
  it('lontano: nessun contatto', () => {
    expect(trovaContatti(base, [L([15, 40.02], [15.02, 40.02])], 'f')).toEqual([]);
  });
});

describe('verso', () => {
  it('il ramo "prima" va al contrario del verso consigliato', () => {
    const c = trovaContatti(base, [L([15.01, 39.99], [15.01, 40.01])], 'b')[0];
    expect(c.rami.find((r) => r.lato === 'dopo').tratti.every((t) => !t.contro)).toBe(true);
    expect(c.rami.find((r) => r.lato === 'prima').tratti.every((t) => t.contro)).toBe(true);
  });
  it('girando i tratti si inverte anche «contro»', () => {
    const r = invertiTratti([{ parte: 'x', contro: false, linea: [[0, 0], [1, 1]] }, { parte: 'y', contro: true, linea: [[1, 1], [2, 2]] }]);
    expect(r.map((t) => [t.parte, t.contro])).toEqual([['y', false], ['x', true]]);
    expect(r[0].linea[0]).toEqual([2, 2]);
  });
  it('mantenendo la parte verso l\'arrivo il ramo è girato: tratti continui', () => {
    const c = trovaContatti(base, [L([15.01, 39.99], [15.01, 40.01])], 'b')[0];
    const o = opzioniAggiunta(base, c).find((x) => x.id === 'dopo-fine');
    const linee = o.tratti.map((t) => t.linea);
    for (let i = 1; i < linee.length; i++) expect(Math.abs(linee[i][0][0] - linee[i - 1].at(-1)[0])).toBeLessThan(0.0002);
    expect(raggruppaParti(o.tratti).map((p) => [p.parte, p.contro])).toEqual([['b', true], ['base', false]]);
  });
});

describe('taglio e descrizione', () => {
  it('taglia i tratti in due', () => {
    const t = tagliaTratti(base, { i: 0, j: 0, t: 0.5 });
    expect(km(kmDeiTratti(t.prima))).toBe(0.9);
    expect(km(kmDeiTratti(t.dopo))).toBe(0.9);
  });
  it('nome proposto con i codici, e il nome se mancano', () => {
    const parti = [{ parte: 'a' }, { parte: 'b' }, { parte: 'b' }];
    expect(nomeProposto(parti, { a: '713', b: '709' })).toBe('713 + 709');
    expect(etichettaSentiero({ codici: ['713'], nome: 'x' })).toBe('713');
    expect(etichettaSentiero({ nome: 'Sentiero del lago' })).toBe('Sentiero del lago');
  });
  it('dislivello in proporzione, scambiato al contrario', () => {
    const rif = { a: { km: 4, salita: 400, discesa: 100 }, b: { km: 2, salita: 100, discesa: 300 } };
    expect(stimaDislivello([{ parte: 'a', contro: false, km: 2 }, { parte: 'b', contro: true, km: 2 }], rif)).toEqual({ salita: 500, discesa: 150 });
    expect(stimaDislivello([{ parte: 'z', contro: false, km: 1 }], rif)).toBeNull();
  });
  it('totali con tempo', () => {
    const t = totali(base, { salita: 300, discesa: 100 });
    expect(km(t.km)).toBe(1.7);
    expect(t.durataMin).toBeGreaterThan(20);
    expect(geojsonDaTratti(base).coordinates).toHaveLength(1);
  });
});

describe('candidati', () => {
  const s = (id, extra = {}) => ({ id, nome: id, ...extra });
  const traccia = (linee) => ({ origine: 'osm', geojson: { type: 'MultiLineString', coordinates: linee } });
  const tracce = new Map([
    ['vicino', traccia([[[15.0205, 40.0002], [15.04, 40]]])],
    ['lontano', traccia([[[15, 40.05], [15.02, 40.05]]])],
    ['rete', traccia([[[15.0205, 40.0002], [15.04, 40]]])],
    ['usato', traccia([[[15.0205, 40.0002], [15.04, 40]]])],
    // due pezzi separati da oltre 500 m: traccia incompleta, non si propone
    ['buco', traccia([[[15.0205, 40.0002], [15.025, 40]], [[15.04, 40], [15.05, 40]]])],
  ]);
  const elenco = [s('vicino'), s('lontano'), s('rete', { tipoPercorso: 'rete_sentieri' }), s('usato'), s('buco')];
  it('solo i collegati, senza reti, incompleti e già usati', () => {
    const r = candidatiEstendi(base, elenco, tracce, { esclusi: new Set(['usato']) });
    expect(r.map((x) => x.sentiero.id)).toEqual(['vicino']);
    expect(r[0].contatti.length).toBeGreaterThan(0);
  });
});
