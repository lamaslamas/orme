import { describe, it, expect } from 'vitest';
import { queryViaVicina, viaDallaRisposta, viaVietata } from '../src/lib/viaOsm.js';

const via = (id, coords, tags) => ({ type: 'way', id, tags, geometry: coords.map(([lon, lat]) => ({ lon, lat })) });
const risposta = {
  elements: [
    via(1, [[13.8, 41.8], [13.802, 41.8]], { highway: 'path', sac_scale: 'mountain_hiking' }),
    via(2, [[13.8, 41.8003], [13.802, 41.8003]], { highway: 'track', name: 'Carrareccia della Difesa' }),
    { type: 'relation', id: 9, tags: { route: 'hiking', ref: 'K6', name: 'Valle Jannanghera', network: 'lwn', cai_scale: 'EE' }, members: [{ type: 'way', ref: 1, role: '' }] },
  ],
};

describe('sentiero toccato sulla mappa', () => {
  it('chiede le vie vicine e i percorsi escursionistici di cui fanno parte', () => {
    const q = queryViaVicina(41.8, 13.8);
    expect(q).toContain('way(around:25,41.800000,13.800000)');
    expect(q).toContain('rel(bw.vie)[route~"^(hiking|foot)$"]');
  });

  it('la via più vicina, segnata se è in un percorso, con la difficoltà CAI', () => {
    const v = viaDallaRisposta(risposta, [13.801, 41.80001]);
    expect(v).toMatchObject({ id: 1, nome: 'Valle Jannanghera', tipo: 'Sentiero', segnata: true, testoDifficolta: 'E · escursionistico (SAC T2)' });
    expect(v.percorsi).toEqual([{ id: 9, nome: 'Valle Jannanghera', ref: 'K6', rete: 'lwn' }]);
  });

  it('una carrareccia non segnata; nessuna via se la risposta è vuota', () => {
    const v = viaDallaRisposta(risposta, [13.801, 41.80031]);
    expect(v).toMatchObject({ id: 2, nome: 'Carrareccia della Difesa', tipo: 'Carrareccia', segnata: false, difficolta: null });
    expect(viaDallaRisposta({ elements: [] }, [13.8, 41.8])).toBeNull();
  });

  it('accesso vietato o privato', () => {
    expect(viaVietata({ tag: { access: 'private' } })).toBe(true);
    expect(viaVietata({ tag: { foot: 'no' } })).toBe(true);
    expect(viaVietata({ tag: { access: null } })).toBe(false);
  });
});
