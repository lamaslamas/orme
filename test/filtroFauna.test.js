import { describe, it, expect, afterEach } from 'vitest';
import { filtraOsservazioni, osservazioneAmmessa, eRaraGbif, eRaraInat, specieDalleOsservazioni } from '../src/lib/filtroFauna.js';
import { interpretaGbif } from '../src/lib/gbif.js';
import { interpretaOsservazioni } from '../src/lib/inaturalist.js';
import { nascoste } from '../src/lib/specieNascoste.js';

afterEach(() => nascoste.rimettiTutte());

// osservazioni di più fonti nella stessa zona (Torre Chianca): iNaturalist, GBIF (atlante e iNaturalist) come arrivano dalle API
const inat = interpretaOsservazioni({
  results: [
    { id: 1, location: '40.43,18.28', observed_on: '2026-05-01', quality_grade: 'research', user: { id: 7 }, taxon: { id: 100, name: 'Larus audouinii', preferred_common_name: 'Gabbiano corso', iconic_taxon_name: 'Aves', ancestor_ids: [3, 67], conservation_status: { iucn: 30 } } },
    { id: 2, location: '40.43,18.29', observed_on: '2026-05-02', user: { id: 8 }, taxon: { id: 101, name: 'Falco tinnunculus', preferred_common_name: 'Gheppio', iconic_taxon_name: 'Aves', ancestor_ids: [3, 67570], conservation_status: { iucn: 10 } } },
    { id: 3, location: '40.43,18.30', observed_on: '2026-05-03', user: { id: 9 }, taxon: { id: 102, name: 'Passer italiae', preferred_common_name: "Passera d'Italia", iconic_taxon_name: 'Aves', ancestor_ids: [3, 7251], conservation_status: { iucn: 30 } } },
    { id: 4, location: '40.43,18.31', observed_on: '2026-05-04', user: { id: 9 }, taxon: { id: 103, name: 'Canis lupus familiaris', preferred_common_name: 'cane', iconic_taxon_name: 'Mammalia', ancestor_ids: [40151] } },
    { id: 5, location: '40.43,18.32', observed_on: '2026-05-05', user: { id: 9 }, taxon: { id: 104, name: 'Lacerta bilineata', preferred_common_name: 'ramarro', iconic_taxon_name: 'Reptilia', ancestor_ids: [26036] } },
    { id: 6, location: '40.43,18.33', observed_on: '2026-05-05', user: { id: 9 }, taxon: { id: 105, name: 'Quercus ilex', preferred_common_name: 'leccio', iconic_taxon_name: 'Plantae', ancestor_ids: [47126] } },
  ],
});
const gbif = interpretaGbif({
  results: [
    { key: 10, species: 'Larus audouinii', vernacularName: 'Gabbiano corso', class: 'Aves', order: 'Charadriiformes', iucnRedListCategory: 'VU', decimalLatitude: 40.431, decimalLongitude: 18.281, datasetName: 'AIRONE - The Atlas of wintering Birds in Italy (2010-2025)', eventDate: '2025-01-10' },
    { key: 11, species: 'Falco tinnunculus', class: 'Aves', order: 'Falconiformes', iucnRedListCategory: 'LC', decimalLatitude: 40.432, decimalLongitude: 18.282, datasetName: 'AIRONE - The Atlas of wintering Birds in Italy (2010-2025)', eventDate: '2025-01-11' },
    { key: 12, species: 'Streptopelia turtur', class: 'Aves', order: 'Columbiformes', iucnRedListCategory: 'VU', decimalLatitude: 40.433, decimalLongitude: 18.283, datasetName: 'eBird Observation Dataset', eventDate: '2025-01-12' },
    { key: 13, species: 'Hystrix cristata', class: 'Mammalia', order: 'Rodentia', iucnRedListCategory: 'LC', decimalLatitude: 40.434, decimalLongitude: 18.284, datasetName: 'Observation.org', eventDate: '2025-01-13' },
    { key: 14, species: 'Neophron percnopterus', class: 'Aves', order: 'Accipitriformes', iucnRedListCategory: 'EN', decimalLatitude: 40.435, decimalLongitude: 18.285, datasetName: 'Observation.org', eventDate: '2025-01-14' },
  ],
});
const tutte = [...inat, ...gbif];
const nomi = (l) => l.map((o) => o.nomeScientifico).sort();

// icone, conteggio «N animali qui» ed elenco leggono lo stesso risultato: qui lo si prende come fa heatmap.js
const icone = (f) => filtraOsservazioni(tutte, f);
const conteggio = (f) => filtraOsservazioni(tutte, f).length;
const elenco = (f) => filtraOsservazioni(tutte, f);

