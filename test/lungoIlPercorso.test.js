import { describe, it, expect } from 'vitest';
import { campionaPezzi, percorsoCoperto, riquadroDeiPezzi } from '../src/lib/lungoIlPercorso.js';

// circa 2,2 km verso est, a 41,8° N
const pezzi = [[[13.8, 41.8], [13.81, 41.8], [13.82, 41.8], [13.827, 41.8]]];

describe('copertura dei punti per un percorso di Pianifica', () => {
  it('campiona la traccia ogni 500 m circa, primo e ultimo punto compresi', () => {
    const c = campionaPezzi(pezzi);
    expect(c[0]).toEqual([13.8, 41.8]);
    expect(c.at(-1)).toEqual([13.827, 41.8]);
  });

  it('coperto solo se tutto il percorso è dentro le zone (confine o riquadro)', () => {
    const quadrato = [[[13.7, 41.7], [13.9, 41.7], [13.9, 41.9], [13.7, 41.9], [13.7, 41.7]]];
    expect(percorsoCoperto(pezzi, [{ anelli: quadrato }])).toBe(true);
    expect(percorsoCoperto(pezzi, [{ bbox: [41.7, 13.7, 41.9, 13.815] }])).toBe(false); // esce a est
    expect(percorsoCoperto(pezzi, [{ bbox: [41.7, 13.7, 41.9, 13.815] }, { bbox: [41.7, 13.81, 41.9, 13.9] }])).toBe(true);
    expect(percorsoCoperto(pezzi, [])).toBe(false);
  });

  it('riquadro della traccia con un margine di 1 km', () => {
    const [s, o, n, e] = riquadroDeiPezzi(pezzi);
    expect(s).toBeCloseTo(41.791, 3);
    expect(n).toBeCloseTo(41.809, 3);
    expect(o).toBeLessThan(13.8);
    expect(e).toBeGreaterThan(13.827);
    expect(riquadroDeiPezzi([])).toBeNull();
  });
});

import { kmLungoLaTraccia, lunghezzaDeiPezzi, trattoPiuLungoSenza, km1 } from '../src/lib/lungoIlPercorso.js';
describe('punti lungo la traccia: al km X', () => {
  // andata verso est, poi verso nord
  const giro = [[[13.8, 41.8], [13.82, 41.8]], [[13.82, 41.8], [13.82, 41.82]]];
  it('il km si conta nell\'ordine di percorrenza, anche tra pezzi diversi', () => {
    const tot = lunghezzaDeiPezzi(giro);
    expect(tot).toBeCloseTo(1.66 + 2.22, 1);
    expect(kmLungoLaTraccia([13.81, 41.8005], giro)).toBeCloseTo(0.83, 1); // metà del primo pezzo
    expect(kmLungoLaTraccia([13.8205, 41.81], giro)).toBeCloseTo(1.66 + 1.11, 1); // metà del secondo
  });
  it('tratto più lungo senza punti, partenza e arrivo compresi', () => {
    expect(trattoPiuLungoSenza([2, 9], 12)).toEqual({ da: 2, a: 9, km: 7 });
    expect(trattoPiuLungoSenza([], 5)).toEqual({ da: 0, a: 5, km: 5 });
    expect(km1(12.44)).toBe('12,4');
  });
});

