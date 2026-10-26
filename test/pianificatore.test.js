import { describe, it, expect } from 'vitest';
import { nuovaTappa, tappeDaPunti, etichetta, inserisciDopo, sposta, togli, riordina, sostituisci, creaStoria, trattoPiuVicino, classeFondo, fondoDaTerreno, preferenzaPer, chiaveTratto } from '../src/lib/pianificatore.js';

const t = (lon, lat) => nuovaTappa([lon, lat]);
const nomi = (l) => l.map((x) => x.p.join(','));

describe('pianificatore: le tappe', () => {
  it('etichette A, 1, 2… B', () => {
    expect([0, 1, 2, 3].map((i) => etichetta(i, 4))).toEqual(['A', '1', '2', 'B']);
    expect(etichetta(0, 1)).toBe('A');
  });
  it('trascinare un tratto crea una tappa nel punto giusto, senza toccare le altre', () => {
    const l = [t(13, 41), t(13.1, 41.1), t(13.2, 41.2)];
    const r = inserisciDopo(l, 0, [13.05, 41.05]);
    expect(r).toHaveLength(4);
    expect(nomi(r)).toEqual(['13,41', '13.05,41.05', '13.1,41.1', '13.2,41.2']);
    expect(r[2].id).toBe(l[1].id); // le altre tappe restano le stesse
  });
  it('spostare toglie il nome (si ritrova), eliminare e riordinare tengono la partenza «normale»', () => {
    const l = [{ ...t(13, 41), nome: 'Opi' }, { ...t(13.1, 41.1), libero: true }, t(13.2, 41.2)];
    expect(sposta(l, 0, [13.5, 41.5])[0]).toMatchObject({ p: [13.5, 41.5], nome: null });
    expect(togli(l, 0)[0].libero).toBe(false);
    expect(riordina(l, 1, -1)[0].libero).toBe(false);
    expect(nomi(riordina(l, 2, -1))).toEqual(['13,41', '13.2,41.2', '13.1,41.1']);
    expect(riordina(l, 0, -1)).toBe(l); // già in cima
    expect(sostituisci(l, 2, [14, 42], 'Scanno')[2]).toMatchObject({ p: [14, 42], nome: 'Scanno' });
  });
  it('i punti salvati diventano tappe', () => {
    const r = tappeDaPunti([{ p: [1, 2], libero: true }, { p: [3, 4], libero: true }]);
    expect(r.map((x) => x.libero)).toEqual([false, true]);
    expect(new Set(r.map((x) => x.id)).size).toBe(2);
  });
});

describe('pianificatore: Annulla e Ripeti', () => {
  it('si torna indietro e avanti; una scelta nuova cancella il «ripeti»', () => {
    const s = creaStoria([]);
    const a = [t(1, 1)];
    const b = [...a, t(2, 2)];
    s.vai(a);
    s.vai(b);
    expect(s.puoAnnullare()).toBe(true);
    expect(s.annulla()).toBe(a);
    expect(s.puoRipetere()).toBe(true);
    expect(s.ripeti()).toBe(b);
    s.annulla();
    s.vai([t(9, 9)]);
    expect(s.puoRipetere()).toBe(false);
    expect(s.annulla()).toBe(a);
    expect(creaStoria([]).annulla()).toEqual([]);
  });
});

describe('pianificatore: tratto più vicino e fondo', () => {
  it('il tratto da cui parte il trascinamento', () => {
    const tratti = [[[13, 41], [13.1, 41]], [[13.1, 41], [13.1, 41.1]]];
    expect(trattoPiuVicino(tratti, [13.05, 41.0005]).indice).toBe(0);
    expect(trattoPiuVicino(tratti, [13.1005, 41.05]).indice).toBe(1);
    expect(trattoPiuVicino([], [13, 41]).indice).toBe(-1);
  });
  it('classi del fondo dai tag OSM', () => {
    expect(classeFondo({ highway: 'path', surface: 'ground' })).toBe('sentiero');
    expect(classeFondo({ highway: 'track', surface: 'gravel' })).toBe('sterrata');
    expect(classeFondo({ highway: 'track' })).toBe('sterrata');
    expect(classeFondo({ highway: 'residential' })).toBe('asfalto');
    expect(classeFondo({ highway: 'track', surface: 'asphalt' })).toBe('asfalto');
    expect(classeFondo({ highway: 'footway', surface: 'paving_stones' })).toBe('asfalto');
    expect(classeFondo({})).toBe('altro');
  });
  it('le percentuali fanno 100', () => {
    const f = fondoDaTerreno([{ daM: 0, aM: 620, tag: { highway: 'path' } }, { daM: 620, aM: 820, tag: { highway: 'track' } }, { daM: 820, aM: 1000, tag: { highway: 'residential' } }]);
    expect(f.percentuali).toEqual({ sentiero: 62, sterrata: 20, asfalto: 18, altro: 0 });
    const tre = fondoDaTerreno([1, 2, 3].map((n) => ({ daM: (n - 1) * 100, aM: n * 100, tag: { highway: n === 1 ? 'path' : n === 2 ? 'track' : 'residential' } })));
    expect(Object.values(tre.percentuali).reduce((a, b) => a + b, 0)).toBe(100);
    expect(fondoDaTerreno([]).percentuali).toBeNull();
  });
  it('preferenze: solo Trekking; la chiave del tratto cambia con le opzioni', () => {
    expect(preferenzaPer('sentieri', 'trekking')).toBe(1.5);
    expect(preferenzaPer('misto', 'trekking')).toBeNull();
    expect(preferenzaPer('sentieri', 'mtb')).toBeNull();
    const a = t(1, 1);
    const b = t(2, 2);
    expect(chiaveTratto(a, b, false, 'trekking:1.5')).not.toBe(chiaveTratto(a, b, false, 'mtb'));
  });
});
