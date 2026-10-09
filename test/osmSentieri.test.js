import { describe, it, expect } from 'vitest';
import { candidatiSentieri, eViaFerrata } from '../src/lib/fonti/osmSentieri.js';

const relazione = (id, tags, wayRef = 100) => ({
  type: 'relation',
  id,
  tags,
  members: [{ type: 'way', ref: wayRef, role: '', geometry: [{ lat: 40.5 + id / 100, lon: 16.1 }, { lat: 40.51 + id / 100, lon: 16.11 }, { lat: 40.52 + id / 100, lon: 16.12 }] }],
});

describe('sentieri OSM: vie ferrate', () => {
  it('riconosce una via ferrata dal nome o dai tag', () => {
    expect(eViaFerrata({ name: 'Via Ferrata Marcirosa' })).toBe(true);
    expect(eViaFerrata({ name: 'Sentiero 703', via_ferrata_scale: '3' })).toBe(true);
    expect(eViaFerrata({ name: 'Sentiero 703' }, [{ highway: 'via_ferrata' }])).toBe(true);
    expect(eViaFerrata({ name: 'Sentiero 703' }, [{ highway: 'path' }])).toBe(false);
  });

  it('una via ferrata è EEA e "con limitazioni" a piedi; un sentiero no', () => {
    const json = {
      elements: [
        relazione(1, { route: 'hiking', name: 'Via Ferrata Marcirosa' }, 100),
        relazione(2, { route: 'hiking', name: 'Sentiero 703', cai_scale: 'E' }, 101),
        { type: 'way', id: 100, tags: { highway: 'via_ferrata' } },
        { type: 'way', id: 101, tags: { highway: 'path' } },
      ],
    };
    const [ferrata, sentiero] = candidatiSentieri(json, 'gallipoli-cognato');
    expect(ferrata).toMatchObject({ difficolta: 'EEA', attivita: { trekking: { stato: 'con_limitazioni' } } });
    expect(ferrata.attivita.trekking.motivi[0]).toMatch(/imbrago/);
    expect(sentiero).toMatchObject({ difficolta: 'E', attivita: { trekking: { stato: 'percorribile' } } });
  });
});
