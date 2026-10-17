import { describe, it, expect } from 'vitest';
import { misureAR, misureScelte, eAnelloPezzi, pezziScelti, orariGiornata, oraDaMinuti, minutiDaOra, notaFonte } from '../src/lib/andataRitorno.js';

describe('andata e ritorno', () => {
  it('tempi CAI nei due sensi: al ritorno salita e discesa si scambiano', () => {
    // 5 km, +420 −30. Andata: piano 1,25 h, dislivello 420/300 + 30/500 = 1,46 h → 1,46 + 1,25/2 = 125 min.
    // Ritorno: dislivello 30/300 + 420/500 = 0,94 h → 1,25 + 0,94/2 = 103 min
    const ar = misureAR({ km: 5, salita: 420, discesa: 30 });
    expect(ar.andata).toEqual({ km: 5, salita: 420, discesa: 30, durataMin: 125 });
    expect(ar.ritorno).toEqual({ km: 5, salita: 30, discesa: 420, durataMin: 103 });
    expect(ar.totale).toEqual({ km: 10, salita: 450, discesa: 450, durataMin: 228 });
  });
  it('senza quote: stesso tempo nei due sensi (solo i km)', () => {
    const ar = misureAR({ km: 8, salita: null, discesa: null });
    expect(ar.andata.durataMin).toBe(120);
    expect(ar.ritorno.durataMin).toBe(120);
    expect(ar.totale.salita).toBeNull();
  });
  it('anello: niente ritorno; in alto si mostra il giro', () => {
    const ar = misureAR({ km: 9.2, salita: 610, discesa: 610 }, { anello: true });
    expect(ar.ritorno).toBeNull();
    expect(misureScelte(ar, 'ar')).toBe(ar.andata);
  });
  it('in alto i numeri seguono la scelta', () => {
    const ar = misureAR({ km: 5, salita: 420, discesa: 30 });
    expect(misureScelte(ar, 'andata').km).toBe(5);
    expect(misureScelte(ar, 'ar').km).toBe(10);
  });
  it('riconosce gli anelli (partenza e arrivo entro 300 m)', () => {
    expect(eAnelloPezzi([[[13.8, 41.8], [13.81, 41.81], [13.8001, 41.8001]]])).toBe(true);
    expect(eAnelloPezzi([[[13.8, 41.8], [13.85, 41.85]]])).toBe(false);
  });
  it('nuova regola: roundtrip=yes, oppure estremi a meno di 1 km o del 5% della lunghezza', () => {
    // un anello di ~30 km aperto di 600 m: prima (300 m) lineare, ora anello
    const R = 0.22; // gradi: ~24 km di giro
    const giro = Array.from({ length: 73 }, (_, k) => [13.8 + R * Math.cos((k / 72) * 2 * Math.PI * 0.99), 41.8 + R * Math.sin((k / 72) * 2 * Math.PI * 0.99)]);
    expect(eAnelloPezzi([giro])).toBe(true);
    // giro lungo ~170 km: il 5% sono ~8 km; aperto di 1,7 km è un anello, di 15 km no
    const aperto = (gradi) => [[[13.0, 41.0], [13.0, 41.4], [13.5, 41.4], [13.5, 41.0], [13.0 + gradi, 41.0]]];
    expect(eAnelloPezzi(aperto(0.02))).toBe(true);
    expect(eAnelloPezzi(aperto(0.2))).toBe(false);
    expect(eAnelloPezzi([[[13.0, 41.0], [13.1, 41.0], [13.2, 41.0]]])).toBe(false); // lineare
    expect(eAnelloPezzi([[[13.0, 41.0], [13.1, 41.0], [13.2, 41.0]]], { roundtrip: true })).toBe(true);
    // U corta: estremi a 800 m ma il percorso è di 2 km: non è un anello (mai più di un quarto)
    expect(eAnelloPezzi([[[13.0, 41.0], [13.0, 41.008], [13.011, 41.008], [13.011, 41.0]]])).toBe(false);
  });
  it('tratti sparsi e rovesciati (relazioni OSM): si guardano gli estremi liberi, non primo e ultimo punto', () => {
    // un quadrato di ~4 km fatto di 4 tratti, il primo percorso al contrario: da primo/ultimo punto sembrerebbe lineare
    const A = [13.0, 41.0];
    const B = [13.05, 41.0];
    const C = [13.05, 41.04];
    const D = [13.0, 41.04];
    const tratti = [[B, A], [B, C], [C, D], [D, A]];
    expect(eAnelloPezzi(tratti)).toBe(true);
    // lineare in tre tratti con un verso rovesciato: due estremi lontani
    expect(eAnelloPezzi([[[13.0, 41.0], [13.05, 41.0]], [[13.1, 41.0], [13.05, 41.0]], [[13.1, 41.0], [13.15, 41.0]]])).toBe(false);
  });
  it('pezzi per "Su più giorni": con A/R la traccia anche al contrario', () => {
    const pezzi = [[[0, 0, 100], [1, 0, 200]], [[1, 0, 200], [2, 0, 300]]];
    expect(pezziScelti(pezzi, 'andata')).toBe(pezzi);
    expect(pezziScelti(pezzi, 'ar')).toEqual([...pezzi, [[2, 0, 300], [1, 0, 200]], [[1, 0, 200], [0, 0, 100]]]);
  });
  it('orari: arrivo, rientro e ultima partenza con la luce', () => {
    const o = orariGiornata({ partenzaMin: 9 * 60, andataMin: 115, ritornoMin: 85, tramontoMin: 18 * 60 + 10 });
    expect(oraDaMinuti(o.arrivoMin)).toBe('10:55');
    expect(oraDaMinuti(o.rientroMin)).toBe('12:20');
    expect(oraDaMinuti(o.ultimaPartenzaMin)).toBe('14:20');
    expect(o.tardi).toBe(false);
    expect(orariGiornata({ partenzaMin: 15 * 60, andataMin: 115, ritornoMin: 85, tramontoMin: 18 * 60 + 10 }).tardi).toBe(true);
    expect(orariGiornata({ partenzaMin: 600, andataMin: 60 }).rientroMin).toBeNull();
    expect(minutiDaOra('08:30')).toBe(510);
    expect(minutiDaOra('')).toBeNull();
  });
  it('dato della fonte solo se diverso dal calcolo', () => {
    expect(notaFonte({ km: 5, salita: 400, durataMin: 180 }, { km: 5.1, salita: 420, durataMin: 125 })).toBe('Indicato dalla fonte: 3 h');
    expect(notaFonte({ km: 6, salita: 600 }, { km: 5, salita: 420, durataMin: 117 })).toBe('Indicato dalla fonte: 6,0 km · +600 m');
    expect(notaFonte({ km: 5, salita: 410, durataMin: 120 }, { km: 5, salita: 420, durataMin: 117 })).toBe('');
  });
});

