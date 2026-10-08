import { describe, it, expect } from 'vitest';
import { valutaCompatibilita, visibileInModalita } from '../src/lib/compatibilita.js';

const traccia = (sugg) => ({ geojson: { type: 'MultiLineString', coordinates: [[[13.8, 41.7], [13.8, 41.71]]] }, dettagli: { suggerimentoBici: sugg } });
const sugg = (si, no, spinta, tratti, scala) => ({ tratti, bicycle: { si, no, a_spinta: spinta, nonIndicato: tratti - si - no - spinta }, mtbScale: scala != null ? { min: scala, max: scala } : null });

describe('compatibilità del percorso', () => {
  it('senza informazioni la bici è "da verificare", mai percorribile', () => {
    const c = valutaCompatibilita({ codici: ['F2'], bici: { consentita: 'da_verificare' } }, null);
    expect(c.trekking.stato).toBe('percorribile');
    expect(c.mtb.stato).toBe('da_verificare');
    expect(c.emtb.stato).toBe('da_verificare');
  });

  it('i divieti prevalgono', () => {
    expect(valutaCompatibilita({ bici: { consentita: 'no' } }, null).mtb.stato).toBe('non_percorribile');
    expect(valutaCompatibilita({ bici: {} }, traccia(sugg(0, 1, 0, 3))).mtb.stato).toBe('non_percorribile');
    const guidato = valutaCompatibilita({ accesso: { tipo: 'numero_chiuso', nota: 'Numero chiuso' }, bici: { consentita: 'si' } }, null);
    expect(guidato.mtb.stato).toBe('non_percorribile');
    expect(guidato.trekking.stato).toBe('con_limitazioni');
  });

  it('con permesso e dati tecnici buoni è percorribile in MTB, ma l\'e-MTB resta da verificare', () => {
    const c = valutaCompatibilita({ codici: ['X'], bici: { consentita: 'si', scalaMtb: 'S1' } }, null);
    expect(c.mtb.stato).toBe('percorribile');
    expect(c.emtb.stato).toBe('da_verificare');
    expect(c.emtb.motivi.join()).toContain('elettriche');
    const conEmtb = valutaCompatibilita({ bici: { consentita: 'si', scalaMtb: 'S1', emtb: 'si' } }, null);
    expect(conEmtb.emtb.stato).toBe('percorribile');
  });

  it('difficoltà tecnica alta o tratti a spinta danno "con limitazioni"', () => {
    expect(valutaCompatibilita({ bici: { consentita: 'si', scalaMtb: 'S3' } }, null).mtb.stato).toBe('con_limitazioni');
    expect(valutaCompatibilita({ bici: {} }, traccia(sugg(2, 0, 1, 3, 1))).mtb.stato).toBe('con_limitazioni');
  });

  it('nella modalità bici si nascondono i non percorribili', () => {
    const c = valutaCompatibilita({ bici: { consentita: 'no' } }, null);
    expect(visibileInModalita(c, 'mtb')).toBe(false);
    expect(visibileInModalita(c, 'trekking')).toBe(true);
    const dv = valutaCompatibilita({ bici: {} }, null);
    expect(visibileInModalita(dv, 'mtb')).toBe(true);
    expect(visibileInModalita(dv, 'mtb', { soloPercorribili: true })).toBe(false);
  });
});
