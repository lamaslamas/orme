import { describe, it, expect } from 'vitest';
import { agganciaPartenza, testoAggancio, sceltaIniziale, partenzaValida, daDoveParte, cambiaPartenza } from '../src/lib/partenzaAnello.js';

// un sentiero dritto verso est a 41,8° N
const sentiero = { linea: [[13.8, 41.8], [13.82, 41.8]], nome: 'Sentiero F1' };
const aNord = (m) => 41.8 + m / 111_195;

describe('partenza dell\'anello agganciata al sentiero', () => {
  it('vicino (entro 300 m): si aggancia al punto più vicino del sentiero, senza avviso', () => {
    const r = agganciaPartenza([13.81, aNord(120)], [sentiero]);
    expect(r).toMatchObject({ stato: 'ok', nome: 'Sentiero F1' });
    expect(r.punto[1]).toBeCloseTo(41.8, 5);
    expect(r.punto[0]).toBeCloseTo(13.81, 5);
    expect(r.distanzaM).toBeGreaterThan(110);
    expect(testoAggancio(r)).toBeNull();
  });
  it('oltre 300 m: si sposta e lo dice', () => {
    const r = agganciaPartenza([13.81, aNord(450)], [sentiero]);
    expect(r.stato).toBe('spostata');
    expect(testoAggancio(r)).toBe('Il sentiero più vicino è a 450 m: partenza spostata lì.');
  });
  it('nessun sentiero entro 2 km: il punto resta dov\'è e non vale', () => {
    const p = [13.81, aNord(2600)];
    const r = agganciaPartenza(p, [sentiero]);
    expect(r).toMatchObject({ stato: 'lontano', punto: p });
    expect(testoAggancio(r)).toMatch(/non ci sono sentieri per creare un anello/);
    expect(partenzaValida({ modo: 'mappa', scelta: r })).toBe(false);
    expect(agganciaPartenza(p, []).stato).toBe('lontano');
  });
});

describe('GPS e scelta iniziale', () => {
  it('con il GPS: la mia posizione', () => {
    expect(sceltaIniziale({ disponibile: true })).toEqual({ modo: 'gps', motivo: null });
    expect(partenzaValida({ modo: 'gps', gps: [13.8, 41.8] })).toBe(true);
    expect(daDoveParte({ modo: 'gps' })).toBe('dalla tua posizione');
  });
  it('senza GPS: si sceglie sulla mappa, con il motivo; senza punto non si genera', () => {
    expect(sceltaIniziale({ disponibile: false, errore: 'negato' })).toMatchObject({ modo: 'mappa', motivo: expect.stringMatching(/permesso negato/) });
    expect(sceltaIniziale({ disponibile: false, errore: 'non-trovata' }).motivo).toMatch(/non trovata/);
    expect(partenzaValida({ modo: 'gps', gps: null })).toBe(false);
    expect(partenzaValida({ modo: 'mappa', scelta: null })).toBe(false);
  });
});

describe('cambio della partenza dopo la generazione', () => {
  it('le scelte restano, gli anelli trovati si azzerano e si rigenera da lì', () => {
    const prima = { lunghezza: '12', fatica: 'media', scelta: agganciaPartenza([13.81, aNord(50)], [sentiero]), anelli: [{ km: 12 }], giro: 2 };
    const nuova = agganciaPartenza([13.815, aNord(80)], [sentiero]);
    const dopo = cambiaPartenza(prima, nuova);
    expect(dopo).toMatchObject({ lunghezza: '12', fatica: 'media', anelli: [], giro: 0, daRigenerare: true });
    expect(dopo.scelta.punto).toEqual(nuova.punto);
    expect(daDoveParte({ modo: 'mappa', scelta: dopo.scelta })).toBe('da Sentiero F1');
  });
});
