import { describe, it, expect } from 'vitest';
import { applicaAggiornamento, tracciaDaAggiornare } from '../src/lib/aggiornamenti.js';

describe('aggiornamento dei dati iniziali', () => {
  const s = { id: 'x', codici: ['B5', 'B4'], accesso: { nota: 'vecchia', link: 'l' }, notePersonali: 'mie' };

  it('cambia i campi rimasti al valore originale', () => {
    const { sentiero, cambiati } = applicaAggiornamento(s, {
      codici: { da: ['B5', 'B4'], a: ['C5', 'B4'] },
      'accesso.nota': { da: 'vecchia', a: 'nuova' },
      'escursione.url': { da: undefined, a: 'https://x' },
    });
    expect(sentiero.codici).toEqual(['C5', 'B4']);
    expect(sentiero.accesso).toEqual({ nota: 'nuova', link: 'l' });
    expect(sentiero.escursione.url).toBe('https://x');
    expect(sentiero.notePersonali).toBe('mie');
    expect(cambiati).toHaveLength(3);
    expect(s.codici).toEqual(['B5', 'B4']);
  });

  it('non tocca i campi che ho modificato', () => {
    const mio = { ...s, accesso: { nota: 'scritta da me' } };
    const { sentiero, cambiati } = applicaAggiornamento(mio, { 'accesso.nota': { da: 'vecchia', a: 'nuova' } });
    expect(sentiero.accesso.nota).toBe('scritta da me');
    expect(cambiati).toEqual([]);
  });

  it('sostituisce solo tracce mancanti o iniziali', () => {
    const nuova = { dettagli: { iniziale: true, relazioniOsm: [2] } };
    expect(tracciaDaAggiornare(undefined, nuova)).toBe(true);
    expect(tracciaDaAggiornare({ origine: 'gpx', dettagli: {} }, nuova)).toBe(false);
    expect(tracciaDaAggiornare({ dettagli: { iniziale: false, relazioniOsm: [1] } }, nuova)).toBe(false);
    expect(tracciaDaAggiornare({ dettagli: { iniziale: true, relazioniOsm: [1] } }, nuova)).toBe(true);
    expect(tracciaDaAggiornare({ dettagli: { iniziale: true, relazioniOsm: [2] } }, nuova)).toBe(false);
  });
});

import { PNALM_ORIGINALI, AGGIORNAMENTI } from '../src/datiIniziali.js';

describe('aggiornamenti dei sentieri PNALM', () => {
  it('ogni valore "da" corrisponde ai dati originali (altrimenti non si applicherebbe mai)', () => {
    for (const [id, campi] of Object.entries(AGGIORNAMENTI)) {
      const originale = PNALM_ORIGINALI.find((s) => s.id === id);
      expect(originale, id).toBeTruthy();
      const { cambiati } = applicaAggiornamento(originale, campi);
      expect(cambiati.sort(), id).toEqual(Object.keys(campi).sort());
    }
  });
});