import { profiloTempi, finiGiornata, rifugiPerLaNotte } from '../src/lib/lungoIlPercorso.js';
import { stimaDurataMin } from '../src/lib/durata.js';
describe('percorsi su più giorni', () => {
  // 20 km circa verso est, in piano e poi in salita di 1200 m
  const n = 41;
  const linea = Array.from({ length: n }, (_, i) => [13.6 + i * 0.006, 41.8, i < 20 ? 1000 : 1000 + (i - 20) * 60]);
  const pezzi = [linea];

  it('con le quote: tempi progressivi CAI, l\'ultimo uguale alla durata della scheda', () => {
    const s = profiloTempi(pezzi);
    expect(s.conQuote).toBe(true);
    expect(Math.round(s.min.at(-1))).toBeCloseTo(stimaDurataMin(s.km.at(-1), { salita: 1200, discesa: 0 }), -1);
    // la seconda metà (in salita) è più lenta della prima
    expect(s.min[40] - s.min[20]).toBeGreaterThan(s.min[20] - s.min[0]);
  });

  it('senza quote: tempo proporzionale ai km', () => {
    const s = profiloTempi([linea.map(([x, y]) => [x, y])]);
    expect(s.conQuote).toBe(false);
    expect(s.min.at(-1)).toBeCloseTo((s.km.at(-1) / 4) * 60, 5);
  });

  it('fine di ogni giornata, prima con le quote che senza', () => {
    const con = finiGiornata(profiloTempi(pezzi), 4);
    const senza = finiGiornata(profiloTempi([linea.map(([x, y]) => [x, y])]), 4);
    expect(con.length).toBeGreaterThanOrEqual(1);
    expect(con[0].giorno).toBe(1);
    expect(con[0].km).toBeGreaterThan(10); // le prime 4 ore sono in piano: ~16 km
    expect(senza[0].km).toBeCloseTo(16, 0);
    expect(con.at(-1).km).toBeLessThan(profiloTempi(pezzi).km.at(-1));
  });

  it('rifugi vicino alla fine della giornata, con la distanza dalla traccia', () => {
    const fine = { km: 10, punto: [13.6 + 0.12, 41.8] };
    const punti = [
      { id: 'a', tipo: 'rifugio', lon: 13.72, lat: 41.803 }, // ~330 m a nord, al km 10
      { id: 'b', tipo: 'bivacco', lon: 13.75, lat: 41.8 }, // sul percorso, al km 12,5
      { id: 'c', tipo: 'rifugio', lon: 13.72, lat: 41.83 }, // 3,3 km dalla traccia
      { id: 'd', tipo: 'rifugio', lon: 13.62, lat: 41.8 }, // al km 1,7: troppo indietro
    ];
    const r = rifugiPerLaNotte(punti, pezzi, fine);
    expect(r.map((p) => p.id)).toEqual(['a', 'b']);
    expect(r[0].distanzaM).toBeGreaterThan(300);
    expect(r[0].distanzaM).toBeLessThan(360);
    expect(r[1].distanzaM).toBe(0);
  });
});

import { misureDeiPezzi } from '../src/lib/lungoIlPercorso.js';
import { misureSentiero } from '../src/lib/riassunto.js';
import { improntaTraccia } from '../src/lib/panorama.js';
describe('un solo calcolo della durata', () => {
  // saliscendi irregolare su due pezzi, con oscillazioni sotto soglia
  const quota = (i) => 900 + Math.round(300 * Math.sin(i / 5)) + (i % 3) * 4;
  const pezzi = [
    Array.from({ length: 30 }, (_, i) => [13.6 + i * 0.004, 41.8, quota(i)]),
    Array.from({ length: 30 }, (_, i) => [13.72 + i * 0.004, 41.8 + i * 0.001, quota(i + 30)]),
  ];
  it('Pianifica: la durata in alto è uguale all\'arrivo di "Su più giorni"', () => {
    expect(Math.round(profiloTempi(pezzi).min.at(-1))).toBe(misureDeiPezzi(pezzi).durataMin);
    const senza = pezzi.map((l) => l.map(([x, y]) => [x, y]));
    expect(misureDeiPezzi(senza).conQuote).toBe(false);
    expect(Math.round(profiloTempi(senza).min.at(-1))).toBe(misureDeiPezzi(senza).durataMin);
  });
  it('scheda dei sentieri: la durata usa le quote del profilo calcolato, se è di questa traccia', () => {
    const geojson = { type: 'MultiLineString', coordinates: pezzi.map((l) => l.map(([x, y]) => [x, y])) };
    const impronta = improntaTraccia(geojson).split('-')[1];
    const conProfilo = misureSentiero({ quote: { impronta, salita: 800, discesa: 600 } }, { geojson });
    const senzaProfilo = misureSentiero({}, { geojson });
    expect(conProfilo.durataMin).toBe(stimaDurataMin(conProfilo.km, { salita: 800, discesa: 600 }));
    expect(conProfilo.durataMin).toBeGreaterThan(senzaProfilo.durataMin);
    expect(misureSentiero({ quote: { impronta: 'altra', salita: 800, discesa: 600 } }, { geojson }).durataMin).toBe(senzaProfilo.durataMin);
  });
});
