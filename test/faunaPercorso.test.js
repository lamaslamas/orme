import { describe, it, expect } from 'vitest';
import { faunaDalleOsservazioni, animaleDelTaxon, animaliPossibili } from '../src/lib/faunaPercorso.js';

const traccia = { type: 'MultiLineString', coordinates: [[[13.8, 42], [13.82, 42]]] };
const oss = (taxon, lat, lon, utente, { obscured = false, data = '2025-09-12', qualita = 'research' } = {}) => ({
  taxon, location: `${lat},${lon}`, obscured, user: { id: utente }, observed_on: data, quality_grade: qualita,
});
const CERVO = { id: 204113, ancestor_ids: [1, 2] };
const ORSO_MARSICANO = { id: 999999, ancestor_ids: [1, 41641] }; // sottospecie: si riconosce dagli antenati
const LUPO = { id: 42048, ancestor_ids: [] };

describe('animali lungo il percorso da iNaturalist', () => {
  it('riconosce anche le sottospecie', () => {
    expect(animaleDelTaxon(ORSO_MARSICANO)).toBe('orso');
    expect(animaleDelTaxon({ id: 5, ancestor_ids: [1] })).toBeNull();
  });

  it('lungo il percorso con posizioni precise, nella zona con quelle sfumate', () => {
    const r = faunaDalleOsservazioni(
      [
        oss(CERVO, 42.001, 13.81, 1), oss(CERVO, 42.002, 13.815, 2, { data: '2025-10-01' }), oss(CERVO, 41.999, 13.805, 2),
        oss(ORSO_MARSICANO, 42.1, 13.9, 1, { obscured: true }), oss(ORSO_MARSICANO, 41.95, 13.7, 3, { obscured: true }), oss(ORSO_MARSICANO, 42.05, 13.85, 4, { obscured: true }),
        oss(LUPO, 42.001, 13.81, 1), oss(LUPO, 42.001, 13.81, 1), oss(LUPO, 42.001, 13.81, 1), // una sola persona: non basta
        oss(CERVO, 42.001, 13.81, 9, { qualita: 'needs_id' }), // non verificata: esclusa
      ],
      traccia,
    );
    expect(r).toEqual([
      { animale: 'cervo', livello: 'percorso', osservazioni: 3, persone: 2, mesi: 'set–ott' },
      { animale: 'orso', livello: 'zona', osservazioni: 3, persone: 3, mesi: 'set' },
    ]);
  });

  it('gli animali del percorso uniscono associazioni e iNaturalist', () => {
    expect(animaliPossibili({ animali: ['lupo'], faunaInat: { specie: [{ animale: 'cervo' }, { animale: 'lupo' }] } })).toEqual(['lupo', 'cervo']);
  });
});

describe('fauna del parco', () => {
  it('conta le osservazioni dentro il confine, le sfumate dentro il riquadro', async () => {
    const { faunaDelParco } = await import('../src/lib/faunaPercorso.js');
    const anelli = [[[13.0, 41.0], [14.0, 41.0], [14.0, 42.0], [13.0, 42.0], [13.0, 41.0]]];
    const o = (taxon, lat, lon, u, obscured = false) => ({ taxon, location: `${lat},${lon}`, user: { id: u }, observed_on: '2025-09-01', quality_grade: 'research', obscured });
    const r = faunaDelParco(
      [o(CERVO, 41.5, 13.5, 1), o(CERVO, 41.5, 13.6, 2), o(CERVO, 41.6, 13.5, 3), o(CERVO, 42.3, 13.5, 4), o(LUPO, 41.5, 13.5, 1, true), o(LUPO, 41.7, 13.2, 2, true)],
      { anelli, bbox: [40.9, 12.9, 42.5, 14.1] },
    );
    expect(r.osservazioni).toBe(5); // quella fuori dal confine e dal riquadro non conta
    expect(r.specie).toEqual([{ animale: 'cervo', osservazioni: 3, persone: 3, mesi: 'set', sfumate: 0 }]); // il lupo ha solo 2 osservazioni
  });
});
