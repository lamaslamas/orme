import { describe, it, expect } from 'vitest';
import { faunaDalleOsservazioni, animaleDelTaxon, animaliPossibili, possibilitaFauna, mesiVicini, periodoMigliore } from '../src/lib/faunaPercorso.js';

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
    expect(r).toMatchObject([
      { animale: 'cervo', livello: 'percorso', osservazioni: 3, persone: 2, mesi: 'set–ott' },
      { animale: 'orso', livello: 'zona', osservazioni: 3, persone: 3, mesi: 'set' },
    ]);
    // conteggi mese per mese, per il filtro "nel periodo attuale"
    expect(r[0].perMese[8] + r[0].perMese[9]).toBe(3);
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
    expect(r.specie).toEqual([{ animale: 'cervo', osservazioni: 3, persone: 3, mesi: 'set', sfumate: 0, ultimoAnno: 2025 }]); // il lupo ha solo 2 osservazioni
  });
});

describe('possibilità di vedere fauna', () => {
  const sp = (animale, livello, osservazioni, mesi = '') => ({ animale, livello, osservazioni, mesi });

  it('"ricco di fauna" pesa le osservazioni sui km, con un minimo assoluto', () => {
    const lungo = (km, n) => ({ faunaInat: { km, specie: [sp('cervo', 'percorso', n)] } });
    expect(possibilitaFauna(lungo(3, 9)).livello).toBe('frequenti'); // 3 per km
    expect(possibilitaFauna(lungo(26, 20)).livello).toBe('possibili'); // 20 su 26 km: meno di 1 per km
    expect(possibilitaFauna(lungo(2, 6)).livello).toBe('possibili'); // denso ma sotto il minimo di 8
    // senza km: la lunghezza del sentiero, altrimenti un minimo più alto
    expect(possibilitaFauna({ lunghezzaKm: 4, faunaInat: { specie: [sp('cervo', 'percorso', 9)] } }).livello).toBe('frequenti');
    expect(possibilitaFauna({ faunaInat: { specie: [sp('cervo', 'percorso', 12)] } }).livello).toBe('possibili');
    expect(possibilitaFauna({ faunaInat: { specie: [sp('cervo', 'percorso', 15)] } }).livello).toBe('frequenti');
    // la lunghezza si può passare (es. dalla traccia)
    expect(possibilitaFauna(lungo(26, 20), null, { km: 10 }).livello).toBe('frequenti');
  });

  it('frequenti, possibili, occasionali', () => {
    expect(possibilitaFauna({ faunaInat: { km: 5, specie: [sp('cervo', 'percorso', 12)] } }).livello).toBe('frequenti');
    expect(possibilitaFauna({ faunaInat: { specie: [sp('cervo', 'percorso', 4)] } }).livello).toBe('possibili');
    expect(possibilitaFauna({ faunaInat: { specie: [sp('orso', 'zona', 5)] } }).livello).toBe('occasionali');
    expect(possibilitaFauna({ osservazione: true, animali: ['lupo'] }).livello).toBe('frequenti');
    expect(possibilitaFauna({ faunaInat: { specie: [] } })).toBeNull();
  });

  it('prima gli animali del periodo, poi quelli lungo il percorso', () => {
    const s = { faunaInat: { specie: [sp('cervo', 'percorso', 30, 'set–ott'), sp('orso', 'zona', 50, 'giu'), sp('lupo', 'zona', 5, 'giu')] } };
    expect(possibilitaFauna(s).specie).toEqual(['cervo', 'orso', 'lupo']);
    const giugno = possibilitaFauna(s, 6);
    expect(giugno.specie).toEqual(['orso', 'lupo', 'cervo']);
    expect(giugno.nelPeriodo).toBe(true);
  });
});

