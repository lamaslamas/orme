import { describe, it, expect } from 'vitest';
import { parametriGbif, urlTileGbif, urlOsservazioniGbif, interpretaGbif, nomeFonte, animaleGbif } from '../src/lib/gbif.js';
import { faunaDalleOsservazioni, faunaDelParco } from '../src/lib/faunaPercorso.js';
import { TAXON_GBIF, SPECIE_SOLO_INTORNO } from '../src/lib/costanti.js';
import { SPECIE_RARE } from '../src/lib/inaturalist.js';

const oggi = new Date('2026-10-09');

describe('GBIF: parametri e indirizzi', () => {
  it('tutte le specie della lista, solo presenze senza problemi di posizione', () => {
    const p = parametriGbif({ specie: 'rare' }, oggi);
    expect(p.getAll('taxonKey')).toHaveLength(SPECIE_RARE.length);
    expect(p.get('occurrenceStatus')).toBe('PRESENT');
    expect(p.get('hasGeospatialIssue')).toBe('false');
    expect(p.has('month')).toBe(false);
  });

  it('tutte le specie di Orme; mai una ricerca senza specie', () => {
    expect(parametriGbif({ specie: 'tutte' }).getAll('taxonKey')).toHaveLength(Object.keys(TAXON_GBIF).length - SPECIE_SOLO_INTORNO.length);
    expect(parametriGbif({ specie: 'intorno' }).getAll('taxonKey')).toHaveLength(Object.keys(TAXON_GBIF).length);
    expect(() => parametriGbif({ specie: 'sconosciuta' })).toThrow();
  });

  it('una specie, una stagione (anche a cavallo dell\'anno) e gli ultimi anni', () => {
    const p = parametriGbif({ specie: 'lupo', stagione: 'inverno', anni: 5 }, oggi);
    expect(p.getAll('taxonKey')).toEqual([String(TAXON_GBIF.lupo)]);
    expect(p.getAll('month')).toEqual(['12', '1', '2']);
    expect(p.get('year')).toBe('2021,2026');
  });

  it('tile della mappa e ricerca in un riquadro', () => {
    expect(urlTileGbif({ specie: 'orso' }, oggi)).toMatch(/^https:\/\/api\.gbif\.org\/v2\/map\/occurrence\/adhoc\/\{z\}\/\{x\}\/\{y\}@1x\.png\?.*taxonKey=2433433/);
    const u = new URL(urlOsservazioniGbif([41.6, 13.64, 42.02, 14.05], { specie: 'cervo' }, { limite: 50, scarto: 100 }));
    expect(u.searchParams.get('decimalLatitude')).toBe('41.60000,42.02000');
    expect(u.searchParams.get('offset')).toBe('100');
  });
});

