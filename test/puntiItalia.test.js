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

  it('richiesta per il solo rettangolo (senza area); file da caricare per la vista, con i quarti', () => {
    expect(queryQuadrato([41.5, 13.5, 42, 14])).not.toContain('area');
    expect(queryQuadrato([41.5, 13.5, 42, 14])).toContain('node["natural"="spring"](41.5,13.5,42,14)');
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

import { readFileSync } from 'node:fs';
import { soloInItalia } from '../src/lib/puntiItalia.js';

describe('punti fuori dall\'Italia scartati con il confine salvato', () => {
  const { anelli } = JSON.parse(readFileSync('scripts/dati/confine-italia.json', 'utf8'));
  const p = (nome, lat, lon) => ({ nome, lat, lon });
  it('tiene Italia, isole ed enclave; scarta estero, San Marino e Vaticano', () => {
    const punti = [
      p('Roma', 41.9, 12.5),
      p('Lampedusa', 35.51, 12.6),
      p('Campione d\'Italia', 45.969, 8.971),
      p('Lugano', 46.0, 8.95),
      p('Nizza', 43.7, 7.26),
      p('San Marino', 43.936, 12.447),
      p('San Pietro', 41.9022, 12.4539),
      p('Lubiana', 46.05, 14.5),
    ];
    expect(soloInItalia(punti, anelli).map((x) => x.nome)).toEqual(['Roma', 'Lampedusa', 'Campione d\'Italia']);
  });
});

describe('quadrati che toccano l\'Italia', () => {
  // un'isola di 0,2° dentro il quadrato 83_27 (41,5–42° N, 13,5–14° E) e un lungo lato che ne attraversa un altro
  const isola = [[[13.6, 41.6], [13.8, 41.6], [13.8, 41.8], [13.6, 41.8], [13.6, 41.6]]];
  const striscia = [[[10.0, 40.1], [12.0, 40.1], [12.0, 40.2], [10.0, 40.2], [10.0, 40.1]]];
  it('vero se il confine è dentro il quadrato, o lo attraversa', async () => {
    const { quadratoTocca } = await import('../src/lib/puntiItalia.js');
    expect(quadratoTocca('83_27', isola)).toBe(true);
    expect(quadratoTocca('80_22', striscia)).toBe(true); // 40–40,5° N, 11–11,5° E: solo attraversato
  });
  it('falso per il mare aperto e i paesi vicini', async () => {
    const { quadratoTocca } = await import('../src/lib/puntiItalia.js');
    expect(quadratoTocca('70_20', isola)).toBe(false);
    expect(quadratoTocca('83_28', isola)).toBe(false);
  });
  it('vero se il quadrato sta tutto dentro un poligono grande', async () => {
    const { quadratoTocca } = await import('../src/lib/puntiItalia.js');
    const grande = [[[10, 38], [16, 38], [16, 44], [10, 44], [10, 38]]];
    expect(quadratoTocca('83_27', grande)).toBe(true);
  });
  it('quadratiItalia con il confine toglie quelli lontani', async () => {
    const { quadratiItalia } = await import('../src/lib/puntiItalia.js');
    const solo = quadratiItalia(isola);
    expect(solo).toEqual(['83_27']);
    expect(quadratiItalia().length).toBeGreaterThan(300);
  });
});