describe('fauna nel periodo attuale', () => {
  const mesi = (m) => Array.from({ length: 12 }, (_, i) => m[i + 1] ?? 0);
  // 10 osservazioni in estate, 2 a gennaio, su 4 km
  const s = {
    faunaInat: {
      km: 4,
      specie: [
        { animale: 'cervo', livello: 'percorso', osservazioni: 10, mesi: 'giu–ago', perMese: mesi({ 6: 4, 7: 3, 8: 3 }) },
        { animale: 'volpe', livello: 'percorso', osservazioni: 2, mesi: 'gen', perMese: mesi({ 1: 2 }) },
      ],
    },
  };

  it('il mese e quelli accanto, anche a cavallo dell\'anno', () => {
    expect([...mesiVicini(1)].sort((a, b) => a - b)).toEqual([1, 2, 12]);
    expect([...mesiVicini(12)].sort((a, b) => a - b)).toEqual([1, 11, 12]);
  });

  it('periodo migliore dai conteggi mensili', () => {
    expect(periodoMigliore(s.faunaInat.specie)).toMatch(/giu|lug/);
  });

  it('con la stagione il giudizio conta solo i mesi vicini', () => {
    expect(possibilitaFauna(s, 7).livello).toBe('frequenti');
    expect(possibilitaFauna(s, 7, { stagione: true })).toMatchObject({ livello: 'frequenti', stagione: true });
    const inverno = possibilitaFauna(s, 1, { stagione: true });
    expect(inverno.livello).toBe('possibili');
    expect(inverno.specie).toEqual(['volpe']);
    expect(possibilitaFauna(s, 4, { stagione: true })).toBeNull();
  });

  it('dati senza conteggi mensili: valgono i mesi migliori', () => {
    const vecchio = { faunaInat: { specie: [{ animale: 'cervo', livello: 'percorso', osservazioni: 20, mesi: 'giu' }] } };
    expect(possibilitaFauna(vecchio, 7, { stagione: true })?.specie).toEqual(['cervo']);
    expect(possibilitaFauna(vecchio, 2, { stagione: true })).toBeNull();
  });
});

describe('affidabilità: osservatori diversi e ultimo anno', () => {
  it('tre livelli a parole, sulle persone diverse', async () => {
    const { affidabilita } = await import('../src/lib/faunaPercorso.js');
    expect(affidabilita({ persone: 146, ultimoAnno: 2025, mesi: 'mag, ago–set' })).toMatchObject({ livello: 'molto', nome: 'molto segnalato', testo: '146 osservatori, ultima osservazione nel 2025' });
    expect(affidabilita({ persone: 7 }).nome).toBe('segnalato');
    expect(affidabilita({ persone: 1 })).toMatchObject({ nome: 'poche segnalazioni', testo: '1 osservatore' });
  });
  it('faunaDalleOsservazioni salva l\'anno dell\'ultima osservazione', () => {
    const o = (u, d) => ({ taxon: CERVO, location: '41.5,13.5', user: { id: u }, observed_on: d, quality_grade: 'research' });
    const g = { type: 'MultiLineString', coordinates: [[[13.5, 41.5], [13.51, 41.5]]] };
    const r = faunaDalleOsservazioni([o(1, '2021-05-01'), o(2, '2024-09-10'), o(3, '2023-01-01')], g);
    expect(r[0].ultimoAnno).toBe(2024);
  });
});

describe('specie cercata in un mese', () => {
  const sp = (animale, livello, osservazioni, persone, perMese, ultimoAnno) => ({ animale, livello, osservazioni, persone, perMese, mesi: '', ultimoAnno });
  const mesi = (m, n) => Array.from({ length: 12 }, (_, i) => (i + 1 === m ? n : 0));
  it('conta gli osservatori diversi, non solo le osservazioni', async () => {
    const { puntiSpecie } = await import('../src/lib/faunaPercorso.js');
    const tanti = { faunaInat: { specie: [sp('cervo', 'zona', 20, 15, mesi(9, 20), 2025)] } };
    const uno = { faunaInat: { specie: [sp('cervo', 'zona', 20, 1, mesi(9, 20), 2025)] } };
    expect(puntiSpecie(tanti, 'cervo', 9).punti).toBeGreaterThan(puntiSpecie(uno, 'cervo', 9).punti);
  });
  it('null se nel periodo non ci sono segnalazioni; un gruppo riporta la specie migliore', async () => {
    const { puntiSpecie } = await import('../src/lib/faunaPercorso.js');
    const s = { faunaInat: { specie: [sp('cervo', 'percorso', 10, 8, mesi(9, 10), 2024), sp('lupo', 'zona', 4, 3, mesi(9, 4), 2023)] } };
    expect(puntiSpecie(s, 'cervo', 2)).toBeNull();
    expect(puntiSpecie(s, 'mammiferi', 9)).toMatchObject({ animale: 'cervo', ultimoAnno: 2024 });
    expect(puntiSpecie(s, 'lupo', 9)).toMatchObject({ sensibile: true });
  });
  it('le uscite delle associazioni valgono come segnalazione', async () => {
    const { puntiSpecie } = await import('../src/lib/faunaPercorso.js');
    expect(puntiSpecie({ animali: ['orso'], faunaInat: { specie: [] } }, 'orso', 9)).toMatchObject({ animale: 'orso', dove: 'uscite' });
  });
});
