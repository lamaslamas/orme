import { describe, it, expect } from 'vitest';
import { parchiCercati, urlLuoghi, luoghiDallaRisposta } from '../src/lib/cercaLuogo.js';
import { PARCHI } from '../src/datiParchi.js';

describe('ricerca sulla mappa', () => {
  it('trova i parchi per nome, senza accenti e maiuscole', () => {
    expect(parchiCercati('majella', PARCHI).map((p) => p.id)).toEqual(['majella']);
    expect(parchiCercati('foreste casentinesi', PARCHI).map((p) => p.id)).toEqual(['foreste-casentinesi']);
    expect(parchiCercati('Abruzzo', PARCHI).map((p) => p.id)).toContain('pnalm');
    expect(parchiCercati('', PARCHI)).toEqual([]);
  });

  it('luoghi solo in Italia, in italiano', () => {
    const u = new URL(urlLuoghi(' Pescasseroli '));
    expect(u.searchParams.get('q')).toBe('Pescasseroli');
    expect(u.searchParams.get('countrycodes')).toBe('it');
    expect(u.searchParams.get('accept-language')).toBe('it');
  });

  it('legge la risposta di Nominatim', () => {
    const [p] = luoghiDallaRisposta([
      { lat: '41.8', lon: '13.79', name: 'Pescasseroli', display_name: "Pescasseroli, L'Aquila, Abruzzo, Italia", boundingbox: ['41.7', '41.9', '13.7', '13.9'] },
      { lat: 'x', lon: '1' },
    ]);
    expect(p).toEqual({ nome: 'Pescasseroli', dettaglio: "L'Aquila, Abruzzo", lat: 41.8, lon: 13.79, riquadro: [41.7, 13.7, 41.9, 13.9] });
    expect(luoghiDallaRisposta(null)).toEqual([]);
    const doppio = { lat: '41.8', lon: '13.79', name: 'Opi', display_name: "Opi, L'Aquila, Abruzzo, Italia" };
    expect(luoghiDallaRisposta([doppio, { ...doppio, lat: '41.81' }])).toHaveLength(1);
  });
});

import { risultatiOrdinati } from '../src/lib/cercaLuogo.js';
describe('ordine dei risultati', () => {
  const parco = PARCHI.find((p) => p.id === 'gallipoli-cognato');
  const gallipoli = { nome: 'Gallipoli', dettaglio: 'Lecce, Puglia', lat: 40.05, lon: 17.99, riquadro: null };
  const via = { nome: 'Via Gallipoli', dettaglio: 'Lecce', lat: 40.3, lon: 18.1, riquadro: null };
  it('il paese con il nome esatto prima del parco, ognuno con il suo tipo', () => {
    const r = risultatiOrdinati('gallipoli', [parco], [via, gallipoli]);
    expect(r.map((x) => [x.tipo, x.nome])).toEqual([
      ['luogo', 'Gallipoli'],
      ['parco', 'Gallipoli Cognato'],
      ['luogo', 'Via Gallipoli'],
    ]);
  });
  it('senza un luogo esatto il parco resta primo', () => {
    expect(risultatiOrdinati('majella', [PARCHI.find((p) => p.id === 'majella')], [via])[0].tipo).toBe('parco');
  });
});
