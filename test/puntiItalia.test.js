import { describe, it, expect } from 'vitest';
import { idQuadrato, riquadroQuadrato, quartiDi, quadratiItalia, quadratiDaFare, queryQuadrato, fileDellaVista, ZONE_PRIMA } from '../src/lib/puntiItalia.js';

describe('rifugi e acqua per tutta Italia, a quadrati', () => {
  it('quadrati di 0,5° e loro quarti', () => {
    expect(idQuadrato(13.85, 41.8)).toBe('83_27');
    expect(riquadroQuadrato('83_27')).toEqual([41.5, 13.5, 42, 14]);
    expect(riquadroQuadrato('83_27-d')).toEqual([41.75, 13.75, 42, 14]);
    expect(quartiDi('83_27')).toEqual(['83_27-a', '83_27-b', '83_27-c', '83_27-d']);
    expect(quadratiItalia().length).toBe(25 * 25);
  });

  it('prima le zone del Sud e i parchi, poi dal più vecchio; i vuoti ogni tre mesi', () => {
    const primi = quadratiDaFare({}, '2026-10-13', 11);
    expect(primi[0]).toBe(idQuadrato(16.1, 39.75)); // Pollino
    expect(primi).toContain('83_27'); // PNALM
    expect(new Set(primi).size).toBe(primi.length);
    const indice = { '83_27': { aggiornato: '2026-10-12', n: 900 }, '78_24': { aggiornato: '2026-09-01', n: 0 }, '79_24': { aggiornato: '2026-06-01', n: 0 } };
    const dopo = quadratiDaFare(indice, '2026-10-13', 1000);
    expect(dopo).not.toContain('78_24'); // vuoto da poco
    expect(dopo).toContain('79_24'); // vuoto da più di tre mesi
    expect(dopo.at(-1)).toBe('83_27'); // il più recente in fondo
    expect(ZONE_PRIMA.length).toBeGreaterThanOrEqual(10);
  });

  it('richiesta solo in Italia; file da caricare per la vista, con i quarti', () => {
    expect(queryQuadrato([41.5, 13.5, 42, 14])).toContain('area["ISO3166-1"="IT"][admin_level=2]->.it');
    expect(queryQuadrato([41.5, 13.5, 42, 14])).toContain('node["natural"="spring"](area.it)(41.5,13.5,42,14)');
    const indice = { '83_27': { n: 900 }, '83_28': { n: 5000, quarti: true }, '83_26': { n: 0 } };
    expect(fileDellaVista([41.7, 13.4, 41.8, 14.1], indice)).toEqual(['83_27', '83_28-a', '83_28-c']);
  });
});

import { abitatiNellaRisposta } from '../src/lib/puntiItalia.js';
describe('quadrati vuoti o risposte incomplete', () => {
  it('conta gli abitati nella risposta', () => {
    expect(queryQuadrato([41.5, 13.5, 42, 14])).toContain('out count;');
    expect(abitatiNellaRisposta({ elements: [{ type: 'count', tags: { nodes: '42', total: '42' } }] })).toBe(42);
    expect(abitatiNellaRisposta({ elements: [] })).toBe(0);
  });
});

import { valutaCalo } from '../src/lib/puntiItalia.js';
describe('cali improvvisi dei punti', () => {
  it('fino al 30% in meno si accetta; di più no, finché non si ripete 3 notti di fila', () => {
    expect(valutaCalo(1000, 750, null, '2026-10-13').accetta).toBe(true);
    const n1 = valutaCalo(1000, 600, null, '2026-10-13');
    expect(n1).toMatchObject({ accetta: false, calo: { volte: 1, da: 1000, a: 600 } });
    const n2 = valutaCalo(1000, 610, n1.calo, '2026-10-14');
    expect(n2).toMatchObject({ accetta: false, calo: { volte: 2 } });
    const n3 = valutaCalo(1000, 605, n2.calo, '2026-10-15');
    expect(n3).toMatchObject({ accetta: true, calo: null, accettato: true });
  });
  it('se le notti non sono di fila si ricomincia a contare; un quadrato nuovo si accetta', () => {
    const n1 = valutaCalo(1000, 600, { volte: 2, ultima: '2026-10-01' }, '2026-10-13');
    expect(n1.calo.volte).toBe(1);
    expect(valutaCalo(0, 10, null, '2026-10-13').accetta).toBe(true);
  });
});

describe('quadrati da riprovare', () => {
  it('errore o calo sospetto la notte prima: passano avanti a tutti', () => {
    const indice = { '83_27': { aggiornato: '2026-10-12', n: 411, calo: { volte: 1, ultima: '2026-10-12' } }, '80_36': { aggiornato: '2026-10-01', n: 219, errore: '2026-10-12' } };
    expect(quadratiDaFare(indice, '2026-10-13', 2).sort()).toEqual(['80_36', '83_27']);
  });
});