describe('Fauna: un solo filtro per icone, conteggio ed elenco, da tutte le fonti', () => {
  it('le fonti dicono se una specie è rara allo stesso modo', () => {
    expect(inat.map((o) => o.rara)).toEqual([true, false, false, false, false, false]); // passera: passeriforme, fuori
    expect(gbif.map((o) => o.rara)).toEqual([true, false, false, false, true]); // tortora: colombiforme, fuori
    expect(eRaraGbif({ iucnRedListCategory: 'VU', class: 'Reptilia' })).toBe(false); // solo mammiferi e uccelli
    expect(eRaraInat({ conservation_status: { iucn: 20 }, iconic_taxon_name: 'Aves' })).toBe(false); // quasi minacciata no
  });
  it('tutti gli animali selvatici: non domestici, non piante, non nascosti', () => {
    const f = { gruppi: ['selvatici'] };
    expect(icone(f)).toHaveLength(tutte.length - 2); // meno il cane e il leccio
    expect(nomi(icone(f))).not.toContain('Canis lupus familiaris');
    expect(nomi(icone(f))).not.toContain('Quercus ilex');
    expect(nomi(icone(f))).toContain('Lacerta bilineata'); // anche rettili
    expect(nomi(icone(f))).toContain('Passer italiae'); // e passeriformi
    nascoste.nascondi({ scientifico: 'Falco tinnunculus', nome: 'Gheppio' });
    expect(nomi(icone(f))).not.toContain('Falco tinnunculus'); // da qualsiasi fonte
    expect(nomi(icone(f)).filter((n) => n === 'Falco tinnunculus')).toHaveLength(0);
  });
  it('«Solo rare»: solo le specie rare, da tutte le fonti', () => {
    const f = { gruppi: ['rare'] };
    expect(nomi(icone(f))).toEqual(['Larus audouinii', 'Larus audouinii', 'Neophron percnopterus']);
    expect(new Set(icone(f).map((o) => o.fonte)).size).toBe(3); // iNaturalist, atlante e Observation.org
  });
  it('con una specie scelta: solo quella, da tutte le fonti (anche con «Solo rare» acceso)', () => {
    for (const gruppi of [['selvatici'], ['rare']]) {
      const f = { gruppi, taxon: { scientifico: 'Larus audouinii', nome: 'Gabbiano corso' } };
      expect(nomi(icone(f))).toEqual(['Larus audouinii', 'Larus audouinii']);
      expect(new Set(icone(f).map((o) => o.fonte)).size).toBe(2); // iNaturalist e atlante
    }
    const gheppio = { gruppi: ['rare'], taxon: { scientifico: 'Falco tinnunculus' } };
    expect(nomi(icone(gheppio))).toEqual(['Falco tinnunculus', 'Falco tinnunculus']); // scelta a mano: vale
  });
  it('icone, conteggio ed elenco coincidono in ogni caso', () => {
    const casi = [
      { gruppi: ['selvatici'] },
      { gruppi: ['rare'] },
      { gruppi: ['selvatici'], taxon: { scientifico: 'Larus audouinii' } },
      { gruppi: ['rare'], taxon: { scientifico: 'Larus audouinii' } },
      { gruppi: ['selvatici'], taxon: { scientifico: 'Specie che non c\'è' } },
    ];
    for (const f of casi) {
      expect(conteggio(f)).toBe(icone(f).length);
      expect(elenco(f).map((o) => o.id)).toEqual(icone(f).map((o) => o.id));
    }
    expect(conteggio(casi[4])).toBe(0);
    nascoste.nascondi({ scientifico: 'Larus audouinii' }); // nascosta: sparisce da tutte e tre, anche se scelta
    for (const f of casi.slice(0, 4)) expect(icone(f).some((o) => o.nomeScientifico === 'Larus audouinii')).toBe(false);
  });
  it("l'elenco delle specie è fatto delle stesse osservazioni: la somma è il conteggio", () => {
    for (const f of [{ gruppi: ['selvatici'] }, { gruppi: ['rare'] }, { gruppi: ['selvatici'], taxon: { scientifico: 'Larus audouinii' } }]) {
      const specie = specieDalleOsservazioni(filtraOsservazioni(tutte, f), 50);
      expect(specie.reduce((n, x) => n + x.osservazioni, 0)).toBe(conteggio(f));
    }
    const rare = specieDalleOsservazioni(filtraOsservazioni(tutte, { gruppi: ['rare'] }));
    expect(rare.map((x) => [x.scientifico, x.osservazioni, x.rara])).toEqual([['Larus audouinii', 2, true], ['Neophron percnopterus', 1, true]]);
    expect(rare[0].inat).toBe(100); // il taxon di iNaturalist serve alla heatmap
  });
  it("una specie rara lo è per tutte le sue osservazioni, anche se una fonte non dice lo stato", () => {
    const senzaStato = { ...gbif[0], id: 99, rara: false, fonte: 'Observation.org' }; // stesso gabbiano corso, senza categoria
    const f = { gruppi: ['rare'] };
    expect(filtraOsservazioni([...tutte, senzaStato], f).filter((o) => o.nomeScientifico === 'Larus audouinii')).toHaveLength(3);
    expect(filtraOsservazioni([senzaStato], f)).toHaveLength(0); // da sola non basta
  });
  it('la camoscio e le altre specie di Orme si riconoscono anche con il nome della fonte diverso', () => {
    const o = { animale: 'camoscio', nomeScientifico: 'Rupicapra rupicapra', classe: 'Mammalia', specie: 'Camoscio' };
    expect(osservazioneAmmessa(o, { taxon: { scientifico: 'Rupicapra pyrenaica' }, gruppi: ['selvatici'] })).toBe(true);
  });
});