describe('GBIF: osservazioni', () => {
  const grezza = (x) => ({
    key: 1,
    taxonKey: 2440958,
    speciesKey: 2440958,
    decimalLatitude: 41.8,
    decimalLongitude: 13.8,
    eventDate: '2026-09-19T07:00',
    datasetName: 'EOD – eBird Observation Dataset',
    license: 'http://creativecommons.org/licenses/by/4.0/legalcode',
    recordedBy: 'Mario Rossi',
    coordinateUncertaintyInMeters: 50,
    ...x,
  });

  it('riconosce l\'animale anche da genere o sottospecie', () => {
    expect(animaleGbif({ taxonKey: 999, genusKey: TAXON_GBIF.camoscio })).toBe('camoscio');
    expect(animaleGbif({ taxonKey: 6165157 })).toBe('muflone');
    expect(animaleGbif({ taxonKey: 2441110 })).toBeNull(); // pecora domestica
  });

  it('fonte, licenza, data, link; mai il nome dell\'osservatore', () => {
    const [o] = interpretaGbif({ results: [grezza()] });
    expect(o).toMatchObject({ animale: 'cervo', specie: 'Cervo', fonte: 'eBird', licenza: 'CC BY', data: '2026-09-19', sfumata: false, url: 'https://www.gbif.org/occurrence/1' });
    expect(JSON.stringify(o)).not.toContain('Rossi');
    expect(o.osservatore).toMatch(/^[0-9a-z]+$/);
  });

  it('posizioni imprecise o non dichiarate valgono solo per la zona (tranne iNaturalist)', () => {
    const [larga, senza, inat] = interpretaGbif({
      results: [
        grezza({ coordinateUncertaintyInMeters: 27754 }),
        grezza({ coordinateUncertaintyInMeters: undefined }),
        grezza({ coordinateUncertaintyInMeters: undefined, datasetName: 'iNaturalist research-grade observations', references: 'https://www.inaturalist.org/observations/5' }),
      ],
    });
    expect(larga.sfumata).toBe(true);
    expect(senza.sfumata).toBe(true);
    expect(inat).toMatchObject({ sfumata: false, fonte: 'iNaturalist', url: 'https://www.inaturalist.org/observations/5' });
  });

  it('nomi brevi delle fonti', () => {
    expect(nomeFonte('Observation.org, Nature data from around the World')).toBe('Observation.org');
    expect(nomeFonte('The Atlas of Wintering Birds in Italy - AIRONE project (2010-2025)')).toBe('Atlante AIRONE');
  });

  it('il calcolo della fauna usa le osservazioni GBIF come quelle di iNaturalist', () => {
    const traccia = { type: 'MultiLineString', coordinates: [[[13.79, 41.8], [13.81, 41.8]]] };
    const oss = interpretaGbif({
      results: [grezza({ key: 1 }), grezza({ key: 2, recordedBy: 'B' }), grezza({ key: 3, recordedBy: 'C', eventDate: '2026-10-01' })],
    });
    const [cervo] = faunaDalleOsservazioni(oss, traccia);
    expect(cervo).toMatchObject({ animale: 'cervo', livello: 'percorso', osservazioni: 3, persone: 3 });
    expect(faunaDelParco(oss, { bbox: [41, 13, 42, 14] }).specie[0]).toMatchObject({ animale: 'cervo', osservazioni: 3 });
  });
});

describe('GBIF: specie di pregio', async () => {
  const { parametriGbif, interpretaGbif, iconaPerOsservazione, TAXA_NOTEVOLI_GBIF } = await import('../src/lib/gbif.js');
  const { parametriInat, TAXA_NOTEVOLI_INAT } = await import('../src/lib/inaturalist.js');
  it('cerca solo i gruppi scelti; le minacciate a parte, tra tutti i mammiferi e uccelli', () => {
    const notevoli = parametriGbif({ specie: 'notevoli' }).getAll('taxonKey');
    expect(notevoli).toContain('1450'); // gufi e civette
    expect(notevoli).not.toContain('359'); // non tutti i mammiferi (niente topi e ratti)
    expect(notevoli).toHaveLength(TAXA_NOTEVOLI_GBIF.length);
    const minacciate = parametriGbif({ specie: 'minacciate' });
    expect(minacciate.getAll('taxonKey')).toEqual(['359', '212']);
    expect(minacciate.getAll('iucnRedListCategory')).toEqual(['NT', 'VU', 'EN', 'CR']);
    expect(parametriInat({ specie: 'notevoli' }).get('taxon_id')).toBe(TAXA_NOTEVOLI_INAT.join(','));
  });
  it('sceglie l’icona più vicina per le specie fuori dalla lista', () => {
    const [o] = interpretaGbif({ results: [{ key: 1, class: 'Aves', order: 'Accipitriformes', family: 'Accipitridae', species: 'Buteo buteo', decimalLatitude: 40, decimalLongitude: 18 }] });
    expect(o).toMatchObject({ animale: null, classe: 'Aves', nomeScientifico: 'Buteo buteo' });
    expect(iconaPerOsservazione(o)).toBe('aquila_reale');
    expect(iconaPerOsservazione({ classe: 'Aves', famiglia: 'Upupidae' })).toBe('uccello');
    expect(iconaPerOsservazione({ classe: 'Mammalia', famiglia: 'Hystricidae' })).toBe('mammifero');
    expect(iconaPerOsservazione({ animale: 'lupo' })).toBe('lupo');
  });
});
