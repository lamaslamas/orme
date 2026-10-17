import { describe, it, expect } from 'vitest';
import { dateDaOggi, nomeGiorno, tempoDelGiorno, temperatureDelGiorno, giornoDellaStriscia, testoDelGiorno, quoteMeteoDaiPezzi } from '../src/lib/quandoAndare.js';

// 24 ore con valori di base, modificati da f(ora)
const ore = (f = () => ({})) => Array.from({ length: 24 }, (_, ora) => ({ ora, t: 10, tp: 10, pp: 0, mm: 0, codice: 0, raffiche: 10, neve: 0, neveSuolo: 0, zero: 3000, nuvole: 10, ...f(ora) }));

describe('date e nomi', () => {
  it('7 giorni da oggi, anche a cavallo del mese', () => {
    expect(dateDaOggi('2026-10-29')).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  });
  it('Oggi, Domani, poi giorno della settimana', () => {
    expect(nomeGiorno('2026-10-14', '2026-10-14')).toBe('Oggi');
    expect(nomeGiorno('2026-10-15', '2026-10-14')).toBe('Domani');
    expect(nomeGiorno('2026-10-17', '2026-10-14')).toBe('Sab 17');
  });
});

describe('tempo e temperature del giorno', () => {
  it('dal più grave: temporale, neve, pioggia, poi le nuvole', () => {
    expect(tempoDelGiorno(ore((h) => (h === 15 ? { codice: 95 } : {})))).toBe('temporale');
    expect(tempoDelGiorno(ore((h) => (h === 3 ? { codice: 95 } : {})))).toBe('sereno'); // di notte non conta
    expect(tempoDelGiorno(ore((h) => (h === 10 ? { codice: 73 } : {})))).toBe('neve');
    expect(tempoDelGiorno(ore((h) => (h >= 12 && h <= 14 ? { codice: 61, pp: 70 } : {})))).toBe('pioggia');
    expect(tempoDelGiorno(ore((h) => (h === 12 ? { codice: 61, pp: 70 } : {})))).toBe('sereno'); // un'ora sola
    expect(tempoDelGiorno(ore(() => ({ nuvole: 80 })))).toBe('nuvoloso');
    expect(tempoDelGiorno(ore(() => ({ nuvole: 40 })))).toBe('variabile');
    expect(tempoDelGiorno([])).toBeNull();
  });
  it('minima e massima delle ore di giorno', () => {
    expect(temperatureDelGiorno(ore((h) => ({ t: h })))).toEqual({ min: 8, max: 18 });
  });
});

describe('giornoDellaStriscia', () => {
  const m = { basso: { quota: 1200 }, alto: { quota: 2000 }, durataMin: 240, percorso: {} };
  const giorno = (f) => ({ quota: 1200, ore: ore(f), alba: 7 * 60, tramonto: 18 * 60 + 30, pioggiaPrima: 0 });
  it('giornata buona: favorevole, tramonto, temperature alla partenza e in cima (più fresca)', () => {
    const g = giornoDellaStriscia({ basso: giorno(), alto: { ...giorno(), quota: 1200 } }, m);
    expect(g.giudizio).toBe('ok');
    expect(g.tramonto).toBe('18:30');
    expect(g.temperature).toEqual({ min: 10, max: 10 });
    expect(g.inCima.max).toBeLessThan(10); // 800 m più in alto: circa 5 gradi in meno
    expect(testoDelGiorno(g, 'Sab 17')).toMatch(/^Sab 17: meteo favorevole · parti entro le \d\d:\d\d · tramonto 18:30 · in cima/);
  });
  it('temporale nel pomeriggio: il motivo è il primo fattore non favorevole', () => {
    const g = giornoDellaStriscia({ basso: giorno((h) => (h >= 8 ? { codice: 95, pp: 80 } : {})) }, { ...m, alto: null });
    expect(g.giudizio).not.toBe('ok');
    expect(g.motivo).toBeTruthy();
    expect(g.tempo).toBe('temporale');
  });
  it('senza previsione: null, e la riga lo dice', () => {
    expect(giornoDellaStriscia({ basso: null }, m)).toBeNull();
    expect(testoDelGiorno(null, 'Oggi')).toBe('Oggi: previsione non disponibile');
  });
});

describe('quoteMeteoDaiPezzi', () => {
  it('partenza e punto più alto; null senza quote', () => {
    const q = quoteMeteoDaiPezzi([[[13.7, 41.8, 1200], [13.71, 41.81, 1900.4]], [[13.71, 41.81, 1900.4], [13.72, 41.82, 1500]]]);
    expect(q).toEqual({ partenza: { lon: 13.7, lat: 41.8, quota: 1200 }, alto: { lon: 13.71, lat: 41.81, quota: 1900 }, max: 1900, min: 1200 });
    expect(quoteMeteoDaiPezzi([[[13.7, 41.8], [13.71, 41.81]]])).toBeNull();
  });
});

import { TESTO_TARDI, partenzaPassata } from '../src/lib/quandoAndare.js';
describe('oggi: partenza già passata e tramonto una volta sola', () => {
  it('è tardi solo se la partenza scelta è prima dell\'ora attuale', () => {
    expect(partenzaPassata(8 * 60, 9 * 60)).toBe(true);
    expect(partenzaPassata(9 * 60, 9 * 60)).toBe(false);
    expect(partenzaPassata(14 * 60, 9 * 60)).toBe(false);
    expect(partenzaPassata(null, 9 * 60)).toBe(false);
    expect(TESTO_TARDI).toBe('Per oggi è tardi: scegli un altro giorno o orario');
  });
  it('la riga del giorno: «tardi» al posto del giudizio; il tramonto non si ripete', () => {
    expect(testoDelGiorno({ tardi: true, giudizio: null, tramonto: '18:03' }, 'Oggi')).toBe(TESTO_TARDI);
    const g = { giudizio: 'sconsigliato', motivo: 'troppo lungo per le ore di luce (6 h, tramonto alle 18:12)', tramonto: '18:12', inCima: { min: 5, max: 13 } };
    const t = testoDelGiorno(g, 'Oggi');
    expect(t.match(/18:12/g)).toHaveLength(1);
    expect(t).toContain('in cima 5–13°');
    expect(testoDelGiorno({ giudizio: 'ok', tramonto: '18:03' }, 'Sab 17')).toContain('tramonto 18:03');
  });
  it('con partenza alle 8:00 un percorso di 3 h 46 non è «troppo lungo per le ore di luce» (tramonto 18:03)', () => {
    const ore = Array.from({ length: 24 }, (_, ora) => ({ ora, t: 12, tp: 12, pp: 0, mm: 0, codice: 0, raffiche: 10, neve: 0, neveSuolo: 0, zero: 3000, nuvole: 10 }));
    const giorno = { quota: 1200, ore, alba: 6 * 60 + 50, tramonto: 18 * 60 + 3, pioggiaPrima: 0 };
    const m = { basso: { quota: 1200 }, alto: null, durataMin: 226, percorso: {} };
    // il vecchio calcolo partiva dall'ora attuale (qui le 17:30): niente tempo per finire
    const dalle1730 = giornoDellaStriscia({ basso: giorno }, m, { dopoMin: 17 * 60 + 30 });
    expect(dalle1730.giudizio).toBe('sconsigliato');
    // con la partenza scelta alle 8:00 va bene
    const dalle8 = giornoDellaStriscia({ basso: giorno }, m, { dopoMin: 8 * 60 });
    expect(dalle8.giudizio).toBe('ok');
    expect(dalle8.partenza.entro >= '08:00').toBe(true);
  });
});
