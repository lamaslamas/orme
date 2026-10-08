import { describe, it, expect } from 'vitest';
import { filtraSentieri, paesiDiPartenza, ordinaSentieri, FILTRI_VUOTI } from '../src/lib/filtri.js';
import { DATI_INIZIALI } from '../src/datiIniziali.js';

const f = (extra) => ({ ...FILTRI_VUOTI, ...extra });
const ids = (lista) => lista.map((s) => s.id);

describe('filtri della lista', () => {
  it('senza filtri restituisce tutto', () => {
    expect(filtraSentieri(DATI_INIZIALI, f())).toHaveLength(DATI_INIZIALI.length);
  });

  it('filtra per animale, anche con più animali', () => {
    const cervo = filtraSentieri(DATI_INIZIALI, f({ animale: 'cervo' }));
    expect(ids(cervo)).toEqual(['f10-pianezza']);
    expect(filtraSentieri(DATI_INIZIALI, f({ animale: 'camoscio' }))).toHaveLength(4);
  });

  it('filtra per stato', () => {
    const dati = [{ ...DATI_INIZIALI[0], stato: 'fatto' }, ...DATI_INIZIALI.slice(1)];
    expect(ids(filtraSentieri(dati, f({ stato: 'fatto' })))).toEqual(['cicerana']);
    expect(filtraSentieri(dati, f({ stato: 'da_fare' }))).toHaveLength(DATI_INIZIALI.length - 1);
  });

  it('filtra per tipo di accesso, compreso "non indicato"', () => {
    expect(filtraSentieri(DATI_INIZIALI, f({ accesso: 'numero_chiuso' }))).toHaveLength(2);
    const senza = filtraSentieri([{ id: 'x', nome: 'x' }], f({ accesso: 'nessuno' }));
    expect(senza).toHaveLength(1);
  });

  it('filtra per paese ignorando maiuscole e accenti', () => {
    expect(filtraSentieri(DATI_INIZIALI, f({ paese: 'opi' }))).toHaveLength(3);
  });

  it('cerca nel testo anche nei codici', () => {
    expect(ids(filtraSentieri(DATI_INIZIALI, f({ testo: 'k6' })))).toEqual(['i1-k6-val-di-rose-jannanghera']);
    expect(ids(filtraSentieri(DATI_INIZIALI, f({ testo: 'fondillo' })))).toEqual(['f2-val-fondillo']);
  });

  it('combina più filtri', () => {
    expect(ids(filtraSentieri(DATI_INIZIALI, f({ animale: 'camoscio', paese: 'Opi' })))).toEqual(['f1-monte-amaro']);
  });

  it('elenca i paesi senza doppioni e in ordine', () => {
    const paesi = paesiDiPartenza([...DATI_INIZIALI, { partenza: { paese: 'OPI' } }]);
    expect(paesi).toEqual(['Civitella Alfedena', 'Gioia Vecchio', 'Opi']);
  });

  it('ordina prima i da fare e i codici in ordine naturale', () => {
    const dati = [
      { id: 'a', codici: ['F10'], stato: 'da_fare', nome: '' },
      { id: 'b', codici: ['F2'], stato: 'da_fare', nome: '' },
      { id: 'c', codici: ['A1'], stato: 'fatto', nome: '' },
      { id: 'd', codici: [], stato: 'da_fare', nome: 'Zeta' },
    ];
    expect(ids(ordinaSentieri(dati))).toEqual(['b', 'a', 'd', 'c']);
  });
});

describe('filtro bici', () => {
  const dati = [
    { id: 'a', bici: { consentita: 'si' } },
    { id: 'b', bici: { consentita: 'no' } },
    { id: 'c' },
  ];
  it('filtra per consentita, vietata e da verificare (anche se manca il campo)', () => {
    expect(ids(filtraSentieri(dati, f({ bici: 'si' })))).toEqual(['a']);
    expect(ids(filtraSentieri(dati, f({ bici: 'no' })))).toEqual(['b']);
    expect(ids(filtraSentieri(dati, f({ bici: 'da_verificare' })))).toEqual(['c']);
  });
});

import { dividiPerTraccia, unisciGeometrie } from '../src/lib/filtri.js';

describe('mappa generale', () => {
  const linea = (x) => ({ type: 'MultiLineString', coordinates: [[[x, 41], [x + 0.01, 41]]] });
  const tracce = new Map([
    ['a', { sentieroId: 'a', geojson: linea(13.8) }],
    ['b', { sentieroId: 'b', geojson: { type: 'MultiLineString', coordinates: [] } }],
  ]);

  it('separa i sentieri con e senza traccia', () => {
    const { conTraccia, senzaTraccia } = dividiPerTraccia([{ id: 'a' }, { id: 'b' }, { id: 'c' }], tracce);
    expect(conTraccia.map((x) => x.sentiero.id)).toEqual(['a']);
    expect(senzaTraccia.map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('unisce le geometrie di più tracce', () => {
    const u = unisciGeometrie([{ geojson: linea(13.8) }, { geojson: linea(13.9) }, {}]);
    expect(u.coordinates).toHaveLength(2);
  });
});

describe('filtro difficoltà', () => {
  it('filtra per scala CAI, con "nessuna" per i sentieri senza', () => {
    const dati = [{ id: 'a', difficolta: 'E' }, { id: 'b', difficolta: 'EE' }, { id: 'c' }];
    expect(ids(filtraSentieri(dati, f({ difficolta: 'EE' })))).toEqual(['b']);
    expect(ids(filtraSentieri(dati, f({ difficolta: 'nessuna' })))).toEqual(['c']);
  });
});
