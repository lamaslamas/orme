import { describe, it, expect } from 'vitest';
import { creaBase, proietta, fetta, puntoAllaPos, puntiIniziali, estremiBase, segnapostoVisibile, spostaEstremoBase, vicinoAllaLinea, posSulTratto, tagliaPunti } from '../src/lib/modificaTraccia.js';
import { inverti, normalizzaPunti } from '../src/lib/disegno.js';
import { distanzaKm } from '../src/lib/geo.js';

// una traccia di circa 1,7 km a 40° di latitudine (0,001° di longitudine ≈ 85 m), in due pezzi
const base = creaBase([[[15, 40], [15.01, 40]], [[15.01, 40], [15.02, 40]]]);
const metri = (linea) => linea.reduce((m, p, i) => (i ? m + distanzaKm(linea[i - 1], p) * 1000 : 0), 0);

describe('base', () => {
  it('una linea sola, senza punti ripetuti, con le distanze', () => {
    expect(base.linea).toHaveLength(3);
    expect(Math.round(base.totaleM)).toBe(1704);
  });
  it('proietta un punto sulla traccia', () => {
    const r = proietta(base, [15.005, 40.0004]); // a nord, circa 44 m
    expect(Math.round(r.pos)).toBe(426);
    expect(Math.round(r.dM)).toBe(44);
  });
  it('il punto a una posizione e la fetta in un senso e nell\'altro', () => {
    expect(puntoAllaPos(base, base.totaleM / 2)[0]).toBeCloseTo(15.01, 4);
    const avanti = fetta(base, 200, 1200);
    expect(Math.round(metri(avanti))).toBe(1000);
    const indietro = fetta(base, 1200, 200);
    expect(indietro[0]).toEqual(avanti.at(-1));
    expect(indietro.at(-1)).toEqual(avanti[0]);
  });
});

describe('accorciare: partenza e arrivo lungo la traccia', () => {
  const punti = puntiIniziali(base);
  it('partenza e arrivo sono i due estremi visibili', () => {
    expect(estremiBase(punti)).toEqual({ primo: 0, ultimo: 1, quanti: 2 });
    expect(segnapostoVisibile(punti, 0)).toBe(true);
    expect(segnapostoVisibile([...punti.slice(0, 1), { p: [15.01, 40], libero: false, pos: 853 }, punti[1]], 1)).toBe(false); // un punto in mezzo non si vede
  });
  it('l\'arrivo trascinato si aggancia alla traccia', () => {
    const r = spostaEstremoBase(punti, 1, [15.01, 40.002], base);
    expect(Math.round(r.pos)).toBe(852);
    expect(r.p[1]).toBeCloseTo(40, 5);
  });
  it('non supera l\'altro estremo', () => {
    const r = spostaEstremoBase(punti, 1, [14.99, 40], base); // prima della partenza
    expect(r.pos).toBe(10);
    const s = spostaEstremoBase(punti, 0, [15.03, 40], base);
    expect(Math.round(s.pos)).toBe(Math.round(base.totaleM - 10));
  });
  it('un punto fuori dalla base non è un estremo', () => {
    expect(spostaEstremoBase([...punti, { p: [15.03, 40], libero: false }], 2, [15.03, 40], base)).toBeNull();
  });
});

describe('tagliare', () => {
  const punti = puntiIniziali(base);
  const tratti = [{ coordinate: fetta(base, 0, base.totaleM) }];
  it('trova il punto toccato sul tratto', () => {
    const v = vicinoAllaLinea(tratti, [15.005, 40.0001], 30);
    expect(v.k).toBe(0);
    expect(Math.round(v.daInizioM)).toBe(426);
    expect(vicinoAllaLinea(tratti, [15.005, 40.01], 30)).toBeNull(); // troppo lontano
  });
  it('tiene la parte prima o la parte dopo', () => {
    const c = { p: [15.01, 40], pos: posSulTratto(punti[0], punti[1], 853) };
    expect(c.pos).toBe(853);
    const prima = tagliaPunti(punti, 0, c, 'prima');
    expect(prima.map((x) => Math.round(x.pos))).toEqual([0, 853]);
    const dopo = tagliaPunti(punti, 0, c, 'dopo');
    expect(dopo.map((x) => Math.round(x.pos))).toEqual([853, Math.round(base.totaleM)]);
    expect(dopo[0].libero).toBe(false);
  });
  it('sul tratto calcolato (senza base) il nuovo punto non ha posizione', () => {
    expect(posSulTratto({ p: [0, 0] }, { p: [1, 1] }, 100)).toBeNull();
  });
  it('al contrario la posizione scende', () => {
    expect(posSulTratto({ pos: 1000 }, { pos: 0 }, 100)).toBe(900);
  });
});

describe('verso e salvataggio dei punti', () => {
  it('invertire e rinormalizzare conserva la posizione', () => {
    const i = inverti(puntiIniziali(base));
    expect(i.map((x) => Math.round(x.pos))).toEqual([Math.round(base.totaleM), 0]);
    expect(normalizzaPunti(i).map((x) => Math.round(x.pos))).toEqual([Math.round(base.totaleM), 0]);
    const e = spostaEstremoBase(i, 1, [15.0005, 40], base); // l'arrivo, ora vicino all'inizio della traccia
    expect(Math.round(e.pos)).toBe(43);
  });
  it('i punti senza posizione restano come prima', () => {
    expect(normalizzaPunti([[1, 2], { p: [3, 4], libero: true }])).toEqual([{ p: [1, 2], libero: false }, { p: [3, 4], libero: true }]);
  });
});