import { fineSullAndata } from '../src/lib/andataRitorno.js';
describe('su più giorni con A/R', () => {
  it('una giornata che finisce sul ritorno si cerca sul punto equivalente dell\'andata', () => {
    expect(fineSullAndata({ km: 15, giorno: 2 }, 10).km).toBe(5);
    expect(fineSullAndata({ km: 7 }, 10).km).toBe(7);
  });
});

import { baseAndata } from '../src/lib/andataRitorno.js';
describe('base dell\'andata', () => {
  const pezzi = [[[13.8, 41.8], [13.81, 41.8], [13.82, 41.8]]];
  it('profilo TINITALY quando la traccia non ha quote; null senza quote né traccia', () => {
    const b = baseAndata(pezzi, { salita: 420, discesa: 30 });
    expect(b.salita).toBe(420);
    expect(b.discesa).toBe(30);
    expect(b.km).toBeCloseTo(1.7, 1);
    expect(baseAndata(pezzi, null)).toBeNull();
    expect(baseAndata([], { salita: 1, discesa: 1 })).toBeNull();
  });
});

import { tracciaDiversa } from '../src/lib/andataRitorno.js';
describe('traccia diversa dal percorso descritto', () => {
  it('oltre il 40% di differenza nei km', () => {
    expect(tracciaDiversa(5, 15.9)).toBe(true);
    expect(tracciaDiversa(6, 1.7)).toBe(true);
    expect(tracciaDiversa(5, 6.5)).toBe(false);
    expect(tracciaDiversa(null, 6)).toBe(false);
  });
});
